import { persistPreparedObservedAd as defaultPersistPreparedObservedAd } from "@/ingestion/persistence";
import { prepareAdMedia as defaultPrepareAdMedia } from "./prepare-ad-media";
import type {
  IngestNormalizedAdDependencies,
  IngestNormalizedAdInput,
  IngestNormalizedAdResult,
} from "./types";

/**
 * End-to-End Single-Ad Ingestion Pipeline (Step 4E).
 *
 * Coordinates the complete two-phase lifecycle for a single normalized ad:
 *
 * PHASE A — External Media Preparation (No DB Transaction):
 *  1. Resolves and downloads unique direct & card media candidates.
 *  2. Computes streaming SHA-256 and validates magic-byte integrity.
 *  3. Stores new physical objects in Cloudflare R2 (or verifies existing by SHA-256).
 *  4. Guarantees temp-file cleanup on disk.
 *
 * PHASE B — Atomic Single-Item Database Transaction (Zero Network Calls):
 *  1. Validates SourceAd <-> PreparedAdMedia consistency.
 *  2. Saves raw ingestion item.
 *  3. Upserts canonical ad record.
 *  4. Reconciles ad cards snapshot.
 *  5. Reconciles direct ad media snapshot.
 *  6. Reconciles card media snapshot by (ad_id, position).
 *  7. Creates run observation (strictly last).
 *
 * Invariants:
 *  - If Phase A fails: No DB transaction begins; zero DB effects.
 *  - If Phase B fails: All 7 DB mutations roll back atomically; R2 objects remain.
 *  - No HTTP / R2 operations execute while a DB transaction is open.
 *  - Ingestion run counters are NOT modified here (accumulated at outer batch level in Step 4F).
 */
export async function ingestNormalizedAd(
  input: IngestNormalizedAdInput,
  dependencies?: IngestNormalizedAdDependencies,
): Promise<IngestNormalizedAdResult> {
  const prepareFn = dependencies?.prepareAdMedia ?? defaultPrepareAdMedia;
  const persistFn =
    dependencies?.persistPreparedObservedAd ?? defaultPersistPreparedObservedAd;

  // Phase A: External Media Preparation (Pure I/O, no DB transaction)
  const preparedMedia = await prepareFn(
    input.sourceAd,
    dependencies?.prepareOptions,
  );

  // Phase B: Database Atomic Persistence (Single short DB transaction)
  const persistResult = await persistFn(
    {
      ingestionRunId: input.ingestionRunId,
      sourceAccountId: input.sourceAccountId,
      ad: input.sourceAd,
      rawPayload: input.rawPayload,
      rawPayloadHash: input.rawPayloadHash,
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
