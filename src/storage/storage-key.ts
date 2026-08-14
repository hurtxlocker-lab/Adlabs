import { ObjectStorageError } from "./errors";

const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/;

/**
 * Generates a pure, deterministic, content-addressed storage key for an asset.
 *
 * Physical Invariant:
 * The R2 object key is derived SOLELY from the canonical SHA-256 hash of downloaded bytes.
 * It does not depend on semantic mediaType (IMAGE, VIDEO, VIDEO_PREVIEW), MIME type,
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

/**
 * Derives an optional public URL for presentation given a storage key and public base URL.
 *
 * Note: Public URLs are configuration-derived and must NEVER be stored in the database
 * as canonical persistent media identity.
 */
export function getPublicMediaUrl(
  storageKey: string,
  publicBaseUrl?: string | null,
): string | null {
  if (!publicBaseUrl || publicBaseUrl.trim() === "") {
    return null;
  }

  const cleanBase = publicBaseUrl.trim().replace(/\/+$/, "");
  const cleanKey = storageKey.replace(/^\/+/, "");

  return `${cleanBase}/${cleanKey}`;
}
