import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import {
  type DbOrTx,
  reconcileAdMedia,
  reconcileCardMedia,
  validateUuid,
} from "@/ingestion/persistence";
import { AdNotFoundError, PreparedCardNotFoundError } from "./errors";
import type {
  PersistPreparedAdMediaInput,
  PersistPreparedAdMediaResult,
} from "./types";

/**
 * Phase B Media Orchestration:
 *
 * Persists already-prepared stored media relationships for an ad and its cards
 * in a short, atomic database transaction.
 *
 * Invariants:
 *  1. ZERO network calls (no HTTP, no R2) during Phase B.
 *  2. Atomic transaction: if any card or direct media reconciliation fails,
 *     all relationship mutations and inserted media_assets roll back.
 *  3. Card identity is resolved strictly by (ad_id, position).
 *  4. Stale direct media relationships are cleared if prepared.directMedia is empty or changed.
 *  5. Stale card media relationships are cleared for cards with empty prepared media or omitted cards.
 *  6. media_assets rows are shared across ads and NEVER deleted during reconciliation.
 */
export async function persistPreparedAdMedia(
  input: PersistPreparedAdMediaInput,
  executor?: DbOrTx,
): Promise<PersistPreparedAdMediaResult> {
  const adId = validateUuid(input.adId, "adId");
  const { prepared } = input;

  const runReconciliation = async (
    client: DbOrTx,
  ): Promise<PersistPreparedAdMediaResult> => {
    // 1. Verify ad exists
    const existingAd = await client
      .select({ id: schema.ads.id })
      .from(schema.ads)
      .where(eq(schema.ads.id, adId))
      .limit(1);

    if (existingAd.length === 0) {
      throw new AdNotFoundError(adId);
    }

    // 2. Reconcile direct ad media
    const adMediaResult = await reconcileAdMedia(
      {
        adId,
        media: prepared.directMedia,
      },
      client,
    );

    // 3. Reconcile card media by matching card position -> ad_card row
    const existingCards = await client
      .select({
        id: schema.adCards.id,
        position: schema.adCards.position,
      })
      .from(schema.adCards)
      .where(eq(schema.adCards.adId, adId));

    const cardMapByPosition = new Map<number, string>();
    for (const card of existingCards) {
      cardMapByPosition.set(card.position, card.id);
    }

    let cardRelationshipsCount = 0;
    let deletedCardMediaCount = 0;
    const processedCardPositions = new Set<number>();

    for (const cardMediaItem of prepared.cardMedia) {
      const cardId = cardMapByPosition.get(cardMediaItem.cardPosition);
      if (!cardId) {
        throw new PreparedCardNotFoundError(adId, cardMediaItem.cardPosition);
      }

      const cardResult = await reconcileCardMedia(
        {
          adCardId: cardId,
          media: cardMediaItem.media,
        },
        client,
      );

      cardRelationshipsCount += cardResult.relationships.length;
      deletedCardMediaCount += cardResult.deletedCount;
      processedCardPositions.add(cardMediaItem.cardPosition);
    }

    // 4. Ensure cards existing in DB but not referenced in prepared.cardMedia have their media cleared
    for (const card of existingCards) {
      if (!processedCardPositions.has(card.position)) {
        const clearResult = await reconcileCardMedia(
          {
            adCardId: card.id,
            media: [],
          },
          client,
        );
        deletedCardMediaCount += clearResult.deletedCount;
      }
    }

    return {
      adId,
      directMediaCount: adMediaResult.relationships.length,
      cardMediaCount: cardRelationshipsCount,
      deletedDirectMediaCount: adMediaResult.deletedCount,
      deletedCardMediaCount,
    };
  };

  if (executor) {
    return runReconciliation(executor);
  }

  return db.transaction(async (tx) => {
    return runReconciliation(tx);
  });
}
