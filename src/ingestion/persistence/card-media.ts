import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { ensureStoredMediaAsset } from "./media-assets";
import type {
  CardMediaRow,
  DbOrTx,
  ReconcileCardMediaInput,
  ReconcileCardMediaResult,
} from "./types";
import { DuplicateMediaRelationshipError } from "./types";
import {
  validateNonNegativeInt,
  validateSha256,
  validateUuid,
} from "./validation";

/**
 * Reconciles card-level media relationships for an ad card to match
 * the current observed stored-media snapshot.
 *
 * Invariants:
 *  1. Relationship identity is (ad_card_id, media_asset_id, position).
 *  2. Physical assets are resolved/ensured by SHA-256 before relationship insertion.
 *  3. Duplicate identical relationships in incoming input are rejected.
 *  4. Stale card_media rows for that card are deleted.
 *  5. media_assets rows are NEVER deleted during reconciliation (shared assets).
 *  6. Deletion is strictly scoped to ad_card_id = ?.
 */
export async function reconcileCardMedia(
  input: ReconcileCardMediaInput,
  executor?: DbOrTx,
): Promise<ReconcileCardMediaResult> {
  const client = executor ?? db;

  const adCardId = validateUuid(input.adCardId, "adCardId");
  const { media } = input;

  // 1. Validate relationship entries and check for exact duplicate tuples
  const seenRefs = new Set<string>();
  for (const ref of media) {
    validateNonNegativeInt(ref.position, "media.position");
    const canonicalSha = validateSha256(ref.media.sha256, "media.sha256");
    const refKey = `${canonicalSha}:${ref.position}`;

    if (seenRefs.has(refKey)) {
      throw new DuplicateMediaRelationshipError(
        `Duplicate media relationship input (SHA: "${canonicalSha}", position: ${ref.position}) for card "${adCardId}".`,
        adCardId,
        canonicalSha,
        ref.position,
      );
    }
    seenRefs.add(refKey);
  }

  // 2. If incoming media is empty, remove all card_media rows for this card
  if (media.length === 0) {
    const deleted = await client
      .delete(schema.cardMedia)
      .where(eq(schema.cardMedia.adCardId, adCardId))
      .returning({ adCardId: schema.cardMedia.adCardId });

    return {
      relationships: [],
      deletedCount: deleted.length,
    };
  }

  // 3. Ensure assets and upsert relationships
  const upserted: CardMediaRow[] = [];
  for (const ref of media) {
    const asset = await ensureStoredMediaAsset(ref.media, client);

    const row = await client
      .insert(schema.cardMedia)
      .values({
        adCardId,
        mediaAssetId: asset.id,
        position: ref.position,
        role: ref.role ?? null,
      })
      .onConflictDoUpdate({
        target: [
          schema.cardMedia.adCardId,
          schema.cardMedia.mediaAssetId,
          schema.cardMedia.position,
        ],
        set: {
          role: ref.role ?? null,
        },
      })
      .returning();

    upserted.push(row[0]);
  }

  // 4. Delete stale relationships belonging to this card
  const existingRows = await client
    .select()
    .from(schema.cardMedia)
    .where(eq(schema.cardMedia.adCardId, adCardId));

  const validKeySet = new Set(
    upserted.map((u) => `${u.mediaAssetId}:${u.position}`),
  );

  const staleRows = existingRows.filter(
    (row) => !validKeySet.has(`${row.mediaAssetId}:${row.position}`),
  );

  let deletedCount = 0;
  for (const stale of staleRows) {
    await client
      .delete(schema.cardMedia)
      .where(
        and(
          eq(schema.cardMedia.adCardId, adCardId),
          eq(schema.cardMedia.mediaAssetId, stale.mediaAssetId),
          eq(schema.cardMedia.position, stale.position),
        ),
      );
    deletedCount++;
  }

  return {
    relationships: upserted,
    deletedCount,
  };
}
