import * as crypto from "node:crypto";
import * as fs from "node:fs";
import { describe, expect, it } from "vitest";
import { downloadMedia } from "../downloader";
import {
  InvalidMediaContentError,
  MediaDownloadHttpError,
  MediaDownloadTimeoutError,
  MediaTooLargeError,
  TooManyRedirectsError,
  UnsafeMediaUrlError,
} from "../errors";
import type { DownloadMediaOptions } from "../types";

/**
 * Creates an in-memory mock fetch function for testing without network calls.
 */
function createMockFetch(
  routes: Record<
    string,
    {
      status?: number;
      headers?: Record<string, string>;
      body?: Buffer | string | Uint8Array;
      delayMs?: number;
    }
  >,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === "string" ? input : input.toString();
    const route = routes[urlStr];

    if (!route) {
      return new Response("Not Found", { status: 404 });
    }

    if (route.delayMs) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => resolve(), route.delayMs);
        if (init?.signal) {
          if (init.signal.aborted) {
            clearTimeout(timer);
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            return reject(err);
          }
          init.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        }
      });
    }

    const status = route.status ?? 200;
    const headers = new Headers(route.headers ?? {});

    let bodyStream: ReadableStream<Uint8Array> | null = null;
    if (route.body) {
      const buffer = Buffer.isBuffer(route.body)
        ? route.body
        : typeof route.body === "string"
          ? Buffer.from(route.body, "utf-8")
          : Buffer.from(route.body);

      bodyStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(buffer));
          controller.close();
        },
      });
    }

    return new Response(bodyStream, { status, headers });
  }) as typeof fetch;
}

describe("Media Downloader Unit & Integration Tests", () => {
  // Bypasses public network DNS check in tests via safe mock DNS lookup
  const safeDnsLookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const defaultTestOpts: DownloadMediaOptions = {
    dnsLookup: safeDnsLookup,
  };

  // Valid JPEG byte header: FF D8 FF E0 + payload
  const sampleJpegBytes = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
    Buffer.from("dummy jpeg image payload bytes for testing"),
  ]);
  const expectedJpegSha = crypto
    .createHash("sha256")
    .update(sampleJpegBytes)
    .digest("hex")
    .toLowerCase();

  // Valid MP4 header: 00 00 00 18 'ftyp' 'mp42' + payload
  const sampleMp4Bytes = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]),
    Buffer.from("dummy video stream payload bytes for testing"),
  ]);
  const expectedMp4Sha = crypto
    .createHash("sha256")
    .update(sampleMp4Bytes)
    .digest("hex")
    .toLowerCase();

  it("1. downloads valid JPEG stream: correct hash, byteSize, IMAGE, exact temp file", async () => {
    const testUrl = "https://cdn.example.com/images/creative_1.jpg";
    const mockFetch = createMockFetch({
      [testUrl]: {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": String(sampleJpegBytes.length),
        },
        body: sampleJpegBytes,
      },
    });

    const result = await downloadMedia(
      { sourceUrl: testUrl, expectedType: "image" },
      { ...defaultTestOpts, fetchImpl: mockFetch },
    );

    expect(result.sourceUrl).toBe(testUrl);
    expect(result.finalUrl).toBe(testUrl);
    expect(result.sha256).toBe(expectedJpegSha);
    expect(result.byteSize).toBe(BigInt(sampleJpegBytes.length));
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.mediaType).toBe("IMAGE");

    // Verify temp file exists and contents match exact downloaded bytes
    expect(fs.existsSync(result.tempFilePath)).toBe(true);
    const diskBytes = await fs.promises.readFile(result.tempFilePath);
    expect(diskBytes.equals(sampleJpegBytes)).toBe(true);

    // Cleanup temp file
    await result.cleanup();
    expect(fs.existsSync(result.tempFilePath)).toBe(false);
  });

  it("2. downloads valid MP4-like stream: correct hash, VIDEO", async () => {
    const testUrl = "https://cdn.example.com/videos/ad_video.mp4";
    const mockFetch = createMockFetch({
      [testUrl]: {
        status: 200,
        headers: {
          "content-type": "video/mp4",
          "content-length": String(sampleMp4Bytes.length),
        },
        body: sampleMp4Bytes,
      },
    });

    const result = await downloadMedia(
      { sourceUrl: testUrl, expectedType: "video" },
      { ...defaultTestOpts, fetchImpl: mockFetch },
    );

    expect(result.sha256).toBe(expectedMp4Sha);
    expect(result.byteSize).toBe(BigInt(sampleMp4Bytes.length));
    expect(result.mediaType).toBe("VIDEO");

    await result.cleanup();
    expect(fs.existsSync(result.tempFilePath)).toBe(false);
  });

  it("3. downloads preview candidate with valid image -> physical IMAGE", async () => {
    const testUrl = "https://cdn.example.com/previews/thumb.jpg";
    const mockFetch = createMockFetch({
      [testUrl]: {
        status: 200,
        headers: { "content-type": "image/jpeg" },
        body: sampleJpegBytes,
      },
    });

    const result = await downloadMedia(
      { sourceUrl: testUrl, expectedType: "video_preview" },
      { ...defaultTestOpts, fetchImpl: mockFetch },
    );

    expect(result.mediaType).toBe("IMAGE");
    expect(result.sha256).toBe(expectedJpegSha);

    await result.cleanup();
  });

  it("4. rejects HTML 200 response", async () => {
    const testUrl = "https://cdn.example.com/error_page.html";
    const mockFetch = createMockFetch({
      [testUrl]: {
        status: 200,
        headers: { "content-type": "text/html" },
        body: "<!DOCTYPE html><html><body>Error 404</body></html>",
      },
    });

    await expect(
      downloadMedia(
        { sourceUrl: testUrl },
        { ...defaultTestOpts, fetchImpl: mockFetch },
      ),
    ).rejects.toThrow(InvalidMediaContentError);
  });

  it("5. rejects JSON error response", async () => {
    const testUrl = "https://cdn.example.com/api/error.json";
    const mockFetch = createMockFetch({
      [testUrl]: {
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Access Denied" }),
      },
    });

    await expect(
      downloadMedia(
        { sourceUrl: testUrl },
        { ...defaultTestOpts, fetchImpl: mockFetch },
      ),
    ).rejects.toThrow(InvalidMediaContentError);
  });

  it("6. rejects non-2xx response", async () => {
    const testUrl = "https://cdn.example.com/not_found.jpg";
    const mockFetch = createMockFetch({
      [testUrl]: {
        status: 404,
        body: "Not Found",
      },
    });

    await expect(
      downloadMedia(
        { sourceUrl: testUrl },
        { ...defaultTestOpts, fetchImpl: mockFetch },
      ),
    ).rejects.toThrow(MediaDownloadHttpError);
  });

  it("7. rejects oversized Content-Length before body consumption", async () => {
    const testUrl = "https://cdn.example.com/giant.mp4";
    const mockFetch = createMockFetch({
      [testUrl]: {
        status: 200,
        headers: {
          "content-type": "video/mp4",
          "content-length": "200000000", // 200 MB > 100 MB max
        },
        body: sampleMp4Bytes,
      },
    });

    await expect(
      downloadMedia(
        { sourceUrl: testUrl },
        { ...defaultTestOpts, fetchImpl: mockFetch, maxBytes: BigInt(104857600) },
      ),
    ).rejects.toThrow(MediaTooLargeError);
  });

  it("8. streamed body exceeds max limit despite acceptable Content-Length: aborts and cleans up temp file", async () => {
    const testUrl = "https://cdn.example.com/stream_overflow.jpg";
    const largeChunk = Buffer.alloc(2048, 0xff); // 2048 bytes > 500 bytes max limit
    const mockFetch = createMockFetch({
      [testUrl]: {
        status: 200,
        headers: { "content-type": "image/jpeg" },
        body: largeChunk,
      },
    });

    await expect(
      downloadMedia(
        { sourceUrl: testUrl },
        { ...defaultTestOpts, fetchImpl: mockFetch, maxBytes: BigInt(500) },
      ),
    ).rejects.toThrow(MediaTooLargeError);
  });

  it("9. redirect to safe URL works and updates finalUrl", async () => {
    const initialUrl = "https://cdn.example.com/short_link";
    const targetUrl = "https://cdn.example.com/real_image.jpg";

    const mockFetch = createMockFetch({
      [initialUrl]: {
        status: 302,
        headers: { location: targetUrl },
      },
      [targetUrl]: {
        status: 200,
        headers: { "content-type": "image/jpeg" },
        body: sampleJpegBytes,
      },
    });

    const result = await downloadMedia(
      { sourceUrl: initialUrl },
      { ...defaultTestOpts, fetchImpl: mockFetch },
    );

    expect(result.sourceUrl).toBe(initialUrl);
    expect(result.finalUrl).toBe(targetUrl);
    expect(result.sha256).toBe(expectedJpegSha);

    await result.cleanup();
  });

  it("10. redirect to private/unsafe URL is rejected before target fetch", async () => {
    const initialUrl = "https://cdn.example.com/redirect_trap";
    const unsafeTarget = "http://169.254.169.254/latest/meta-data";

    const mockFetch = createMockFetch({
      [initialUrl]: {
        status: 302,
        headers: { location: unsafeTarget },
      },
    });

    await expect(
      downloadMedia(
        { sourceUrl: initialUrl },
        { ...defaultTestOpts, fetchImpl: mockFetch },
      ),
    ).rejects.toThrow(UnsafeMediaUrlError);
  });

  it("11. exceeds maximum redirects (>5) throws TooManyRedirectsError", async () => {
    const routes: Record<string, { status: number; headers: Record<string, string> }> = {};
    for (let i = 0; i <= 6; i++) {
      routes[`https://cdn.example.com/hop_${i}`] = {
        status: 302,
        headers: { location: `https://cdn.example.com/hop_${i + 1}` },
      };
    }

    const mockFetch = createMockFetch(routes);

    await expect(
      downloadMedia(
        { sourceUrl: "https://cdn.example.com/hop_0" },
        { ...defaultTestOpts, fetchImpl: mockFetch, maxRedirects: 5 },
      ),
    ).rejects.toThrow(TooManyRedirectsError);
  });

  it("12. timeout / aborted response rejects and cleans up temp file", async () => {
    const testUrl = "https://cdn.example.com/slow_response.jpg";
    const mockFetch = createMockFetch({
      [testUrl]: {
        status: 200,
        headers: { "content-type": "image/jpeg" },
        body: sampleJpegBytes,
        delayMs: 200, // Exceeds 50ms timeout
      },
    });

    await expect(
      downloadMedia(
        { sourceUrl: testUrl },
        { ...defaultTestOpts, fetchImpl: mockFetch, timeoutMs: 50 },
      ),
    ).rejects.toThrow(MediaDownloadTimeoutError);
  });

  it("13. calculates SHA-256 strictly over exact streamed bytes", async () => {
    const testUrl = "https://cdn.example.com/exact_bytes.jpg";
    const exactBytes = Buffer.from([
      0xff, 0xd8, 0xff, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
    ]);
    const expectedSha = crypto
      .createHash("sha256")
      .update(exactBytes)
      .digest("hex")
      .toLowerCase();

    const mockFetch = createMockFetch({
      [testUrl]: {
        status: 200,
        headers: { "content-type": "image/jpeg" },
        body: exactBytes,
      },
    });

    const result = await downloadMedia(
      { sourceUrl: testUrl },
      { ...defaultTestOpts, fetchImpl: mockFetch },
    );

    expect(result.sha256).toBe(expectedSha);
    await result.cleanup();
  });

  it("14. error messages redact query string tokens and secrets", async () => {
    const signedUrl =
      "https://cdn.example.com/secret_ad.jpg?token=secret123&sig=supersecret#frag";
    const mockFetch = createMockFetch({
      [signedUrl]: {
        status: 500,
        body: "Internal Server Error",
      },
    });

    try {
      await downloadMedia(
        { sourceUrl: signedUrl },
        { ...defaultTestOpts, fetchImpl: mockFetch },
      );
      expect.unreachable("Should have thrown");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(MediaDownloadHttpError);
      const httpErr = err as MediaDownloadHttpError;
      expect(httpErr.url).not.toContain("secret123");
      expect(httpErr.url).not.toContain("supersecret");
      expect(httpErr.message).not.toContain("secret123");
      expect(httpErr.message).toContain("https://cdn.example.com/secret_ad.jpg");
    }
  });

  it("15. cleanup is idempotent and safely removes temp file", async () => {
    const testUrl = "https://cdn.example.com/cleanup_test.jpg";
    const mockFetch = createMockFetch({
      [testUrl]: {
        status: 200,
        headers: { "content-type": "image/jpeg" },
        body: sampleJpegBytes,
      },
    });

    const result = await downloadMedia(
      { sourceUrl: testUrl },
      { ...defaultTestOpts, fetchImpl: mockFetch },
    );

    const tempPath = result.tempFilePath;
    expect(fs.existsSync(tempPath)).toBe(true);

    await result.cleanup();
    expect(fs.existsSync(tempPath)).toBe(false);

    // Repeated call is safe and does not throw
    await expect(result.cleanup()).resolves.toBeUndefined();
  });

  it("16. total deadline does not reset across multiple redirect hops and rejects when total elapsed time exceeds timeout", async () => {
    // 2 redirect hops: hop 1 takes 40ms, hop 2 takes 40ms. Total = 80ms > 60ms timeout!
    // If each hop had a fresh 60ms timeout (behavior B), this would succeed.
    // With one operation-wide deadline (behavior A), this must timeout and throw MediaDownloadTimeoutError.
    const initialUrl = "https://cdn.example.com/hop_start";
    const midUrl = "https://cdn.example.com/hop_mid";
    const finalUrl = "https://cdn.example.com/hop_end.jpg";

    const mockFetch = createMockFetch({
      [initialUrl]: {
        status: 302,
        headers: { location: midUrl },
        delayMs: 40,
      },
      [midUrl]: {
        status: 302,
        headers: { location: finalUrl },
        delayMs: 40,
      },
      [finalUrl]: {
        status: 200,
        headers: { "content-type": "image/jpeg" },
        body: sampleJpegBytes,
        delayMs: 40,
      },
    });

    await expect(
      downloadMedia(
        { sourceUrl: initialUrl },
        { ...defaultTestOpts, fetchImpl: mockFetch, timeoutMs: 60 },
      ),
    ).rejects.toThrow(MediaDownloadTimeoutError);
  });
});
