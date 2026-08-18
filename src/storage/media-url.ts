import { MediaUrlResolutionError } from "./errors";

const CANONICAL_STORAGE_KEY_REGEX = /^media\/sha256\/[0-9a-f]{64}$/;

/**
 * Resolves a browser-safe media URL given a storage key.
 *
 * Behavior:
 * - In local development (NODE_ENV === "development") without explicit mediaBaseUrl:
 *   Resolves to the same-origin DEV proxy `/api/dev-media/sha256/<hash>`.
 *   This avoids cross-site Cloudflare Access cookie blocks on localhost.
 * - In production or when explicit mediaBaseUrl is provided:
 *   Resolves to `<MEDIA_BASE_URL>/media/sha256/<hash>`.
 *
 * Invariants:
 * - Validates expected canonical storage key pattern: `media/sha256/<64 lowercase hex>`.
 * - Pure synchronous function: zero network calls, zero credentials.
 * - Physical SHA identity remains strictly unmutated.
 *
 * @param storageKey Canonical storage key (e.g. `media/sha256/b3146a45...`)
 * @param mediaBaseUrl Optional explicit base URL (forces remote resolution if provided)
 * @returns Browser delivery URL (same-origin in dev, canonical HTTPS in prod)
 */
export function resolveMediaUrl(
  storageKey: string,
  mediaBaseUrl?: string | null,
): string {
  const normalizedStorageKey = storageKey ? storageKey.trim() : "";
  if (!CANONICAL_STORAGE_KEY_REGEX.test(normalizedStorageKey)) {
    throw new MediaUrlResolutionError(
      `Invalid storage key "${storageKey}". Expected pattern: media/sha256/<64 lowercase hex characters>.`,
    );
  }

  const isDev = process.env.NODE_ENV === "development";

  // In local dev without explicit URL override, use the same-origin dev proxy
  if (isDev && !mediaBaseUrl) {
    const sha = normalizedStorageKey.replace(/^media\/sha256\//, "");
    return `/api/dev-media/sha256/${sha}`;
  }

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

  const cleanBase = trimmedBase.replace(/\/+$/, "");
  return `${cleanBase}/${normalizedStorageKey}`;
}
