import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import type {
  DbOrTx,
  EnsureStoredMediaAssetInput,
  MediaAssetRow,
} from "./types";
import { MediaAssetConflictError } from "./types";
import {
  validateNonEmptyString,
  validateNonNegativeBigInt,
  validateSha256,
  validateStoredMediaType,
} from "./validation";

/**
 * Ensures a physical stored media asset is persisted and deduplicated by SHA-256.
 *
 * Invariants:
 *  1. Exact physical identity is strictly sha256 (64 hex characters, lowercase).
 *  2. Media entering this function is already downloaded, hashed, and stored:
 *     download_status is always "STORED" and download_error is null.
 *  3. Race-safe insert using INSERT ... ON CONFLICT (sha256) DO NOTHING.
 *  4. If an existing row with the same SHA-256 is found, verify that byteSize,
 *     storageProvider, storageKey, and known mediaTypes do not conflict.
 *     If they do, throw MediaAssetConflictError.
 *  5. On conflict:
 *     - MIME type: if existing is null and incoming is non-null, enrich it;
 *       otherwise preserve existing canonical MIME without failing or rewriting.
 *     - Media type: if existing is "UNKNOWN" and incoming is a known type, enrich it;
 *       if existing is known and incoming is "UNKNOWN", preserve known;
 *       if both are conflicting known types, throw MediaAssetConflictError.
 *     - source_url: first observed source_url is preserved and never overwritten.
 *     - storage identity: storageProvider and storageKey are immutable for that SHA.
 */
export async function ensureStoredMediaAsset(
  input: EnsureStoredMediaAssetInput,
  executor?: DbOrTx,
): Promise<MediaAssetRow> {
  const client = executor ?? db;

  const sha256 = validateSha256(input.sha256, "sha256");
  const storageProvider = validateNonEmptyString(
    input.storageProvider,
    "storageProvider",
  );
  const storageKey = validateNonEmptyString(input.storageKey, "storageKey");
  const byteSize = validateNonNegativeBigInt(input.byteSize, "byteSize");
  const mediaType = validateStoredMediaType(input.mediaType, "mediaType");
  const mimeType = input.mimeType?.trim() || null;
  const sourceUrl = input.sourceUrl?.trim() || null;

  // 1. Race-safe INSERT ... ON CONFLICT (sha256) DO NOTHING
  const inserted = await client
    .insert(schema.mediaAssets)
    .values({
      mediaType,
      sourceUrl,
      storageProvider,
      storageKey,
      mimeType,
      byteSize,
      sha256,
      downloadStatus: "STORED",
      downloadError: null,
    })
    .onConflictDoNothing({
      target: schema.mediaAssets.sha256,
    })
    .returning();

  if (inserted.length > 0) {
    return inserted[0];
  }

  // 2. Conflict path: retrieve canonical stored asset by sha256
  const existingRows = await client
    .select()
    .from(schema.mediaAssets)
    .where(eq(schema.mediaAssets.sha256, sha256));

  if (existingRows.length === 0) {
    throw new Error(
      `Failed to retrieve existing media asset for SHA-256: "${sha256}" after conflict.`,
    );
  }

  const existing = existingRows[0];

  // 3. Verify strict physical and storage metadata invariants
  if (existing.byteSize !== byteSize) {
    throw new MediaAssetConflictError(
      `Byte size mismatch for SHA-256 "${sha256}": existing is ${existing.byteSize}, incoming is ${byteSize}.`,
      sha256,
      existing,
      input,
    );
  }

  if (existing.storageProvider !== storageProvider) {
    throw new MediaAssetConflictError(
      `Storage provider mismatch for SHA-256 "${sha256}": existing is "${existing.storageProvider}", incoming is "${storageProvider}".`,
      sha256,
      existing,
      input,
    );
  }

  if (existing.storageKey !== storageKey) {
    throw new MediaAssetConflictError(
      `Storage key mismatch for SHA-256 "${sha256}": existing is "${existing.storageKey}", incoming is "${storageKey}".`,
      sha256,
      existing,
      input,
    );
  }

  // Known type A vs known type B mismatch fails
  if (
    existing.mediaType !== "UNKNOWN" &&
    mediaType !== "UNKNOWN" &&
    existing.mediaType !== mediaType
  ) {
    throw new MediaAssetConflictError(
      `Media type conflict for SHA-256 "${sha256}": existing is "${existing.mediaType}", incoming is "${mediaType}".`,
      sha256,
      existing,
      input,
    );
  }

  // 4. Safe metadata enrichment
  const shouldEnrichMime = existing.mimeType === null && mimeType !== null;
  const shouldEnrichMediaType =
    existing.mediaType === "UNKNOWN" && mediaType !== "UNKNOWN";

  if (shouldEnrichMime || shouldEnrichMediaType) {
    const updated = await client
      .update(schema.mediaAssets)
      .set({
        mimeType: shouldEnrichMime ? mimeType : existing.mimeType,
        mediaType: shouldEnrichMediaType ? mediaType : existing.mediaType,
        updatedAt: new Date(),
      })
      .where(eq(schema.mediaAssets.id, existing.id))
      .returning();

    return updated[0];
  }

  return existing;
}
