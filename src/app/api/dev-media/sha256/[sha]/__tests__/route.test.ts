import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, HEAD } from "../route";

// Mock R2 client
const mockSend = vi.fn();
vi.mock("@/storage/r2-client", () => ({
  getR2Client: () => ({ send: mockSend }),
  getR2BucketName: () => "test-bucket",
}));

describe("Dev Media Proxy Route Handler (/api/dev-media/sha256/[sha])", () => {
  const validSha =
    "8bac4800c6273bccf86e4e4275c1553fd58821a0a0dc19f595c95ff599374f59";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("1. returns 404 in production environment", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const req = new NextRequest(`http://localhost:3000/api/dev-media/sha256/${validSha}`);
    const res = await GET(req, { params: Promise.resolve({ sha: validSha }) });

    expect(res.status).toBe(404);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("2. returns 400 for invalid SHA parameter", async () => {
    const req = new NextRequest("http://localhost:3000/api/dev-media/sha256/invalid-sha");
    const res = await GET(req, { params: Promise.resolve({ sha: "invalid-sha" }) });

    expect(res.status).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("3. streams binary media with 200 OK on valid GET request", async () => {
    mockSend.mockResolvedValueOnce({
      ContentType: "image/jpeg",
      ContentLength: 1024,
      ETag: '"etag-123"',
      Body: new ReadableStream(),
    });

    const req = new NextRequest(`http://localhost:3000/api/dev-media/sha256/${validSha}`);
    const res = await GET(req, { params: Promise.resolve({ sha: validSha }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Content-Length")).toBe("1024");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("ETag")).toBe('"etag-123"');
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: "test-bucket",
          Key: `media/sha256/${validSha}`,
        }),
      }),
    );
  });

  it("4. supports HTTP Range header for video seeking with 206 Partial Content", async () => {
    mockSend.mockResolvedValueOnce({
      ContentType: "video/mp4",
      ContentLength: 512,
      ContentRange: "bytes 0-511/1024",
      Body: new ReadableStream(),
    });

    const req = new NextRequest(`http://localhost:3000/api/dev-media/sha256/${validSha}`, {
      headers: { range: "bytes=0-511" },
    });
    const res = await GET(req, { params: Promise.resolve({ sha: validSha }) });

    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-511/1024");
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Range: "bytes=0-511",
        }),
      }),
    );
  });

  it("5. supports HEAD requests returning metadata without body", async () => {
    mockSend.mockResolvedValueOnce({
      ContentType: "image/png",
      ContentLength: 2048,
      ETag: '"png-etag"',
    });

    const req = new NextRequest(`http://localhost:3000/api/dev-media/sha256/${validSha}`);
    const res = await HEAD(req, { params: Promise.resolve({ sha: validSha }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Content-Length")).toBe("2048");
    expect(res.headers.get("ETag")).toBe('"png-etag"');
  });

  it("6. returns 404 when R2 throws NoSuchKey", async () => {
    const notFoundError = new Error("Not Found");
    notFoundError.name = "NoSuchKey";
    mockSend.mockRejectedValueOnce(notFoundError);

    const req = new NextRequest(`http://localhost:3000/api/dev-media/sha256/${validSha}`);
    const res = await GET(req, { params: Promise.resolve({ sha: validSha }) });

    expect(res.status).toBe(404);
  });
});
