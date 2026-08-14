import { redactUrl } from "@/ingestion/media/url-safety";
import { ingestNormalizedAd as defaultIngestNormalizedAd } from "@/ingestion/media-orchestration";
import {
  MediaPreparationError,
  PreparedCardNotFoundError,
} from "@/ingestion/media-orchestration/errors";
import {
  AdSourceAccountConflictError,
  DuplicateAdObservationError,
  DuplicateCardPositionError,
  ensureBrand as defaultEnsureBrand,
  ensureSourceAccount as defaultEnsureSourceAccount,
  finishIngestionRun as defaultFinishIngestionRun,
  MediaAssetConflictError,
  PreparedMediaMismatchError,
  startIngestionRun as defaultStartIngestionRun,
} from "@/ingestion/persistence";
import {
  normalizeCuriousCoderAd as defaultNormalizeCuriousCoderAd,
  safeParseCuriousCoderItem as defaultSafeParseCuriousCoderItem,
} from "@/ingestion/sources/meta/curious-coder";
import type { SourceAd } from "@/ingestion/types";
import {
  IngestionRunFatalError,
  ItemAdvertiserMismatchError,
} from "./errors";
import type {
  IngestionFailureStage,
  IngestionItemFailure,
  IngestionRunResult,
  IngestionRunStatus,
  RunCuriousCoderDependencies,
  RunCuriousCoderIngestionInput,
} from "./types";

/**
 * Sanitizes an error message by stripping sensitive URL parameters / signed tokens.
 */
function sanitizeErrorMessage(message: string): string {
  // Replace full URLs with their redacted equivalents
  return message.replace(/https?:\/\/[^\s"'`]+/g, (url) => redactUrl(url));
}

/**
 * Conservative failure-stage classification based strictly on reliable typed error contracts.
 * Does NOT guess from message text or stack traces.
 */
function classifyIngestionError(err: unknown): IngestionFailureStage {
  if (err instanceof MediaPreparationError) {
    return "prepare_media";
  }

  if (
    err instanceof MediaAssetConflictError ||
    err instanceof DuplicateAdObservationError ||
    err instanceof PreparedMediaMismatchError ||
    err instanceof AdSourceAccountConflictError ||
    err instanceof DuplicateCardPositionError ||
    err instanceof PreparedCardNotFoundError
  ) {
    return "persist";
  }

  return "ingest";
}

/**
 * Primary Ingestion Run & Batch Orchestrator for Curious Coder Meta Library items (Step 4F).
 *
 * Lifecycle:
 *  1. Ensures brand and source account (pre-run ownership mismatch is RUN-FATAL).
 *  2. Starts ingestion_runs row in "RUNNING" state.
 *  3. Iterates over provider items sequentially:
 *     - increments sourceItemsCount
 *     - parses item (safeParseCuriousCoderItem)
 *     - normalizes item (normalizeCuriousCoderAd)
 *     - verifies normalized advertiser matches target source account
 *     - executes atomic single-item pipeline (ingestNormalizedAd)
 *     - accumulates truthful counters and isolates item-level failures
 *  4. Derives final status (SUCCEEDED, PARTIAL, FAILED).
 *  5. Finalizes ingestion run via finishIngestionRun exactly once.
 *  6. Returns structured IngestionRunResult.
 */
export async function runCuriousCoderIngestion(
  input: RunCuriousCoderIngestionInput,
  dependencies?: RunCuriousCoderDependencies,
): Promise<IngestionRunResult> {
  const ensureBrandFn = dependencies?.ensureBrand ?? defaultEnsureBrand;
  const ensureSourceAccountFn =
    dependencies?.ensureSourceAccount ?? defaultEnsureSourceAccount;
  const startRunFn = dependencies?.startIngestionRun ?? defaultStartIngestionRun;
  const finishRunFn =
    dependencies?.finishIngestionRun ?? defaultFinishIngestionRun;
  const parseFn = dependencies?.parseItem ?? defaultSafeParseCuriousCoderItem;
  const normalizeFn =
    dependencies?.normalizeAd ?? defaultNormalizeCuriousCoderAd;
  const ingestFn =
    dependencies?.ingestNormalizedAd ?? defaultIngestNormalizedAd;

  // 1. Setup Brand & Source Account (Run-Fatal if configuration / ownership fails)
  const brand = await ensureBrandFn(input.brand, dependencies?.db);

  const sourceAccount = await ensureSourceAccountFn(
    {
      brandId: brand.id,
      source: "meta",
      sourcePageId: input.sourceAccount.sourcePageId,
      sourcePageUrl: input.sourceAccount.sourcePageUrl,
      displayName: input.sourceAccount.displayName,
      metadata: input.sourceAccount.metadata,
    },
    dependencies?.db,
  );

  // 2. Start Ingestion Run (Initial status: RUNNING)
  const runRow = await startRunFn(
    {
      source: "meta",
      sourceAccountId: sourceAccount.id,
      metadata: {
        ...(input.ingestionRunMetadata ?? {}),
        ...(input.sourceRunId ? { sourceRunId: input.sourceRunId } : {}),
        ...(input.sourceMetadata ? { sourceMetadata: input.sourceMetadata } : {}),
      },
    },
    dependencies?.db,
  );

  const failures: IngestionItemFailure[] = [];
  let sourceItemsCount = 0;
  let createdAdsCount = 0;
  let updatedAdsCount = 0;

  // 3. Process items sequentially with item-level failure isolation
  try {
    for (let i = 0; i < input.providerItems.length; i++) {
      sourceItemsCount++;
      const rawItem = input.providerItems[i];

      // Stage A: Provider Schema Validation
      const parseResult = parseFn(rawItem);
      if (!parseResult.success) {
        failures.push({
          itemIndex: i,
          stage: "parse",
          errorCode: parseResult.error.name,
          message: sanitizeErrorMessage(parseResult.error.message),
        });
        continue;
      }

      // Stage B: Domain Normalization
      let sourceAd: SourceAd;
      try {
        sourceAd = normalizeFn(parseResult.data, rawItem);
      } catch (normErr) {
        failures.push({
          itemIndex: i,
          sourceAdId: parseResult.data.ad_archive_id,
          stage: "normalize",
          errorCode: normErr instanceof Error ? normErr.name : undefined,
          message: sanitizeErrorMessage(
            normErr instanceof Error ? normErr.message : String(normErr),
          ),
        });
        continue;
      }

      // Stage C: Account Ownership Verification
      if (
        sourceAd.advertiser.sourcePageId !== input.sourceAccount.sourcePageId
      ) {
        const mismatchErr = new ItemAdvertiserMismatchError(
          sourceAd.advertiser.sourcePageId,
          input.sourceAccount.sourcePageId,
          sourceAd.sourceAdId,
        );
        failures.push({
          itemIndex: i,
          sourceAdId: sourceAd.sourceAdId,
          stage: "normalize",
          errorCode: mismatchErr.name,
          message: mismatchErr.message,
        });
        continue;
      }

      // Stage D: Atomic Single-Ad Pipeline
      try {
        const ingestResult = await ingestFn(
          {
            ingestionRunId: runRow.id,
            sourceAccountId: sourceAccount.id,
            sourceAd,
            rawPayload: rawItem,
          },
          { db: dependencies?.db },
        );

        if (ingestResult.adOutcome === "created") {
          createdAdsCount++;
        } else {
          updatedAdsCount++;
        }
      } catch (ingestErr) {
        const stage = classifyIngestionError(ingestErr);
        failures.push({
          itemIndex: i,
          sourceAdId: sourceAd.sourceAdId,
          stage,
          errorCode: ingestErr instanceof Error ? ingestErr.name : undefined,
          message: sanitizeErrorMessage(
            ingestErr instanceof Error ? ingestErr.message : String(ingestErr),
          ),
        });
        continue;
      }
    }
  } catch (unexpectedLoopErr) {
    // Catastrophic failure during iteration: best-effort finalize as FAILED before throwing
    const emergencyStatus: IngestionRunStatus =
      createdAdsCount + updatedAdsCount > 0 ? "PARTIAL" : "FAILED";
    try {
      await finishRunFn(
        {
          ingestionRunId: runRow.id,
          status: emergencyStatus,
          sourceItemsCount,
          newAdsCount: createdAdsCount,
          updatedAdsCount,
          mediaDownloadedCount: 0,
          mediaDuplicateCount: 0,
          mediaFailedCount: 0,
          bytesDownloaded: BigInt(0),
          uniqueBytesStored: BigInt(0),
          errorSummary: sanitizeErrorMessage(
            unexpectedLoopErr instanceof Error
              ? unexpectedLoopErr.message
              : String(unexpectedLoopErr),
          ),
        },
        dependencies?.db,
      );
    } catch {
      // Ignore secondary finalization failure to preserve primary unexpectedLoopErr
    }

    throw new IngestionRunFatalError(
      `Unexpected fatal error during item processing loop: ${
        unexpectedLoopErr instanceof Error
          ? unexpectedLoopErr.message
          : String(unexpectedLoopErr)
      }`,
      {
        ingestionRunId: runRow.id,
        originalError: unexpectedLoopErr,
      },
    );
  }

  // 4. Derive Final Status
  const failedItemsCount = failures.length;
  const succeededItemsCount = createdAdsCount + updatedAdsCount;

  let finalStatus: IngestionRunStatus;
  if (failedItemsCount === 0) {
    finalStatus = "SUCCEEDED";
  } else if (succeededItemsCount > 0) {
    finalStatus = "PARTIAL";
  } else {
    finalStatus = "FAILED";
  }

  // 5. Finalize Ingestion Run
  const errorSummary =
    failures.length > 0
      ? `Failed ${failures.length} of ${sourceItemsCount} items (${failures
          .slice(0, 5)
          .map((f) => `[item ${f.itemIndex}: ${f.stage}]`)
          .join(", ")}${failures.length > 5 ? ", ..." : ""})`
      : null;

  try {
    await finishRunFn(
      {
        ingestionRunId: runRow.id,
        status: finalStatus,
        sourceItemsCount,
        newAdsCount: createdAdsCount, // mapped to ingestion_runs.new_ads_count
        updatedAdsCount, // mapped to ingestion_runs.updated_ads_count
        mediaDownloadedCount: 0, // uninstrumented in Step 4F
        mediaDuplicateCount: 0, // uninstrumented in Step 4F
        mediaFailedCount: 0, // uninstrumented in Step 4F
        bytesDownloaded: BigInt(0), // uninstrumented in Step 4F
        uniqueBytesStored: BigInt(0), // uninstrumented in Step 4F
        errorSummary,
        metadata: {
          ...(input.ingestionRunMetadata ?? {}),
          ...(input.sourceRunId ? { sourceRunId: input.sourceRunId } : {}),
          ...(input.sourceMetadata ? { sourceMetadata: input.sourceMetadata } : {}),
          failureCount: failedItemsCount,
          succeededCount: succeededItemsCount,
        },
      },
      dependencies?.db,
    );
  } catch (finishErr) {
    throw new IngestionRunFatalError(
      `Failed to finalize ingestion run "${runRow.id}" in status "${finalStatus}": ${
        finishErr instanceof Error ? finishErr.message : String(finishErr)
      }`,
      {
        ingestionRunId: runRow.id,
        originalError: finishErr,
      },
    );
  }

  return {
    ingestionRunId: runRow.id,
    status: finalStatus,
    sourceAccountId: sourceAccount.id,
    brandId: brand.id,
    sourceItemsCount,
    succeededItemsCount,
    failedItemsCount,
    createdAdsCount,
    updatedAdsCount,
    failures,
  };
}
