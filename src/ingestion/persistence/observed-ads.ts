import { createHash } from "node:crypto";
import { db } from "@/db/client";
import { createAdObservation } from "./ad-observations";
import { reconcileAdCards } from "./ad-cards";
import { reconcileAdMedia } from "./ad-media";
import { upsertAd } from "./ads";
import { reconcileCardMedia } from "./card-media";
import { validateSourceAndPreparedMediaConsistency } from "./consistency";
import { saveRawIngestionItem } from "./raw-items";
import { saveSourceAccountObservation } from "./source-account-observations";
import { saveAdTransparencyObservations } from "./ad-transparency-observations";
import { projectAd, projectSourceAccount } from "@/discovery/projection";
import {
  PreparedMediaMismatchError,
  type DbOrTx,
  type PersistObservedAdInput,
  type PersistObservedAdResult,
  type PersistPreparedObservedAdInput,
  type PersistPreparedObservedAdResult,
} from "./types";

/**
 * Persists an already-prepared observed ad in ONE short, atomic database transaction.
 *
 * This is the PRIMARY / PREFERRED single-item database persistence API.
 *
 * Atomic Transaction Scope (Phase B):
 *  1. validateSourceAndPreparedMediaConsistency (ensures prepared media belongs to this SourceAd)
 *  2. saveRawIngestionItem (raw payload archive)
 *  3. upsertAd (canonical ad upsert + ownership validation)
 *  4. reconcileAdCards (deterministic card upsert and stale-card cleanup)
 *  5. reconcileAdMedia (direct ad media snapshot)
 *  6. reconcileCardMedia (card media snapshot by (ad_id, position) + stale card cleanup)
 *  7. createAdObservation (parent observation event)
 *  8. saveSourceAccountObservation (mutable account metadata observation)
 *  9. saveAdTransparencyObservations (observation-owned regional transparency rows)
 *
 * Invariants (Refined Observation Doctrine):
 *  - ZERO network calls (no HTTP, no DNS, no R2) occur inside this transaction.
 *  - All canonical ad/card/media mutations complete before observational evidence is appended.
 *    ad_observation is the parent observation event; observation-owned child facts such as
 *    transparency are written immediately afterward inside the same atomic transaction.
 *  - If any step fails, ALL database mutations roll back atomically.
 *  - R2 objects created in Phase A remain intact on rollback (content-addressed, globally reusable).
 *  - Ingestion run row lives outside this transaction and survives.
 */
export async function persistPreparedObservedAd(
  input: PersistPreparedObservedAdInput,
  executor?: DbOrTx,
): Promise<PersistPreparedObservedAdResult> {
  // Pre-flight consistency validation before opening / executing transaction
  validateSourceAndPreparedMediaConsistency(input.ad, input.preparedMedia);

  const executeAtomicPersistence = async (
    tx: DbOrTx,
  ): Promise<PersistPreparedObservedAdResult> => {
    // 1. Save raw payload (part of atomic item transaction)
    const payloadHash =
      typeof input.rawPayloadHash === "string" &&
      input.rawPayloadHash.trim().length > 0
        ? input.rawPayloadHash.trim()
        : createHash("sha256")
            .update(JSON.stringify(input.rawPayload ?? {}))
            .digest("hex");

    const rawItem = await saveRawIngestionItem(
      {
        ingestionRunId: input.ingestionRunId,
        sourceItemId: input.ad.sourceAdId,
        payload: input.rawPayload,
        payloadHash,
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
    const adId = adResult.ad.id;

    // 3. Reconcile ad cards (DCO / Carousel / multi-card snapshots)
    const cardResult = await reconcileAdCards(
      {
        adId,
        cards: input.ad.cards ?? [],
      },
      tx,
    );

    // 4. Reconcile direct ad media
    const directMediaResult = await reconcileAdMedia(
      {
        adId,
        media: input.preparedMedia.directMedia,
      },
      tx,
    );

    // 5. Reconcile card media by matching card position -> ad_card row
    const cardMapByPosition = new Map<number, string>();
    for (const card of cardResult.cards) {
      cardMapByPosition.set(card.position, card.id);
    }

    let cardRelationshipsCount = 0;
    let deletedCardMediaCount = 0;
    const processedCardPositions = new Set<number>();

    for (const cardMediaItem of input.preparedMedia.cardMedia) {
      const cardId = cardMapByPosition.get(cardMediaItem.cardPosition);
      if (!cardId) {
        throw new PreparedMediaMismatchError(
          `Cannot persist prepared card media: Card at position ${cardMediaItem.cardPosition} does not exist in database for ad "${adId}".`,
          {
            sourceAdId: input.ad.sourceAdId,
            cardPosition: cardMediaItem.cardPosition,
          },
        );
      }

      const cardRes = await reconcileCardMedia(
        {
          adCardId: cardId,
          media: cardMediaItem.media,
        },
        tx,
      );

      cardRelationshipsCount += cardRes.relationships.length;
      deletedCardMediaCount += cardRes.deletedCount;
      processedCardPositions.add(cardMediaItem.cardPosition);
    }

    // 6. Ensure persisted cards omitted from prepared.cardMedia have their media cleared
    for (const card of cardResult.cards) {
      if (!processedCardPositions.has(card.position)) {
        const clearRes = await reconcileCardMedia(
          {
            adCardId: card.id,
            media: [],
          },
          tx,
        );
        deletedCardMediaCount += clearRes.deletedCount;
      }
    }

    // 7. Create observation (state marker for this item snapshot)
    const observation = await createAdObservation(
      {
        adId,
        ingestionRunId: input.ingestionRunId,
        observedActive: input.ad.active ?? null,
        snapshotHash: input.snapshotHash ?? null,
        observedAt: input.observedAt,
        metadata: input.observationMetadata ?? {},
      },
      tx,
    );

    // 8. Persist source account observation if detailed metadata exists
    let accountObservationId: string | null = null;
    if (input.ad.accountObservation) {
      accountObservationId = await saveSourceAccountObservation(
        {
          sourceAccountId: input.sourceAccountId,
          ingestionRunId: input.ingestionRunId,
          observedAt: input.observedAt,
          data: input.ad.accountObservation,
        },
        tx,
      );
    }

    // 9. Persist regional transparency observations linked to this ad observation
    let transparencyObservationCount = 0;
    if (
      input.ad.transparencyObservations &&
      input.ad.transparencyObservations.length > 0
    ) {
      const savedTrans = await saveAdTransparencyObservations(
        {
          adObservationId: observation.id,
          transparencyObservations: input.ad.transparencyObservations,
        },
        tx,
      );
      transparencyObservationCount = savedTrans.length;
    }

    return {
      rawItem,
      ad: adResult.ad,
      adOutcome: adResult.outcome,
      cards: cardResult.cards,
      directMediaCount: directMediaResult.relationships.length,
      cardMediaCount: cardRelationshipsCount,
      deletedDirectMediaCount: directMediaResult.deletedCount,
      deletedCardMediaCount,
      observation,
      transparencyObservationCount,
      accountObservationId,
    };
  };

  let result: PersistPreparedObservedAdResult;

  // If already inside an existing transaction, participate directly
  if (executor && "rollback" in executor) {
    result = await executeAtomicPersistence(executor);
  } else {
    // Otherwise, wrap in an atomic per-item transaction
    const client = executor ?? db;
    result = await client.transaction(async (tx) => {
      return executeAtomicPersistence(tx);
    });
  }

  // Post-commit: project ad into ad_discovery_index safely (non-blocking for evidence)
  try {
    await projectAd(result.ad.id);
    if (result.accountObservationId) {
      await projectSourceAccount(input.sourceAccountId);
    }
  } catch (err) {
    console.error(`[Projector] Post-commit discovery projection failed for ad ${result.ad.id}:`, err);
  }

  return result;
}

/**
 * Lower-level legacy persistence primitive without media orchestration support.
 *
 * NOTE: For full M0 ad ingestion with media, use `persistPreparedObservedAd`
 * or `ingestNormalizedAd`.
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

    // 2. Upsert ad
    const adResult = await upsertAd(
      {
        sourceAccountId: input.sourceAccountId,
        ad: input.ad,
      },
      tx,
    );
    const adId = adResult.ad.id;

    // 3. Reconcile ad cards
    const cardResult = await reconcileAdCards(
      {
        adId,
        cards: input.ad.cards ?? [],
      },
      tx,
    );

    // 4. Create observation
    const observation = await createAdObservation(
      {
        adId,
        ingestionRunId: input.ingestionRunId,
        observedActive: input.ad.active ?? null,
        snapshotHash: input.snapshotHash ?? null,
        observedAt: input.observedAt,
        metadata: input.observationMetadata ?? {},
      },
      tx,
    );

    // 5. Persist source account observation if detailed metadata exists
    let accountObservationId: string | null = null;
    if (input.ad.accountObservation) {
      accountObservationId = await saveSourceAccountObservation(
        {
          sourceAccountId: input.sourceAccountId,
          ingestionRunId: input.ingestionRunId,
          observedAt: input.observedAt,
          data: input.ad.accountObservation,
        },
        tx,
      );
    }

    // 6. Persist regional transparency observations linked to this ad observation
    let transparencyObservationCount = 0;
    if (
      input.ad.transparencyObservations &&
      input.ad.transparencyObservations.length > 0
    ) {
      const savedTrans = await saveAdTransparencyObservations(
        {
          adObservationId: observation.id,
          transparencyObservations: input.ad.transparencyObservations,
        },
        tx,
      );
      transparencyObservationCount = savedTrans.length;
    }

    return {
      rawItem,
      ad: adResult.ad,
      adOutcome: adResult.outcome,
      cards: cardResult.cards,
      observation,
      transparencyObservationCount,
      accountObservationId,
    };
  };

  let result: PersistObservedAdResult;

  if (executor && "rollback" in executor) {
    result = await executeItemPersistence(executor);
  } else {
    const client = executor ?? db;
    result = await client.transaction(async (tx) => {
      return executeItemPersistence(tx);
    });
  }

  // Post-commit: project ad into ad_discovery_index safely (non-blocking for evidence)
  try {
    await projectAd(result.ad.id);
    if (result.accountObservationId) {
      await projectSourceAccount(input.sourceAccountId);
    }
  } catch (err) {
    console.error(`[Projector] Post-commit discovery projection failed for ad ${result.ad.id}:`, err);
  }

  return result;
}
