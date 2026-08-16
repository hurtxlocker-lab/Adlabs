import { ObjectStorageError } from "./errors";

const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/;
export const CANONICAL_STORAGE_KEY_REGEX = /^media\/sha256\/[0-9a-f]{64}$/;

/**
 * Validates whether a storage key strictly adheres to the AdLabs physical media storage invariant:
 * `media/sha256/<lowercase 64-character hexadecimal SHA>`
 *
 * @param storageKey Storage key string to test.
 * @returns boolean indicating if the key is canonically valid.
 */
export function isCanonicalMediaStorageKey(
  storageKey: string | null | undefined,
): boolean {
  if (!storageKey || typeof storageKey !== "string") return false;
  return CANONICAL_STORAGE_KEY_REGEX.test(storageKey.trim());
}

/**
 * Generates a pure, deterministic, content-addressed storage key for an asset.
 *
 * Physical Invariant:
 * The R2 object key is derived SOLELY from the canonical SHA-256 hash of downloaded bytes.
 * It does not depend on semantic mediaType (IMAGE, VIDEO, UNKNOWN), MIME type,
 * file extensions, brand, ad ID, or source URLs.
 *
 * Pattern: `media/sha256/<sha256>`
 *
 * @param sha256 64-character lowercase hex string.
 * @returns Deterministic storage key.
 */
export function getDeterministicStorageKey(sha256: string): string {
  const normalizedSha = sha256.trim();

  if (!SHA256_HEX_REGEX.test(normalizedSha)) {
    throw new ObjectStorageError(
      `Invalid SHA-256 "${sha256}". Must be a 64-character lowercase hex string.`,
    );
  }

  return `media/sha256/${normalizedSha}`;
}
