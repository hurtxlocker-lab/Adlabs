import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DownloadedMediaFileMissingError,
  ObjectStorageError,
  StoredObjectConflictError,
} from "../errors";
import { storeDownloadedMedia } from "../r2-storage";
import type { DownloadedMedia } from "../types";

describe("R2 Storage Bridge Unit Tests (Mock S3 — True SHA-Addressed Identity)", () => {
  const sampleSha =
    "8bac4800c6273bccf86e4e4275c1553fd58821a0a0dc19f595c95ff599374f59";
  const sampleBytes = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ]);
  const sampleByteSize = BigInt(sampleBytes.length);

  let tempFilePath: string;
  let downloaded: DownloadedMedia;

  beforeEach(async () => {
    tempFilePath = path.join(
      os.tmpdir(),
      `test_r2_storage_${Date.now()}_${crypto.randomBytes(6).toString("hex")}.tmp`,
    );
    await fs.promises.writeFile(tempFilePath, sampleBytes);

    downloaded = {
      sourceUrl: "https://cdn.example.com/ad_image.jpg?token=secret123",
      finalUrl: "https://cdn.example.com/ad_image.jpg",
      sha256: sampleSha,
      byteSize: sampleByteSize,
      mimeType: "image/jpeg",
      mediaType: "IMAGE",
      tempFilePath,
      cleanup: async () => {
        try {
          await fs.promises.unlink(tempFilePath);
        } catch {
          // ignore
        }
      },
    };
  });

  afterEach(async () => {
    try {
      await fs.promises.unlink(tempFilePath);
    } catch {
      // ignore
    }
  });

  function createMockS3Client(options: {
    existingHead?: {
      ContentLength?: number;
      Metadata?: Record<string, string>;
      ContentType?: string;
    } | null;
    headError?: Error | null;
    putError?: Error | null;
    postHeadError?: Error | null;
    postHeadOutput?: {
      ContentLength?: number;
      Metadata?: Record<string, string>;
    } | null;
  }): {
    client: S3Client;
    headCalls: HeadObjectCommand[];
    putCalls: PutObjectCommand[];
  } {
    const headCalls: HeadObjectCommand[] = [];
    const putCalls: PutObjectCommand[] = [];

    let isPostUpload = false;

    const mockSend = vi.fn(async (command: unknown) => {
      if (command instanceof HeadObjectCommand) {
        headCalls.push(command);

        if (isPostUpload) {
          if (options.postHeadError) {
            throw options.postHeadError;
          }
          return (
            options.postHeadOutput ?? {
              ContentLength: Number(sampleByteSize),
              Metadata: { sha256: sampleSha },
            }
          );
        }

        if (options.headError) {
          throw options.headError;
        }

        if (options.existingHead) {
          return options.existingHead;
        }

        const notFoundErr = new Error("NotFound");
        notFoundErr.name = "NotFound";
        (notFoundErr as unknown as { $metadata: { httpStatusCode: number } }).$metadata = {
          httpStatusCode: 404,
        };
        throw notFoundErr;
      }

      if (command instanceof PutObjectCommand) {
        putCalls.push(command);
        if (
          command.input.Body &&
          typeof (command.input.Body as NodeJS.ReadableStream).on === "function"
        ) {
          const bodyStream = command.input.Body as NodeJS.ReadableStream;
          await new Promise<void>((resolve) => {
            bodyStream.on("data", () => {});
            bodyStream.on("end", resolve);
            bodyStream.on("close", resolve);
            bodyStream.on("error", resolve);
            bodyStream.resume();
          });
        }
        if (options.putError) {
          throw options.putError;
        }
        isPostUpload = true;
        return {};
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const client = {
      send: mockSend,
    } as unknown as S3Client;

    return { client, headCalls, putCalls };
  }

  it("1. HEAD existing valid object: reuses object without calling PutObject, key is media/sha256/<sha>", async () => {
    const { client, headCalls, putCalls } = createMockS3Client({
      existingHead: {
        ContentLength: Number(sampleByteSize),
        Metadata: { sha256: sampleSha },
      },
    });

    const result = await storeDownloadedMedia(downloaded, {
      s3Client: client,
      bucketName: "adlabs-test-bucket",
    });

    expect(headCalls.length).toBe(1);
    expect(putCalls.length).toBe(0);
    expect(result).toEqual({
      mediaType: "IMAGE",
      sourceUrl: downloaded.sourceUrl,
      sha256: sampleSha,
      mimeType: "image/jpeg",
      byteSize: sampleByteSize,
      storageProvider: "r2",
      storageKey: `media/sha256/${sampleSha}`,
    });
  });

  it("2. same SHA as VIDEO_PREVIEW targets the exact same storage key media/sha256/<sha>", async () => {
    const previewDownloaded: DownloadedMedia = {
      ...downloaded,
      mediaType: "VIDEO_PREVIEW",
    };

    const { client, headCalls, putCalls } = createMockS3Client({
      existingHead: {
        ContentLength: Number(sampleByteSize),
        Metadata: { sha256: sampleSha },
      },
    });

    const result = await storeDownloadedMedia(previewDownloaded, {
      s3Client: client,
      bucketName: "adlabs-test-bucket",
    });

    expect(headCalls[0].input.Key).toBe(`media/sha256/${sampleSha}`);
    expect(result.storageKey).toBe(`media/sha256/${sampleSha}`);
    expect(result.mediaType).toBe("VIDEO_PREVIEW");
    expect(putCalls.length).toBe(0);
  });

  it("3. same SHA as VIDEO targets the exact same storage key media/sha256/<sha>", async () => {
    const videoDownloaded: DownloadedMedia = {
      ...downloaded,
      mediaType: "VIDEO",
      mimeType: "video/mp4",
    };

    const { client, headCalls } = createMockS3Client({
      existingHead: {
        ContentLength: Number(sampleByteSize),
        Metadata: { sha256: sampleSha },
      },
    });

    const result = await storeDownloadedMedia(videoDownloaded, {
      s3Client: client,
      bucketName: "adlabs-test-bucket",
    });

    expect(headCalls[0].input.Key).toBe(`media/sha256/${sampleSha}`);
    expect(result.storageKey).toBe(`media/sha256/${sampleSha}`);
  });

  it("4. same SHA with different MIME targets the exact same storage key and reuses existing object", async () => {
    const altMimeDownloaded: DownloadedMedia = {
      ...downloaded,
      mimeType: "image/webp",
    };

    const { client, headCalls, putCalls } = createMockS3Client({
      existingHead: {
        ContentLength: Number(sampleByteSize),
        ContentType: "image/jpeg", // Existing object has jpeg
        Metadata: { sha256: sampleSha },
      },
    });

    const result = await storeDownloadedMedia(altMimeDownloaded, {
      s3Client: client,
      bucketName: "adlabs-test-bucket",
    });

    expect(headCalls[0].input.Key).toBe(`media/sha256/${sampleSha}`);
    expect(result.storageKey).toBe(`media/sha256/${sampleSha}`);
    expect(putCalls.length).toBe(0); // Reused without PUT
  });

  it("5. HEAD not found: uploads via PutObject with metadata (sha256 only) and verifies via post-upload HEAD", async () => {
    const { client, headCalls, putCalls } = createMockS3Client({});

    const result = await storeDownloadedMedia(downloaded, {
      s3Client: client,
      bucketName: "adlabs-test-bucket",
    });

    expect(headCalls.length).toBe(2);
    expect(putCalls.length).toBe(1);

    const putCommand = putCalls[0];
    expect(putCommand.input.Bucket).toBe("adlabs-test-bucket");
    expect(putCommand.input.Key).toBe(`media/sha256/${sampleSha}`);
    expect(putCommand.input.ContentType).toBe("image/jpeg");
    expect(putCommand.input.ContentLength).toBe(Number(sampleByteSize));
    // Metadata must contain ONLY sha256 (no semantic mediatype)
    expect(putCommand.input.Metadata).toEqual({
      sha256: sampleSha,
    });

    expect(result.storageKey).toBe(`media/sha256/${sampleSha}`);
    expect(result.storageProvider).toBe("r2");
  });

  it("6. existing object with conflicting ContentLength throws StoredObjectConflictError", async () => {
    const { client } = createMockS3Client({
      existingHead: {
        ContentLength: 999999, // Mismatched size
        Metadata: { sha256: sampleSha },
      },
    });

    await expect(
      storeDownloadedMedia(downloaded, {
        s3Client: client,
        bucketName: "adlabs-test-bucket",
      }),
    ).rejects.toThrow(StoredObjectConflictError);
  });

  it("7. existing object with conflicting SHA metadata throws StoredObjectConflictError", async () => {
    const { client } = createMockS3Client({
      existingHead: {
        ContentLength: Number(sampleByteSize),
        Metadata: { sha256: "different_sha_256_hash_value_here_which_conflicts_1234567890123456" },
      },
    });

    await expect(
      storeDownloadedMedia(downloaded, {
        s3Client: client,
        bucketName: "adlabs-test-bucket",
      }),
    ).rejects.toThrow(StoredObjectConflictError);
  });

  it("8. non-404 HeadObject error fails without attempting PutObject", async () => {
    const forbiddenErr = new Error("Access Denied");
    forbiddenErr.name = "AccessDenied";
    (forbiddenErr as unknown as { $metadata: { httpStatusCode: number } }).$metadata = {
      httpStatusCode: 403,
    };

    const { client, putCalls } = createMockS3Client({
      headError: forbiddenErr,
    });

    await expect(
      storeDownloadedMedia(downloaded, {
        s3Client: client,
        bucketName: "adlabs-test-bucket",
      }),
    ).rejects.toThrow(ObjectStorageError);

    expect(putCalls.length).toBe(0);
  });

  it("9. fails before S3 calls if downloaded temp file is missing", async () => {
    const missingTempPath = path.join(
      os.tmpdir(),
      `missing_file_${Date.now()}.tmp`,
    );
    const missingDownloaded: DownloadedMedia = {
      ...downloaded,
      tempFilePath: missingTempPath,
    };

    const { client, headCalls, putCalls } = createMockS3Client({});

    await expect(
      storeDownloadedMedia(missingDownloaded, {
        s3Client: client,
        bucketName: "adlabs-test-bucket",
      }),
    ).rejects.toThrow(DownloadedMediaFileMissingError);

    expect(headCalls.length).toBe(0);
    expect(putCalls.length).toBe(0);
  });

  it("10. post-upload verification failure throws ObjectStorageError", async () => {
    const verifyErr = new Error("Post-upload HEAD not available");
    verifyErr.name = "InternalError";

    const { client } = createMockS3Client({
      postHeadError: verifyErr,
    });

    await expect(
      storeDownloadedMedia(downloaded, {
        s3Client: client,
        bucketName: "adlabs-test-bucket",
      }),
    ).rejects.toThrow(ObjectStorageError);
  });

  it("11. storeDownloadedMedia does NOT call downloaded.cleanup() automatically", async () => {
    const { client } = createMockS3Client({});

    await storeDownloadedMedia(downloaded, {
      s3Client: client,
      bucketName: "adlabs-test-bucket",
    });

    // File should still exist on disk after storeDownloadedMedia
    expect(fs.existsSync(tempFilePath)).toBe(true);

    // Caller executes cleanup
    await downloaded.cleanup();
    expect(fs.existsSync(tempFilePath)).toBe(false);
  });
});
