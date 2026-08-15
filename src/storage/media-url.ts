import { MediaUrlResolutionError } from "./errors";

const CANONICAL_STORAGE_KEY_REGEX = /^media\/sha256\/[0-9a-f]{64}$/;

/**
 * Resolves a browser-safe, canonical media URL given a storage key and media base URL.
 *
 * Rules:
 * - Requires MEDIA_BASE_URL (either explicitly passed or read from process.env.MEDIA_BASE_URL).
 * - Validates that MEDIA_BASE_URL starts with https://.
 * - Normalizes any trailing slashes on MEDIA_BASE_URL.
 * - Validates expected canonical storage key pattern: `media/sha256/<64 lowercase hex>`.
 * - Returns `<MEDIA_BASE_URL>/<storageKey>`.
 * - Pure synchronous function: zero network calls, zero credentials, zero signed URL generation.
 * - No source_url fallback, no Next.js proxy fallback.
 *
 * @param storageKey Canonical storage key (e.g. `media/sha256/b3146a45...`)
 * @param mediaBaseUrl Optional explicit base URL (defaults to process.env.MEDIA_BASE_URL)
 * @returns Canonical HTTPS URL for browser delivery
 */
export function resolveMediaUrl(
  storageKey: string,
  mediaBaseUrl?: string | null,
): string {
  const rawBase = mediaBaseUrl ?? process.env.MEDIA_BASE_URL;

  if (!rawBase || rawBase.trim() === "") {
    throw new MediaUrlResolutionError(
      "MEDIA_BASE_URL is not configured. A valid HTTPS base URL is required to resolve media URLs.",
    );
  }

  const trimmedBase = rawBase.trim();

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedBase);
  } catch {
    throw new MediaUrlResolutionError(
      `Invalid MEDIA_BASE_URL "${trimmedBase}". Must be a valid HTTPS URL.`,
    );
  }

  if (parsedUrl.protocol !== "https:") {
    throw new MediaUrlResolutionError(
      `Invalid MEDIA_BASE_URL protocol "${parsedUrl.protocol}". MEDIA_BASE_URL must use https: protocol.`,
    );
  }

  const normalizedStorageKey = storageKey ? storageKey.trim() : "";
  if (!CANONICAL_STORAGE_KEY_REGEX.test(normalizedStorageKey)) {
    throw new MediaUrlResolutionError(
      `Invalid storage key "${storageKey}". Expected pattern: media/sha256/<64 lowercase hex characters>.`,
    );
  }

  const cleanBase = trimmedBase.replace(/\/+$/, "");
  return `${cleanBase}/${normalizedStorageKey}`;
}
