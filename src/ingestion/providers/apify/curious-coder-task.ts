/**
 * src/ingestion/providers/apify/curious-coder-task.ts
 *
 * Apify saved-task adapter for the Curious Coder Meta scraper.
 *
 * Responsibilities:
 *   1. Execute the saved Apify task (DO NOT reconstruct actor input).
 *   2. Wait for run completion up to timeoutSeconds.
 *   3. Retrieve raw dataset items.
 *   4. Enforce an independent local hard cap on item count.
 *   5. Return raw provider objects — no parsing, normalization, or DB/R2 operations.
 *
 * Design invariants:
 *   - No automatic retries.
 *   - Failed runs throw immediately.
 *   - No actor input override; the saved task's input is used as-is.
 *   - Token is never logged.
 *   - Dataset items are returned unmodified (passthrough).
 */

import {
  ApifyDatasetError,
  ApifyTaskRunError,
} from "./errors";
import type {
  ApifyClientInterface,
  FetchCuriousCoderTaskItemsInput,
  FetchCuriousCoderTaskItemsResult,
} from "./types";

/** Default run timeout: 5 minutes. */
const DEFAULT_TIMEOUT_SECONDS = 300;

/**
 * Executes the saved Apify task identified by `taskId`, waits for completion,
 * retrieves dataset items, and enforces a local hard cap.
 *
 * This adapter does NOT:
 *   - Parse Curious Coder payload fields.
 *   - Normalize into SourceAd.
 *   - Download media.
 *   - Write R2 or PostgreSQL.
 *
 * Compose externally with runCuriousCoderIngestion:
 *
 *   const { items } = await fetchCuriousCoderTaskItems({ taskId, limit, client });
 *   const result = await runCuriousCoderIngestion({ ..., providerItems: items });
 *
 * @param input  Task execution parameters.
 * @param client Apify client — real ApifyClient or a test fake.
 * @returns      Metadata + raw items capped to `limit`.
 * @throws       ApifyTaskRunError if the run does not SUCCEED.
 * @throws       ApifyDatasetError if the dataset cannot be retrieved.
 */
export async function fetchCuriousCoderTaskItems(
  input: FetchCuriousCoderTaskItemsInput,
  client: ApifyClientInterface,
): Promise<FetchCuriousCoderTaskItemsResult> {
  const { taskId, limit } = input;
  const timeoutSeconds = input.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;

  // Step 1: Start the saved task and wait for completion.
  // `call()` blocks until the run finishes or `waitSecs` is exceeded.
  // DO NOT pass `input` override — use the saved task's configured input as-is.
  let run: { id: string; status: string; defaultDatasetId?: string | null };
  try {
    run = await client.task(taskId).call({ waitSecs: timeoutSeconds });
  } catch (err) {
    // Wrap network/SDK errors — do not expose token in messages.
    throw new ApifyTaskRunError({
      message: `Apify task run failed to start or timed out for task "${taskId}": ${err instanceof Error ? err.message : String(err)}`,
      taskId,
      runId: null,
      runStatus: null,
    });
  }

  const runId = run.id;
  const runStatus = run.status;

  // Step 2: Validate the run outcome.
  if (runStatus !== "SUCCEEDED") {
    throw new ApifyTaskRunError({
      message: `Apify task "${taskId}" run "${runId}" did not SUCCEED. Final status: "${runStatus}".`,
      taskId,
      runId,
      runStatus,
    });
  }

  // Step 3: Validate that a dataset ID is available.
  const datasetId = run.defaultDatasetId;
  if (!datasetId || datasetId.trim().length === 0) {
    throw new ApifyDatasetError({
      message: `Apify run "${runId}" for task "${taskId}" SUCCEEDED but has no defaultDatasetId.`,
      taskId,
      runId,
      datasetId: null,
    });
  }

  // Step 4: Retrieve dataset items.
  let rawItems: unknown[];
  try {
    const listResult = await client.dataset(datasetId).listItems({
      limit: Math.max(limit, 1),
    });
    rawItems = listResult.items;
  } catch (err) {
    throw new ApifyDatasetError({
      message: `Failed to retrieve dataset "${datasetId}" for task "${taskId}" run "${runId}": ${err instanceof Error ? err.message : String(err)}`,
      taskId,
      runId,
      datasetId,
    });
  }

  const datasetItemCount = rawItems.length;

  // Step 5: Enforce local hard cap — independent of task configuration.
  const items = rawItems.slice(0, limit);

  return {
    runId,
    runStatus,
    datasetId,
    datasetItemCount,
    items,
  };
}
