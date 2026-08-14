import { InvalidMediaContentError } from "./errors";
import { redactUrl } from "./url-safety";
import type { DownloadedMediaType, SourceExpectedMediaType } from "./types";

export type SniffResult = "IMAGE" | "VIDEO" | "REJECT_TEXT" | "UNKNOWN";

/**
 * Inspects a small initial prefix buffer (up to 512 bytes) to detect
 * binary media signatures or obvious text/HTML/JSON error responses.
 */
export function sniffMediaSignature(buffer: Buffer): SniffResult {
  if (buffer.length === 0) {
    return "UNKNOWN";
  }

  // 1. Detect obvious text/HTML/JSON payloads
  const textPrefix = buffer.subarray(0, 64).toString("utf-8").trim().toLowerCase();
  if (
    textPrefix.startsWith("<!doctype") ||
    textPrefix.startsWith("<html") ||
    textPrefix.startsWith("<?xml") ||
    textPrefix.startsWith("<error") ||
    textPrefix.startsWith("{") ||
    textPrefix.startsWith("[")
  ) {
    return "REJECT_TEXT";
  }

  // 2. JPEG signature: 0xFF, 0xD8, 0xFF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "IMAGE";
  }

  // 3. PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "IMAGE";
  }

  // 4. GIF signature: "GIF87a" or "GIF89a"
  if (buffer.length >= 6) {
    const gifHeader = buffer.subarray(0, 6).toString("ascii");
    if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
      return "IMAGE";
    }
  }

  // 5. WebP signature: "RIFF" at 0..3 and "WEBP" at 8..11
  if (buffer.length >= 12) {
    const riff = buffer.subarray(0, 4).toString("ascii");
    const webp = buffer.subarray(8, 12).toString("ascii");
    if (riff === "RIFF" && webp === "WEBP") {
      return "IMAGE";
    }
  }

  // 6. MP4 / ISO BMFF signature: "ftyp" at offset 4..7
  if (buffer.length >= 8) {
    const ftyp = buffer.subarray(4, 8).toString("ascii");
    if (ftyp === "ftyp" || ftyp === "moov" || ftyp === "mdat") {
      return "VIDEO";
    }
  }

  // 7. WebM / Matroska signature: 1A 45 DF A3
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return "VIDEO";
  }

  return "UNKNOWN";
}

/**
 * Validates Content-Type header and sniffed signature against expectations.
 */
export function validateMediaContent(
  sniffResult: SniffResult,
  contentTypeHeader: string | null,
  expectedType: SourceExpectedMediaType | undefined,
  url: string,
): { mediaType: DownloadedMediaType; mimeType: string | null } {
  const safeUrl = redactUrl(url);
  const rawMime = contentTypeHeader?.split(";")[0]?.trim().toLowerCase() || null;

  // 1. Reject obvious non-media MIME types
  if (
    rawMime === "text/html" ||
    rawMime === "text/plain" ||
    rawMime === "application/json" ||
    rawMime === "application/xml" ||
    rawMime === "text/xml"
  ) {
    throw new InvalidMediaContentError(
      `Non-media Content-Type "${rawMime}" received for media URL "${safeUrl}"`,
      safeUrl,
      rawMime,
    );
  }

  // 2. Reject if sniff detected text/HTML/JSON payload
  if (sniffResult === "REJECT_TEXT") {
    throw new InvalidMediaContentError(
      `Response body contains text/HTML/JSON error payload for media URL "${safeUrl}"`,
      safeUrl,
      rawMime,
    );
  }

  // 3. Evaluate by sniffed signature first, then Content-Type header
  const isSniffedImage = sniffResult === "IMAGE";
  const isSniffedVideo = sniffResult === "VIDEO";
  const isHeaderImage = rawMime?.startsWith("image/") ?? false;
  const isHeaderVideo = rawMime?.startsWith("video/") ?? false;

  let resolvedCategory: "IMAGE" | "VIDEO" | "UNKNOWN" = "UNKNOWN";

  if (isSniffedImage || isHeaderImage) {
    resolvedCategory = "IMAGE";
  } else if (isSniffedVideo || isHeaderVideo) {
    resolvedCategory = "VIDEO";
  } else if (sniffResult === "UNKNOWN" && rawMime === "application/octet-stream") {
    // If octet-stream and no known signature, cannot confirm media
    throw new InvalidMediaContentError(
      `Cannot determine media type for application/octet-stream without known magic bytes for "${safeUrl}"`,
      safeUrl,
      rawMime,
    );
  } else {
    // Unsupported or unknown content
    throw new InvalidMediaContentError(
      `Unrecognized media content or unsupported MIME type "${rawMime ?? "unknown"}" for "${safeUrl}"`,
      safeUrl,
      rawMime,
    );
  }

  // 4. Validate against expectedType
  if (expectedType === "video_preview") {
    if (resolvedCategory === "VIDEO") {
      throw new InvalidMediaContentError(
        `Expected video preview image but received video media for "${safeUrl}"`,
        safeUrl,
        rawMime,
      );
    }
    return { mediaType: "IMAGE", mimeType: rawMime };
  }

  if (expectedType === "image") {
    if (resolvedCategory === "VIDEO") {
      throw new InvalidMediaContentError(
        `Expected image but received video media for "${safeUrl}"`,
        safeUrl,
        rawMime,
      );
    }
    return { mediaType: "IMAGE", mimeType: rawMime };
  }

  if (expectedType === "video") {
    if (resolvedCategory === "IMAGE") {
      throw new InvalidMediaContentError(
        `Expected video but received image media for "${safeUrl}"`,
        safeUrl,
        rawMime,
      );
    }
    return { mediaType: "VIDEO", mimeType: rawMime };
  }

  // expectedType is "unknown" or undefined
  return {
    mediaType: resolvedCategory === "IMAGE" ? "IMAGE" : "VIDEO",
    mimeType: rawMime,
  };
}
