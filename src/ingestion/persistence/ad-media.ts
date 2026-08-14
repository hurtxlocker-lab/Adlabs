import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { ensureStoredMediaAsset } from "./media-assets";
import type {
  AdMediaRow,
  DbOrTx,
  ReconcileAdMediaInput,
  ReconcileAdMediaResult,
} from "./types";
import { DuplicateMediaRelationshipError } from "./types";
import {
  validateNonNegativeInt,
  validateSha256,
  validateUuid,
} from "./validation";

/**
 * Reconciles direct ad-level media relationships for an ad to match
 * the current observed stored-media snapshot.
 *
 * Invariants:
 *  1. Relationship identity is (ad_id, media_asset_id, position).
 *  2. Physical assets are resolved/ensured by SHA-256 before relationship insertion.
 *  3. Duplicate identical relationships in incoming input are rejected.
 *  4. Stale ad_media rows for that ad are deleted.
 *  5. media_assets rows are NEVER deleted during reconciliation (shared assets).
 *  6. Deletion is strictly scoped to ad_id = ?.
 */
export async function reconcileAdMedia(
  input: ReconcileAdMediaInput,
  executor?: DbOrTx,
): Promise<ReconcileAdMediaResult> {
  const client = executor ?? db;

  const adId = validateUuid(input.adId, "adId");
  const { media } = input;

  // 1. Validate relationship entries and check for exact duplicate tuples
  const seenRefs = new Set<string>();
  for (const ref of media) {
    validateNonNegativeInt(ref.position, "media.position");
    const canonicalSha = validateSha256(ref.media.sha256, "media.sha256");
    const refKey = `${canonicalSha}:${ref.position}`;

    if (seenRefs.has(refKey)) {
      throw new DuplicateMediaRelationshipError(
        `Duplicate media relationship input (SHA: "${canonicalSha}", position: ${ref.position}) for ad "${adId}".`,
        adId,
        canonicalSha,
        ref.position,
      );
    }
    seenRefs.add(refKey);
  }

  // 2. If incoming media is empty, remove all ad_media rows for this ad
  if (media.length === 0) {
    const deleted = await client
      .delete(schema.adMedia)
      .where(eq(schema.adMedia.adId, adId))
      .returning({ adId: schema.adMedia.adId });

    return {
      relationships: [],
      deletedCount: deleted.length,
    };
  }

  // 3. Ensure assets and upsert relationships
  const upserted: AdMediaRow[] = [];
  for (const ref of media) {
    const asset = await ensureStoredMediaAsset(ref.media, client);

    const row = await client
      .insert(schema.adMedia)
      .values({
        adId,
        mediaAssetId: asset.id,
        position: ref.position,
        role: ref.role ?? null,
      })
      .onConflictDoUpdate({
        target: [
          schema.adMedia.adId,
          schema.adMedia.mediaAssetId,
          schema.adMedia.position,
        ],
        set: {
          role: ref.role ?? null,
        },
      })
      .returning();

    upserted.push(row[0]);
  }

  // 4. Delete stale relationships belonging to this ad
  const existingRows = await client
    .select()
    .from(schema.adMedia)
    .where(eq(schema.adMedia.adId, adId));

  const validKeySet = new Set(
    upserted.map((u) => `${u.mediaAssetId}:${u.position}`),
  );

  const staleRows = existingRows.filter(
    (row) => !validKeySet.has(`${row.mediaAssetId}:${row.position}`),
  );

  let deletedCount = 0;
  for (const stale of staleRows) {
    await client
      .delete(schema.adMedia)
      .where(
        and(
          eq(schema.adMedia.adId, adId),
          eq(schema.adMedia.mediaAssetId, stale.mediaAssetId),
          eq(schema.adMedia.position, stale.position),
        ),
      );
    deletedCount++;
  }

  return {
    relationships: upserted,
    deletedCount,
  };
}
