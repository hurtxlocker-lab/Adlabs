import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  InvalidMediaContentError,
  MediaDownloadHttpError,
  MediaDownloadTimeoutError,
  MediaTooLargeError,
  TooManyRedirectsError,
} from "./errors";
import { sniffMediaSignature, validateMediaContent } from "./sniff";
import type {
  DownloadedMedia,
  DownloadMediaInput,
  DownloadMediaOptions,
} from "./types";
import { redactUrl, validateUrlSafety } from "./url-safety";

export const MAX_MEDIA_BYTES = BigInt(104857600); // 100 MiB
export const MAX_REDIRECTS = 5;
export const DOWNLOAD_TIMEOUT_MS = 60000; // 60 seconds
export const SNIFF_BUFFER_SIZE = 512; // 512 bytes

async function removeFileQuietly(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // Idempotent ignore
  }
}

/**
 * Downloads a media asset from a remote URL over HTTP/HTTPS with streaming SHA-256
 * calculation, memory-bounded temporary file buffering, SSRF protection,
 * redirect validation, and content signature inspection.
 *
 * Invariant: The timeout (timeoutMs) is ONE operation-wide deadline for the entire
 * downloadMedia() execution across all redirect hops, DNS checks, and body streaming.
 *
 * @param input Download parameters including sourceUrl and optional expectedType.
 * @param options Injectable overrides for testing (fetchImpl, dnsLookup, timeouts, limits).
 */
export async function downloadMedia(
  input: DownloadMediaInput,
  options?: DownloadMediaOptions,
): Promise<DownloadedMedia> {
  const maxBytes = options?.maxBytes ?? MAX_MEDIA_BYTES;
  const maxRedirects = options?.maxRedirects ?? MAX_REDIRECTS;
  const timeoutMs = options?.timeoutMs ?? DOWNLOAD_TIMEOUT_MS;
  const fetchImpl = options?.fetchImpl ?? fetch;

  let currentUrl = input.sourceUrl;
  let redirectCount = 0;
  const visitedUrls = new Set<string>();

  let tempFilePath: string | null = null;

  // Single operation-wide deadline for the entire downloadMedia call
  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    // 1. Redirect follow loop with explicit per-hop SSRF validation
    while (true) {
      if (controller.signal.aborted) {
        throw new MediaDownloadTimeoutError(
          `Media download timed out after ${timeoutMs}ms for "${redactUrl(currentUrl)}"`,
          redactUrl(currentUrl),
          timeoutMs,
        );
      }

      if (redirectCount > maxRedirects) {
        throw new TooManyRedirectsError(
          `Exceeded maximum allowed redirects (${maxRedirects}) for "${redactUrl(input.sourceUrl)}"`,
          redactUrl(input.sourceUrl),
          maxRedirects,
        );
      }

      if (visitedUrls.has(currentUrl)) {
        throw new TooManyRedirectsError(
          `Redirect loop detected at "${redactUrl(currentUrl)}"`,
          redactUrl(currentUrl),
          maxRedirects,
        );
      }
      visitedUrls.add(currentUrl);

      // Validate URL safety (SSRF, DNS resolution, protocol)
      if (options?.validateUrl) {
        await options.validateUrl(currentUrl);
      } else {
        await validateUrlSafety(currentUrl, { dnsLookup: options?.dnsLookup });
      }

      let response: Response;
      try {
        response = await fetchImpl(currentUrl, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "User-Agent": "AdLabs-Media-Downloader/1.0",
          },
        });
      } catch (err: unknown) {
        if (controller.signal.aborted) {
          throw new MediaDownloadTimeoutError(
            `Media download timed out after ${timeoutMs}ms for "${redactUrl(currentUrl)}"`,
            redactUrl(currentUrl),
            timeoutMs,
          );
        }
        const message = err instanceof Error ? err.message : String(err);
        throw new MediaDownloadHttpError(
          `Network error fetching "${redactUrl(currentUrl)}": ${message}`,
          redactUrl(currentUrl),
          0,
        );
      }

      // Check for redirect responses
      const status = response.status;
      if (
        status === 301 ||
        status === 302 ||
        status === 303 ||
        status === 307 ||
        status === 308
      ) {
        const location = response.headers.get("location");
        if (!location) {
          throw new MediaDownloadHttpError(
            `Redirect status ${status} without Location header from "${redactUrl(currentUrl)}"`,
            redactUrl(currentUrl),
            status,
          );
        }

        try {
          const nextTarget = new URL(location, currentUrl).toString();
          currentUrl = nextTarget;
          redirectCount++;
          continue;
        } catch {
          throw new MediaDownloadHttpError(
            `Invalid redirect location "${location}" from "${redactUrl(currentUrl)}"`,
            redactUrl(currentUrl),
            status,
          );
        }
      }

      // Non-redirect response: must be 2xx
      if (status < 200 || status >= 300) {
        throw new MediaDownloadHttpError(
          `HTTP ${status} response from "${redactUrl(currentUrl)}"`,
          redactUrl(currentUrl),
          status,
        );
      }

      // 2. Early Content-Length check
      const contentLengthHeader = response.headers.get("content-length");
      if (contentLengthHeader) {
        try {
          const parsedLen = BigInt(contentLengthHeader.trim());
          if (parsedLen < BigInt(0)) {
            throw new MediaDownloadHttpError(
              `Malformed negative Content-Length "${contentLengthHeader}" for "${redactUrl(currentUrl)}"`,
              redactUrl(currentUrl),
              status,
            );
          }
          if (parsedLen > maxBytes) {
            throw new MediaTooLargeError(
              `Content-Length ${parsedLen} exceeds max allowed media size of ${maxBytes} bytes for "${redactUrl(currentUrl)}"`,
              redactUrl(currentUrl),
              maxBytes,
              parsedLen,
            );
          }
        } catch (e) {
          if (e instanceof MediaTooLargeError || e instanceof MediaDownloadHttpError) {
            throw e;
          }
          throw new MediaDownloadHttpError(
            `Invalid Content-Length "${contentLengthHeader}" for "${redactUrl(currentUrl)}"`,
            redactUrl(currentUrl),
            status,
          );
        }
      }

      // 3. Setup streaming to temporary file & SHA-256 calculation
      if (!response.body) {
        throw new InvalidMediaContentError(
          `Response body is empty for media URL "${redactUrl(currentUrl)}"`,
          redactUrl(currentUrl),
          response.headers.get("content-type"),
        );
      }

      tempFilePath = path.join(
        os.tmpdir(),
        `adlabs_media_${Date.now()}_${crypto.randomBytes(8).toString("hex")}.tmp`,
      );

      const fileStream = fs.createWriteStream(tempFilePath);
      const hash = crypto.createHash("sha256");

      let bytesStreamed = BigInt(0);
      const sniffChunks: Buffer[] = [];
      let sniffBytesCollected = 0;

      try {
        const reader = response.body.getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = Buffer.from(value);
          bytesStreamed += BigInt(chunk.length);

          if (bytesStreamed > maxBytes) {
            reader.cancel();
            fileStream.destroy();
            throw new MediaTooLargeError(
              `Downloaded bytes (${bytesStreamed}) exceeded max limit of ${maxBytes} bytes for "${redactUrl(currentUrl)}"`,
              redactUrl(currentUrl),
              maxBytes,
              bytesStreamed,
            );
          }

          hash.update(chunk);
          fileStream.write(chunk);

          if (sniffBytesCollected < SNIFF_BUFFER_SIZE) {
            sniffChunks.push(chunk);
            sniffBytesCollected += chunk.length;
          }
        }

        fileStream.end();
        await new Promise<void>((resolve, reject) => {
          fileStream.on("finish", () => resolve());
          fileStream.on("error", reject);
        });
      } catch (streamErr) {
        fileStream.destroy();
        if (controller.signal.aborted) {
          throw new MediaDownloadTimeoutError(
            `Media download stream timed out after ${timeoutMs}ms for "${redactUrl(currentUrl)}"`,
            redactUrl(currentUrl),
            timeoutMs,
          );
        }
        throw streamErr;
      }

      if (bytesStreamed === BigInt(0)) {
        throw new InvalidMediaContentError(
          `Empty media response received (0 bytes) for "${redactUrl(currentUrl)}"`,
          redactUrl(currentUrl),
          response.headers.get("content-type"),
        );
      }

      // 4. Content signature and MIME validation
      const sniffBuffer = Buffer.concat(sniffChunks).subarray(
        0,
        SNIFF_BUFFER_SIZE,
      );
      const sniffResult = sniffMediaSignature(sniffBuffer);
      const contentTypeHeader = response.headers.get("content-type");

      const { mediaType, mimeType } = validateMediaContent(
        sniffResult,
        contentTypeHeader,
        input.expectedType,
        currentUrl,
      );

      const computedSha256 = hash.digest("hex").toLowerCase();
      const finalTempPath = tempFilePath;

      return {
        sourceUrl: input.sourceUrl,
        finalUrl: currentUrl,
        sha256: computedSha256,
        byteSize: bytesStreamed,
        mimeType,
        mediaType,
        tempFilePath: finalTempPath,
        cleanup: async () => {
          await removeFileQuietly(finalTempPath);
        },
      };
    }
  } catch (err) {
    if (tempFilePath) {
      await removeFileQuietly(tempFilePath);
    }
    throw err;
  } finally {
    clearTimeout(timeoutTimer);
  }
}
