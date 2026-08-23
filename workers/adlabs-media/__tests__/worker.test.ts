import { describe, expect, it } from "vitest";
import worker, {
  handleMediaRequest,
  parseSingleByteRange,
  type Env,
  type R2Bucket,
  type R2GetOptions,
  type R2Object,
  type R2ObjectBody,
} from "../src/index";

interface MockStoredObject {
  data: Uint8Array;
  contentType: string;
  sha256: string;
}

function createMockR2Bucket(
  initialObjects: Record<string, MockStoredObject> = {},
): R2Bucket {
  const store = new Map<string, MockStoredObject>(
    Object.entries(initialObjects),
  );

  return {
    async head(key: string): Promise<R2Object | null> {
      const obj = store.get(key);
      if (!obj) return null;

      return {
        key,
        version: "v1",
        size: obj.data.length,
        etag: `"${obj.sha256}"`,
        httpEtag: `"${obj.sha256}"`,
        uploaded: new Date(),
        httpMetadata: {
          contentType: obj.contentType,
        },
        customMetadata: {
          sha256: obj.sha256,
        },
        writeHttpMetadata: () => {},
      };
    },

    async get(
      key: string,
      options?: R2GetOptions,
    ): Promise<R2ObjectBody | null> {
      const obj = store.get(key);
      if (!obj) return null;

      let returnedBytes = obj.data;
      let rangeOffset = 0;
      let rangeLength = obj.data.length;

      if (options?.range) {
        const r = options.range;
        if (r.suffix !== undefined) {
          rangeOffset = Math.max(0, obj.data.length - r.suffix);
          rangeLength = obj.data.length - rangeOffset;
          returnedBytes = obj.data.slice(rangeOffset);
        } else if (r.offset !== undefined) {
          rangeOffset = r.offset;
          const end =
            r.length !== undefined
              ? Math.min(obj.data.length, rangeOffset + r.length)
              : obj.data.length;
          rangeLength = Math.max(0, end - rangeOffset);
          returnedBytes = obj.data.slice(rangeOffset, rangeOffset + rangeLength);
        }
      }

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(returnedBytes);
          controller.close();
        },
      });

      return {
        key,
        version: "v1",
        size: obj.data.length,
        etag: `"${obj.sha256}"`,
        httpEtag: `"${obj.sha256}"`,
        uploaded: new Date(),
        httpMetadata: {
          contentType: obj.contentType,
        },
        customMetadata: {
          sha256: obj.sha256,
        },
        body: stream,
        range: options?.range
          ? { offset: rangeOffset, length: rangeLength }
          : undefined,
        arrayBuffer: async () =>
          returnedBytes.slice().buffer as ArrayBuffer,
        text: async () => new TextDecoder().decode(returnedBytes),
        json: async () => JSON.parse(new TextDecoder().decode(returnedBytes)),
        blob: async () => new Blob([returnedBytes.slice()]),
        writeHttpMetadata: () => {},
      };
    },
  };
}

describe("Cloudflare Media Worker Gateway (adlabs-media-dev)", () => {
  const sampleSha =
    "8bac4800c6273bccf86e4e4275c1553fd58821a0a0dc19f595c95ff599374f59";
  const sampleKey = `media/sha256/${sampleSha}`;
  const videoData = new Uint8Array(1000).fill(65); // 1000 bytes of 'A'

  const mockBucket = createMockR2Bucket({
    [sampleKey]: {
      data: videoData,
      contentType: "video/mp4",
      sha256: sampleSha,
    },
  });

  const env: Env = {
    MEDIA_BUCKET: mockBucket,
  };

  it("1. GET /media/sha256/<sha> returns 200 with streaming body and correct headers", async () => {
    const request = new Request(
      `https://media.brainfoods.in/media/sha256/${sampleSha}`,
      {
        method: "GET",
      },
    );

    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(response.headers.get("Content-Length")).toBe("1000");
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("ETag")).toBe(`"${sampleSha}"`);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, s-maxage=31536000, immutable",
    );

    const body = await response.arrayBuffer();
    expect(body.byteLength).toBe(1000);
  });

  it("2. HEAD /media/sha256/<sha> returns 200 with metadata and empty body", async () => {
    const request = new Request(
      `https://media.brainfoods.in/media/sha256/${sampleSha}`,
      {
        method: "HEAD",
      },
    );

    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(response.headers.get("Content-Length")).toBe("1000");
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("ETag")).toBe(`"${sampleSha}"`);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, s-maxage=31536000, immutable",
    );

    const text = await response.text();
    expect(text).toBe("");
  });

  it("3. rejects unsupported HTTP methods with 405 Method Not Allowed", async () => {
    const methods = ["POST", "PUT", "DELETE", "PATCH", "OPTIONS"];

    for (const method of methods) {
      const req = new Request(
        `https://media.brainfoods.in/media/sha256/${sampleSha}`,
        {
          method,
        },
      );
      const res = await worker.fetch(req, env);
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("GET, HEAD");
    }
  });

  it("4. rejects non-canonical paths with 404 Not Found", async () => {
    const invalidPaths = [
      "/",
      "/media",
      "/media/",
      "/media/sha256",
      "/media/sha256/",
      "/media/sha256/not-a-sha",
      "/media/sha256/8bac4800c6273bccf86e4e4275c1553fd58821a0a0dc19f595c95ff599374f5", // 63 chars
      "/media/sha256/8BAC4800C6273BCCF86E4E4275C1553FD58821A0A0DC19F595C95FF599374F59", // uppercase
      `/media/sha256/${sampleSha}/extra`,
      `/media/sha256/${sampleSha}/sub/file.mp4`,
      `/media/sha256/../${sampleSha}`,
    ];

    for (const path of invalidPaths) {
      const req = new Request(`https://media.brainfoods.in${path}`, {
        method: "GET",
      });
      const res = await worker.fetch(req, env);
      expect(res.status).toBe(404);
    }
  });

  it("5. returns 404 for unknown valid SHA not present in bucket", async () => {
    const unknownSha =
      "0000000000000000000000000000000000000000000000000000000000000000";
    const req = new Request(
      `https://media.brainfoods.in/media/sha256/${unknownSha}`,
      {
        method: "GET",
      },
    );
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(404);
  });

  it("6. supports single byte Range request (206 Partial Content) for video streaming", async () => {
    // Explicit range 0-499 (first 500 bytes)
    const req1 = new Request(
      `https://media.brainfoods.in/media/sha256/${sampleSha}`,
      {
        method: "GET",
        headers: { Range: "bytes=0-499" },
      },
    );
    const res1 = await worker.fetch(req1, env);
    expect(res1.status).toBe(206);
    expect(res1.headers.get("Content-Range")).toBe("bytes 0-499/1000");
    expect(res1.headers.get("Content-Length")).toBe("500");
    expect(res1.headers.get("Accept-Ranges")).toBe("bytes");

    // Open-ended range 500- (last 500 bytes)
    const req2 = new Request(
      `https://media.brainfoods.in/media/sha256/${sampleSha}`,
      {
        method: "GET",
        headers: { Range: "bytes=500-" },
      },
    );
    const res2 = await worker.fetch(req2, env);
    expect(res2.status).toBe(206);
    expect(res2.headers.get("Content-Range")).toBe("bytes 500-999/1000");
    expect(res2.headers.get("Content-Length")).toBe("500");

    // Suffix range -200 (last 200 bytes)
    const req3 = new Request(
      `https://media.brainfoods.in/media/sha256/${sampleSha}`,
      {
        method: "GET",
        headers: { Range: "bytes=-200" },
      },
    );
    const res3 = await worker.fetch(req3, env);
    expect(res3.status).toBe(206);
    expect(res3.headers.get("Content-Range")).toBe("bytes 800-999/1000");
    expect(res3.headers.get("Content-Length")).toBe("200");
  });

  it("7. returns 416 Range Not Satisfiable for out-of-bounds or invalid range", async () => {
    const req = new Request(
      `https://media.brainfoods.in/media/sha256/${sampleSha}`,
      {
        method: "GET",
        headers: { Range: "bytes=2000-3000" },
      },
    );
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */1000");
  });

  it("8. helper parseSingleByteRange correctly parses byte ranges", () => {
    expect(parseSingleByteRange("bytes=0-499", 1000)).toEqual({
      range: { offset: 0, length: 500 },
      start: 0,
      end: 499,
    });
    expect(parseSingleByteRange("bytes=500-", 1000)).toEqual({
      range: { offset: 500, length: 500 },
      start: 500,
      end: 999,
    });
    expect(parseSingleByteRange("bytes=-100", 1000)).toEqual({
      range: { suffix: 100 },
      start: 900,
      end: 999,
    });
    expect(parseSingleByteRange("bytes=1500-2000", 1000)).toBeNull();
    expect(parseSingleByteRange("invalid-range", 1000)).toBeNull();
    expect(parseSingleByteRange("bytes=500-200", 1000)).toBeNull();
  });

  it("9. fails closed with 500 if R2 binding is missing or misconfigured", async () => {
    const req = new Request(
      `https://media.brainfoods.in/media/sha256/${sampleSha}`,
      {
        method: "GET",
      },
    );
    const res = await handleMediaRequest(req, {} as Env);
    expect(res.status).toBe(500);
  });
});
