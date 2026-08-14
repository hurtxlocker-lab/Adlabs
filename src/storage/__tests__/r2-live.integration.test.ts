import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { env } from "@/env/server";
import { getR2BucketName, getR2Client } from "../r2-client";

function isNotFoundS3Error(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e.name === "NotFound" ||
    e.name === "NoSuchKey" ||
    e.$metadata?.httpStatusCode === 404
  );
}

describe("Live Cloudflare R2 Smoke Test (DEV Bucket)", () => {
  it("authenticates, uploads isolated test fixture, verifies HEAD + metadata, and deletes exact object", async () => {
    // 1. Verify R2 environment configuration is present
    if (
      !env.R2_ACCOUNT_ID ||
      !env.R2_ACCESS_KEY_ID ||
      !env.R2_SECRET_ACCESS_KEY ||
      !env.R2_BUCKET_NAME
    ) {
      throw new Error(
        "Missing required R2 credentials in environment (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME). Ensure they are configured in .env.local before running test:r2.",
      );
    }

    const client = getR2Client();
    const bucketName = getR2BucketName();

    // 2. Generate small local fixture and compute exact SHA-256
    const fixturePayload = Buffer.from(
      `AdLabs R2 Smoke Test Payload: ${Date.now()}_${crypto.randomBytes(16).toString("hex")}`,
      "utf-8",
    );
    const expectedSha = crypto
      .createHash("sha256")
      .update(fixturePayload)
      .digest("hex")
      .toLowerCase();
    const expectedLength = fixturePayload.length;

    // 3. Isolated test namespace: test/adlabs-r2-smoke/<timestamp_runId>/<sha256>
    const runId = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
    const testKey = `test/adlabs-r2-smoke/${runId}/${expectedSha}`;

    const tempFilePath = path.join(
      os.tmpdir(),
      `adlabs_r2_smoke_${runId}.tmp`,
    );
    await fs.promises.writeFile(tempFilePath, fixturePayload);

    let uploaded = false;

    try {
      // 4. Pre-check: verify testKey does not already exist
      try {
        await client.send(
          new HeadObjectCommand({
            Bucket: bucketName,
            Key: testKey,
          }),
        );
        throw new Error(
          `Unexpected collision: Test key "${testKey}" already exists in bucket "${bucketName}". Aborting upload.`,
        );
      } catch (headErr: unknown) {
        if (!isNotFoundS3Error(headErr)) {
          const msg =
            headErr instanceof Error ? headErr.message : String(headErr);
          throw new Error(
            `Failed initial HEAD check on bucket "${bucketName}" for key "${testKey}": ${msg}`,
          );
        }
        // Expected: 404 Not Found
      }

      // 5. Upload test fixture via PutObjectCommand
      const fileStream = fs.createReadStream(tempFilePath);
      await client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: testKey,
          Body: fileStream,
          ContentLength: expectedLength,
          ContentType: "application/octet-stream",
          Metadata: {
            sha256: expectedSha,
          },
        }),
      );
      uploaded = true;

      // 6. Verify via HeadObjectCommand
      const headOutput = await client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: testKey,
        }),
      );

      expect(headOutput.ContentLength).toBe(expectedLength);
      expect(headOutput.Metadata?.sha256?.toLowerCase()).toBe(expectedSha);

      // 7. Delete exact test object
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: testKey,
        }),
      );
      uploaded = false;

      // 8. Confirm absence via post-delete HeadObject
      let confirmedDeleted = false;
      try {
        await client.send(
          new HeadObjectCommand({
            Bucket: bucketName,
            Key: testKey,
          }),
        );
      } catch (postDeleteErr: unknown) {
        if (isNotFoundS3Error(postDeleteErr)) {
          confirmedDeleted = true;
        } else {
          const msg =
            postDeleteErr instanceof Error
              ? postDeleteErr.message
              : String(postDeleteErr);
          throw new Error(
            `Unexpected error during post-delete verification for "${testKey}": ${msg}`,
          );
        }
      }

      expect(confirmedDeleted).toBe(true);
    } finally {
      // 9. Strict cleanup: ensure testKey is removed from R2 if anything failed
      if (uploaded) {
        try {
          await client.send(
            new DeleteObjectCommand({
              Bucket: bucketName,
              Key: testKey,
            }),
          );
        } catch {
          console.error(
            `⚠️ WARNING: Failed to clean up live test object at key "${testKey}" in bucket "${bucketName}". Manual deletion may be required.`,
          );
        }
      }

      // Remove local temp file
      try {
        await fs.promises.unlink(tempFilePath);
      } catch {
        // ignore
      }
    }
  });
});
