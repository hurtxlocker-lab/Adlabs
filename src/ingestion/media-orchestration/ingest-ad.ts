import { createHash } from "node:crypto";
import { persistPreparedObservedAd as defaultPersistPreparedObservedAd } from "@/ingestion/persistence";
import { prepareAdMedia as defaultPrepareAdMedia } from "./prepare-ad-media";
import { MissingRepresentativeMediaError } from "./errors";
import type {
  IngestNormalizedAdDependencies,
  IngestNormalizedAdInput,
  IngestNormalizedAdResult,
} from "./types";

/**
 * End-to-End Single-Ad Ingestion Pipeline (Step 4E / Phase 4G.1).
 *
 * Coordinates the complete two-phase lifecycle for a single normalized ad:
 *
 * PHASE A — External Media Preparation (No DB Transaction):
 *  1. Resolves and downloads unique direct & card media candidates.
 *  2. Computes streaming SHA-256 and validates magic-byte integrity.
 *  3. Stores new physical objects in Cloudflare R2 (or verifies existing by SHA-256).
 *  4. Guarantees temp-file cleanup on disk.
 *
 * PHASE A.5 — Canonical Media Invariant Enforcement:
 *  - If media preparation fails OR resolves 0 valid media assets:
 *    - STORES NOTHING (0 rows in raw_ingestion_items, ads, ad_cards, ad_media, ad_observations).
 *    - Rejects canonical promotion by throwing MissingRepresentativeMediaError / MediaPreparationError.
 *    - Run-level failure accounting handles stage and sanitized error tracking.
 *
 * PHASE B — Atomic Single-Item Database Transaction (Zero Network Calls):
 *  1. Validates SourceAd <-> PreparedAdMedia consistency.
 *  2. Saves raw ingestion item (only for verified creative-bearing ads).
 *  3. Upserts canonical ad record.
 *  4. Reconciles ad cards snapshot.
 *  5. Reconciles direct ad media snapshot.
 *  6. Reconciles card media snapshot by (ad_id, position).
 *  7. Creates run observation (strictly last).
 *
 * Invariants:
 *  - NO REPRESENTATIVE CREATIVE -> ZERO PERSISTENCE FOR THAT ITEM.
 *  - If Phase A fails: Zero DB mutations occur (no raw item, no canonical ad).
 *  - If Phase B fails: All canonical DB mutations roll back atomically.
 *  - No HTTP / R2 operations execute while a DB transaction is open.
 */
export async function ingestNormalizedAd(
  input: IngestNormalizedAdInput,
  dependencies?: IngestNormalizedAdDependencies,
): Promise<IngestNormalizedAdResult> {
  const prepareFn = dependencies?.prepareAdMedia ?? defaultPrepareAdMedia;
  const persistFn =
    dependencies?.persistPreparedObservedAd ?? defaultPersistPreparedObservedAd;

  const payloadHash =
    typeof input.rawPayloadHash === "string" &&
    input.rawPayloadHash.trim().length > 0
      ? input.rawPayloadHash.trim()
      : createHash("sha256")
          .update(JSON.stringify(input.rawPayload ?? {}))
          .digest("hex");

  // Phase A: External Media Preparation (Pure I/O, no DB transaction)
  const preparedMedia = await prepareFn(
    input.sourceAd,
    dependencies?.prepareOptions,
  );

  // Phase A.5: Canonical Media Invariant Enforcement (Total Prepared Media > 0)
  const totalPreparedMedia =
    preparedMedia.directMedia.length +
    preparedMedia.cardMedia.reduce((acc, cm) => acc + cm.media.length, 0);

  if (totalPreparedMedia === 0) {
    throw new MissingRepresentativeMediaError(
      input.sourceAd.sourceAdId,
      `Cannot promote ad "${input.sourceAd.sourceAdId}": no valid media assets could be extracted or prepared.`,
    );
  }

  // Phase B: Database Atomic Persistence (Single short DB transaction, only entered for valid media)
  const persistResult = await persistFn(
    {
      ingestionRunId: input.ingestionRunId,
      sourceAccountId: input.sourceAccountId,
      ad: input.sourceAd,
      rawPayload: input.rawPayload,
      rawPayloadHash: payloadHash,
      preparedMedia,
      snapshotHash: input.snapshotHash,
      observationMetadata: input.observationMetadata,
    },
    dependencies?.db,
  );

  return {
    adId: persistResult.ad.id,
    adOutcome: persistResult.adOutcome,
    rawItemId: persistResult.rawItem.id,
    observationId: persistResult.observation.id,
    cardsCount: persistResult.cards.length,
    directMediaCount: persistResult.directMediaCount,
    cardMediaCount: persistResult.cardMediaCount,
    deletedDirectMediaCount: persistResult.deletedDirectMediaCount,
    deletedCardMediaCount: persistResult.deletedCardMediaCount,
  };
}
