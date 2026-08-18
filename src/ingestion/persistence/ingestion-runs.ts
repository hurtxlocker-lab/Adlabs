import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { ingestionRuns } from "@/db/schema";
import {
  type DbOrTx,
  type FinishIngestionRunInput,
  type IngestionRunRow,
  IngestionRunStateError,
  type StartIngestionRunInput,
} from "./types";
import {
  validateNonEmptyString,
  validateNonNegativeBigInt,
  validateNonNegativeInt,
  validateUuid,
} from "./validation";

/**
 * Starts a new ingestion run in the RUNNING state.
 *
 * Rules:
 *  - Initial status is strictly RUNNING.
 *  - started_at defaults to DB timestamp.
 *  - All counters initialize to schema defaults (0 / 0n).
 */
export async function startIngestionRun(
  input: StartIngestionRunInput,
  executor?: DbOrTx,
): Promise<IngestionRunRow> {
  const source = validateNonEmptyString(input.source, "source");
  const sourceAccountId = validateUuid(
    input.sourceAccountId,
    "sourceAccountId",
  );

  const client = executor ?? db;

  const [inserted] = await client
    .insert(ingestionRuns)
    .values({
      source,
      sourceAccountId,
      status: "RUNNING",
      startedAt: input.startedAt ?? sql`now()`,
      metadata: input.metadata ?? {},
    })
    .returning();

  if (!inserted) {
    throw new Error("Failed to insert new ingestion run");
  }

  return inserted;
}

/**
 * Finalizes an active RUNNING ingestion run.
 *
 * Concurrency & state invariants:
 *  - Only an ingestion run currently in RUNNING state can be finalized.
 *  - finished_at is set to database-side current timestamp (sql`now()`).
 *  - Counters are validated for non-negative safe values before DB update.
 *  - Attempting to finalize an already-finalized or non-existent run throws IngestionRunStateError.
 */
export async function finishIngestionRun(
  input: FinishIngestionRunInput,
  executor?: DbOrTx,
): Promise<IngestionRunRow> {
  const ingestionRunId = validateUuid(
    input.ingestionRunId,
    "ingestionRunId",
  );

  // Validate allowed final statuses
  if (
    input.status !== "SUCCEEDED" &&
    input.status !== "PARTIAL" &&
    input.status !== "FAILED"
  ) {
    throw new IngestionRunStateError(
      `Invalid final status "${input.status}". Allowed final statuses are SUCCEEDED, PARTIAL, FAILED.`,
    );
  }

  // Validate integer counters
  const sourceItemsCount = validateNonNegativeInt(
    input.sourceItemsCount,
    "sourceItemsCount",
  );
  const newAdsCount = validateNonNegativeInt(
    input.newAdsCount,
    "newAdsCount",
  );
  const updatedAdsCount = validateNonNegativeInt(
    input.updatedAdsCount,
    "updatedAdsCount",
  );
  const mediaDownloadedCount = validateNonNegativeInt(
    input.mediaDownloadedCount,
    "mediaDownloadedCount",
  );
  const mediaDuplicateCount = validateNonNegativeInt(
    input.mediaDuplicateCount,
    "mediaDuplicateCount",
  );
  const mediaFailedCount = validateNonNegativeInt(
    input.mediaFailedCount,
    "mediaFailedCount",
  );

  // Validate bigint counters
  const bytesDownloaded = validateNonNegativeBigInt(
    input.bytesDownloaded,
    "bytesDownloaded",
  );
  const uniqueBytesStored = validateNonNegativeBigInt(
    input.uniqueBytesStored,
    "uniqueBytesStored",
  );

  const client = executor ?? db;

  // Atomic conditional update: only update if currently RUNNING
  const [updated] = await client
    .update(ingestionRuns)
    .set({
      status: input.status,
      finishedAt: input.finishedAt ?? sql`now()`,
      sourceItemsCount,
      newAdsCount,
      updatedAdsCount,
      mediaDownloadedCount,
      mediaDuplicateCount,
      mediaFailedCount,
      bytesDownloaded,
      uniqueBytesStored,
      errorSummary: input.errorSummary ?? null,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    })
    .where(
      and(
        eq(ingestionRuns.id, ingestionRunId),
        eq(ingestionRuns.status, "RUNNING"),
      ),
    )
    .returning();

  if (updated) {
    return updated;
  }

  // If no row updated, inspect current state for precise domain error reporting
  const [existing] = await client
    .select({
      id: ingestionRuns.id,
      status: ingestionRuns.status,
    })
    .from(ingestionRuns)
    .where(eq(ingestionRuns.id, ingestionRunId))
    .limit(1);

  if (!existing) {
    throw new IngestionRunStateError(
      `Ingestion run "${ingestionRunId}" does not exist`,
    );
  }

  throw new IngestionRunStateError(
    `Cannot finalize ingestion run "${ingestionRunId}": current status is "${existing.status}" (expected "RUNNING")`,
  );
}
