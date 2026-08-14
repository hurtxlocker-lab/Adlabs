import { and, eq, notInArray } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import type {
  AdCardRow,
  DbOrTx,
  ReconcileAdCardsInput,
  ReconcileAdCardsResult,
} from "./types";
import { DuplicateCardPositionError } from "./types";
import { validateNonNegativeInt, validateUuid } from "./validation";

/**
 * Reconciles ad cards for a specific ad to match the current observed snapshot.
 *
 * Invariants:
 *  1. Card identity is strictly (ad_id, position).
 *  2. Positions are validated as non-negative safe integers with zero duplicates.
 *  3. Existing cards at current positions are updated with current snapshot copy/payload.
 *  4. Canonical null fields overwrite existing non-null values (snapshot replacement).
 *  5. Stale card rows for that ad whose positions are not present in the incoming snapshot are deleted.
 *  6. If incoming cards array is empty, all card rows for that ad are deleted.
 *  7. Card media collections are ignored at this stage.
 */
export async function reconcileAdCards(
  input: ReconcileAdCardsInput,
  executor?: DbOrTx,
): Promise<ReconcileAdCardsResult> {
  const client = executor ?? db;

  const adId = validateUuid(input.adId, "adId");
  const { cards } = input;

  // 1. Validate card positions and reject duplicates
  const seenPositions = new Set<number>();
  for (const card of cards) {
    validateNonNegativeInt(card.position, "card.position");
    if (seenPositions.has(card.position)) {
      throw new DuplicateCardPositionError(
        `Duplicate card position ${card.position} found in incoming cards for ad "${adId}".`,
        adId,
        card.position,
      );
    }
    seenPositions.add(card.position);
  }

  // 2. If incoming cards is empty, remove all cards for this ad
  if (cards.length === 0) {
    const deleted = await client
      .delete(schema.adCards)
      .where(eq(schema.adCards.adId, adId))
      .returning({ id: schema.adCards.id });

    return {
      cards: [],
      deletedCount: deleted.length,
    };
  }

  // 3. Upsert current snapshot cards
  const upsertedCards: AdCardRow[] = [];
  for (const card of cards) {
    const cardRawPayload =
      typeof card.raw === "object" && card.raw !== null
        ? (card.raw as Record<string, unknown>)
        : { raw: card.raw };

    const values = {
      adId,
      position: card.position,
      body: card.body ?? null,
      title: card.title ?? null,
      description: card.description ?? null,
      ctaText: card.ctaText ?? null,
      ctaType: card.ctaType ?? null,
      destinationUrl: card.destinationUrl ?? null,
      rawPayload: cardRawPayload,
    };

    const row = await client
      .insert(schema.adCards)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.adCards.adId, schema.adCards.position],
        set: {
          body: values.body,
          title: values.title,
          description: values.description,
          ctaText: values.ctaText,
          ctaType: values.ctaType,
          destinationUrl: values.destinationUrl,
          rawPayload: values.rawPayload,
        },
      })
      .returning();

    upsertedCards.push(row[0]);
  }

  // 4. Delete stale positions belonging to this ad
  const validPositions = Array.from(seenPositions);
  const deleted = await client
    .delete(schema.adCards)
    .where(
      and(
        eq(schema.adCards.adId, adId),
        notInArray(schema.adCards.position, validPositions),
      ),
    )
    .returning({ id: schema.adCards.id });

  return {
    cards: upsertedCards,
    deletedCount: deleted.length,
  };
}
