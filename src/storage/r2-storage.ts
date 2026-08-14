import * as fs from "node:fs";
import {
  HeadObjectCommand,
  PutObjectCommand,
  type HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";
import {
  DownloadedMediaFileMissingError,
  ObjectStorageError,
  StoredObjectConflictError,
} from "./errors";
import { getR2BucketName, getR2Client } from "./r2-client";
import { getDeterministicStorageKey } from "./storage-key";
import type {
  DownloadedMedia,
  StoredMediaInput,
  StoreDownloadedMediaOptions,
} from "./types";

/**
 * Checks if an AWS SDK S3 error indicates a 404 Not Found / NoSuchKey condition.
 */
function isNotFoundS3Error(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e.name === "NotFound" ||
    e.name === "NoSuchKey" ||
    e.$metadata?.httpStatusCode === 404
  );
}

/**
 * Validates that an existing S3/R2 HeadObject output matches the expected asset properties.
 */
function verifyHeadObjectMatch(
  head: HeadObjectCommandOutput,
  downloaded: DownloadedMedia,
  storageKey: string,
  bucketName: string,
): void {
  if (head.ContentLength !== undefined) {
    const existingByteSize = BigInt(head.ContentLength);
    if (existingByteSize !== downloaded.byteSize) {
      throw new StoredObjectConflictError(
        `Existing object in bucket "${bucketName}" at key "${storageKey}" has conflicting ContentLength (${existingByteSize} bytes vs expected ${downloaded.byteSize} bytes)`,
        storageKey,
        bucketName,
        downloaded.sha256,
        downloaded.byteSize,
        existingByteSize,
        head.Metadata?.sha256,
      );
    }
  }

  const existingSha = head.Metadata?.sha256;
  if (existingSha && existingSha.toLowerCase() !== downloaded.sha256.toLowerCase()) {
    throw new StoredObjectConflictError(
      `Existing object in bucket "${bucketName}" at key "${storageKey}" has conflicting SHA-256 metadata ("${existingSha}" vs expected "${downloaded.sha256}")`,
      storageKey,
      bucketName,
      downloaded.sha256,
      downloaded.byteSize,
      head.ContentLength !== undefined ? BigInt(head.ContentLength) : undefined,
      existingSha,
    );
  }
}

/**
 * Stores a DownloadedMedia temporary file in Cloudflare R2 using a deterministic,
 * content-addressed storage key derived strictly from the downloaded bytes' SHA-256.
 *
 * Behavior:
 * 1. Derives deterministic storage key: `media/sha256/{sha256}`.
 * 2. Checks if the object already exists in the bucket via HEAD.
 * 3. If exists: verifies byteSize and SHA metadata (if present), then reuses existing object.
 * 4. If absent (404): streams temp file to R2 via PUT with SHA-256 metadata, then verifies via HEAD.
 * 5. Returns a StoredMediaInput record ready for database persistence.
 *
 * Invariants:
 * - Temporary file cleanup ownership belongs to the caller; storeDownloadedMedia
 *   does NOT automatically delete or clean up `downloaded.tempFilePath`.
 * - No database writes occur in this storage bridge.
 * - Same physical bytes (SHA-256) always target the exact same R2 object key regardless of
 *   mediaType (IMAGE vs VIDEO_PREVIEW) or MIME variations.
 *
 * @param downloaded The verified downloaded media object from downloadMedia().
 * @param options Injectable overrides for testing (s3Client, bucketName).
 */
export async function storeDownloadedMedia(
  downloaded: DownloadedMedia,
  options?: StoreDownloadedMediaOptions,
): Promise<StoredMediaInput> {
  const storageKey = getDeterministicStorageKey(downloaded.sha256);

  // 1. Verify that the temporary file exists on disk and is accessible
  try {
    const stat = await fs.promises.stat(downloaded.tempFilePath);
    if (!stat.isFile()) {
      throw new DownloadedMediaFileMissingError(
        `Temporary media file at "${downloaded.tempFilePath}" is not a regular file`,
        downloaded.tempFilePath,
        storageKey,
      );
    }
  } catch (err: unknown) {
    if (err instanceof DownloadedMediaFileMissingError) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new DownloadedMediaFileMissingError(
      `Temporary media file at "${downloaded.tempFilePath}" does not exist or cannot be accessed: ${msg}`,
      downloaded.tempFilePath,
      storageKey,
    );
  }

  const client = options?.s3Client ?? getR2Client();
  const bucketName = options?.bucketName ?? getR2BucketName();

  // 2. Check if object already exists in R2
  let objectExists = false;
  try {
    const headOutput = await client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: storageKey,
      }),
    );

    // Object exists; verify consistency
    verifyHeadObjectMatch(headOutput, downloaded, storageKey, bucketName);
    objectExists = true;
  } catch (err: unknown) {
    if (err instanceof StoredObjectConflictError) {
      throw err;
    }

    if (!isNotFoundS3Error(err)) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ObjectStorageError(
        `Failed to check object existence in R2 bucket "${bucketName}" for key "${storageKey}": ${msg}`,
        storageKey,
        bucketName,
      );
    }

    // 404 Not Found: object is missing and must be uploaded
    objectExists = false;
  }

  // 3. Upload if missing
  if (!objectExists) {
    const fileStream = fs.createReadStream(downloaded.tempFilePath);

    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: storageKey,
          Body: fileStream,
          ContentLength: Number(downloaded.byteSize),
          ContentType: downloaded.mimeType ?? "application/octet-stream",
          Metadata: {
            sha256: downloaded.sha256,
          },
        }),
      );
    } catch (putErr: unknown) {
      fileStream.destroy();
      const msg = putErr instanceof Error ? putErr.message : String(putErr);
      throw new ObjectStorageError(
        `Failed to upload media object to R2 bucket "${bucketName}" at key "${storageKey}": ${msg}`,
        storageKey,
        bucketName,
      );
    }

    // 4. Post-upload verification HEAD
    try {
      const postHead = await client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: storageKey,
        }),
      );
      verifyHeadObjectMatch(postHead, downloaded, storageKey, bucketName);
    } catch (verifyErr: unknown) {
      if (verifyErr instanceof StoredObjectConflictError) {
        throw verifyErr;
      }
      const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
      throw new ObjectStorageError(
        `Post-upload verification failed for key "${storageKey}" in bucket "${bucketName}": ${msg}`,
        storageKey,
        bucketName,
      );
    }
  }

  return {
    mediaType: downloaded.mediaType,
    sourceUrl: downloaded.sourceUrl,
    sha256: downloaded.sha256,
    mimeType: downloaded.mimeType,
    byteSize: downloaded.byteSize,
    storageProvider: "r2",
    storageKey,
  };
}
