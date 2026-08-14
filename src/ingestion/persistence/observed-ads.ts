import { db } from "@/db/client";
import { createAdObservation } from "./ad-observations";
import { reconcileAdCards } from "./ad-cards";
import { upsertAd } from "./ads";
import { saveRawIngestionItem } from "./raw-items";
import type {
  DbOrTx,
  PersistObservedAdInput,
  PersistObservedAdResult,
} from "./types";

/**
 * Persists an observed ad within a short, atomic per-item transaction.
 *
 * Atomic Transaction Scope:
 *  1. saveRawIngestionItem (raw payload archive)
 *  2. upsertAd (canonical ad upsert + ownership validation)
 *  3. reconcileAdCards (deterministic card upsert and stale-card cleanup)
 *  4. createAdObservation (append-only run observation)
 *
 * Invariants:
 *  - If ad persistence, card reconciliation, or observation fails, the entire
 *    transaction rolls back atomically (including the raw item and any card mutations).
 *  - The ingestion run itself lives outside this transaction and survives.
 *  - Observation creation is the final step; if cards fail, no observation is created.
 *  - Run counters are not updated here; they are managed at the run level.
 *  - Media collections remain deferred for subsequent pipeline steps.
 */
export async function persistObservedAd(
  input: PersistObservedAdInput,
  executor?: DbOrTx,
): Promise<PersistObservedAdResult> {
  const executeItemPersistence = async (
    tx: DbOrTx,
  ): Promise<PersistObservedAdResult> => {
    // 1. Save raw payload
    const rawItem = await saveRawIngestionItem(
      {
        ingestionRunId: input.ingestionRunId,
        sourceItemId: input.ad.sourceAdId,
        payload: input.rawPayload,
        payloadHash: input.rawPayloadHash,
      },
      tx,
    );

    // 2. Upsert canonical ad
    const adResult = await upsertAd(
      {
        sourceAccountId: input.sourceAccountId,
        ad: input.ad,
      },
      tx,
    );

    // 3. Reconcile ad cards (DCO / Carousel / multi-card snapshots)
    const cardResult = await reconcileAdCards(
      {
        adId: adResult.ad.id,
        cards: input.ad.cards ?? [],
      },
      tx,
    );

    // 4. Create observation (final successful state marker for this item)
    const observation = await createAdObservation(
      {
        adId: adResult.ad.id,
        ingestionRunId: input.ingestionRunId,
        observedActive: input.ad.active ?? null,
        snapshotHash: input.snapshotHash ?? null,
        metadata: input.observationMetadata ?? {},
      },
      tx,
    );

    return {
      rawItem,
      ad: adResult.ad,
      adOutcome: adResult.outcome,
      cards: cardResult.cards,
      observation,
    };
  };

  // If already inside an existing transaction, participate directly
  if (executor && "rollback" in executor) {
    return executeItemPersistence(executor);
  }

  // Otherwise, wrap in an atomic per-item transaction
  const client = executor ?? db;
  return client.transaction(async (tx) => {
    return executeItemPersistence(tx);
  });
}
