/**
 * workers/adlabs-media/src/index.ts
 *
 * AdLabs Canonical Private Media Gateway (Cloudflare Worker).
 *
 * Architecture:
 *   Browser
 *     ↓
 *   https://media.brainfoods.in
 *     ↓
 *   Cloudflare Zero Trust Access (DEV authorization)
 *     ↓
 *   Cloudflare Worker (this gateway)
 *     ↓ (private R2 binding: env.MEDIA_BUCKET)
 *   R2 Bucket: brainfoods-ads-dev
 *
 * Invariants:
 * - Only GET and HEAD methods allowed. All others: 405 Method Not Allowed.
 * - Path strictly matches `/media/sha256/<64 lowercase hex>`. All others: 404 Not Found.
 * - Supports single HTTP Range requests (206 Partial Content) for streaming MP4 video.
 * - Fails closed: no directory listing, no debug reflection, no R2 credentials.
 * - Cache policy: `private, no-transform` during Access-gated DEV to prevent shared-cache leakage.
 */

import type { Env, R2Range } from "./types";

export * from "./types";

// Canonical path regex: /media/sha256/<64 lowercase hex>
const CANONICAL_PATH_REGEX = /^\/media\/sha256\/([0-9a-f]{64})$/;

// Single byte range regex: bytes=start-end, bytes=start-, or bytes=-suffix
const RANGE_HEADER_REGEX = /^bytes=(?:(\d+)-(\d+)?|-(\d+))$/;

export interface ParsedRange {
  offset?: number;
  length?: number;
  suffix?: number;
}

/**
 * Parses a standard single-part HTTP byte range header.
 * Multipart ranges (comma-separated) are not supported and return null.
 */
export function parseSingleByteRange(
  rangeHeader: string,
  totalSize: number,
): { range: ParsedRange; start: number; end: number } | null {
  const match = RANGE_HEADER_REGEX.exec(rangeHeader.trim());
  if (!match) {
    return null;
  }

  const [, startStr, endStr, suffixStr] = match;

  if (suffixStr !== undefined) {
    // Suffix range: bytes=-500 (last 500 bytes)
    const suffix = parseInt(suffixStr, 10);
    if (suffix <= 0) return null;
    const actualLength = Math.min(suffix, totalSize);
    const start = totalSize - actualLength;
    const end = totalSize - 1;
    return {
      range: { suffix: actualLength },
      start,
      end,
    };
  }

  if (startStr !== undefined) {
    const start = parseInt(startStr, 10);
    if (start >= totalSize) {
      // Start is beyond end of file
      return null;
    }

    if (endStr !== undefined) {
      // Explicit range: bytes=0-499
      const end = parseInt(endStr, 10);
      if (end < start) {
        return null;
      }
      const boundedEnd = Math.min(end, totalSize - 1);
      const length = boundedEnd - start + 1;
      return {
        range: { offset: start, length },
        start,
        end: boundedEnd,
      };
    }

    // Open-ended range: bytes=500- (from 500 to EOF)
    const length = totalSize - start;
    return {
      range: { offset: start, length },
      start,
      end: totalSize - 1,
    };
  }

  return null;
}

export async function handleMediaRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const method = request.method.toUpperCase();

  // 1. Validate HTTP Method
  if (method !== "GET" && method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: {
        Allow: "GET, HEAD",
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  // 2. Validate URL Path
  const url = new URL(request.url);
  const pathMatch = CANONICAL_PATH_REGEX.exec(url.pathname);

  if (!pathMatch) {
    return new Response("Not Found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const sha256 = pathMatch[1];
  const storageKey = `media/sha256/${sha256}`;

  if (!env || !env.MEDIA_BUCKET) {
    return new Response("Storage Gateway Unavailable", {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  // 3. Handle HEAD Requests (Metadata only)
  if (method === "HEAD") {
    const object = await env.MEDIA_BUCKET.head(storageKey);
    if (!object) {
      return new Response("Not Found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    const headers = new Headers();
    headers.set(
      "Content-Type",
      object.httpMetadata?.contentType || "application/octet-stream",
    );
    headers.set("Content-Length", object.size.toString());
    headers.set("Accept-Ranges", "bytes");
    headers.set("ETag", object.httpEtag);
    // Security: private cache prevents unauthenticated caching on shared proxies during Access DEV
    headers.set("Cache-Control", "private, no-transform");

    return new Response(null, {
      status: 200,
      headers,
    });
  }

  // 4. Handle GET Requests with HTTP Range (Partial Content / Video Streaming)
  const rangeHeader = request.headers.get("Range");

  if (rangeHeader) {
    // Check object existence and size first
    const head = await env.MEDIA_BUCKET.head(storageKey);
    if (!head) {
      return new Response("Not Found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    const parsedRange = parseSingleByteRange(rangeHeader, head.size);

    if (!parsedRange) {
      // 416 Range Not Satisfiable
      return new Response("Range Not Satisfiable", {
        status: 416,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Range": `bytes */${head.size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
        },
      });
    }

    // Fetch partial object from R2 binding
    const partialObject = await env.MEDIA_BUCKET.get(storageKey, {
      range: parsedRange.range as R2Range,
    });

    if (!partialObject || !("body" in partialObject) || !partialObject.body) {
      return new Response("Not Found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    const contentLength = parsedRange.end - parsedRange.start + 1;
    const headers = new Headers();
    headers.set(
      "Content-Type",
      partialObject.httpMetadata?.contentType || "application/octet-stream",
    );
    headers.set("Content-Length", contentLength.toString());
    headers.set(
      "Content-Range",
      `bytes ${parsedRange.start}-${parsedRange.end}/${head.size}`,
    );
    headers.set("Accept-Ranges", "bytes");
    headers.set("ETag", partialObject.httpEtag);
    headers.set("Cache-Control", "private, no-transform");

    return new Response(partialObject.body as ReadableStream, {
      status: 206,
      headers,
    });
  }

  // 5. Full Object GET
  const object = await env.MEDIA_BUCKET.get(storageKey);

  if (!object || !("body" in object) || !object.body) {
    return new Response("Not Found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    object.httpMetadata?.contentType || "application/octet-stream",
  );
  headers.set("Content-Length", object.size.toString());
  headers.set("Accept-Ranges", "bytes");
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "private, no-transform");

  return new Response(object.body as ReadableStream, {
    status: 200,
    headers,
  });
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleMediaRequest(request, env);
    } catch (err: unknown) {
      // Fail closed: never leak stack trace or internal bucket metadata
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[adlabs-media-gateway error]", msg);
      return new Response("Internal Gateway Error", {
        status: 500,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }
  },
};

export default worker;
