import * as fs from "node:fs";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { mediaAssets } from "@/db/schema";
import { getR2Client, getR2BucketName } from "@/storage/r2-client";
import { storeDownloadedMedia } from "@/storage/r2-storage";
import { isCanonicalMediaStorageKey } from "@/storage";
import { PREVIEW_LOOP_V1 } from "../recipes";
import { encodeVideoDerivative } from "../engine/ffmpeg";
import { probeMediaFile } from "../engine/ffprobe";
import { computeFileSha256 } from "../engine/hashing";
import {
  getOrCreateDerivativeJob,
  markDerivativeProcessing,
  markDerivativeReady,
  markDerivativeFailed,
  updateMediaAssetPhysicalMetadata,
  type DbClient,
  type DerivativeJobRecord,
} from "../persistence/derivative-repository";

export interface ProcessPreviewLoopResult {
  job: DerivativeJobRecord;
  derivedMediaAssetId: string | null;
  wasAlreadyReady: boolean;
  wasPhysicalAssetReused: boolean;
  sourceByteSize: number;
  derivedByteSize: number;
  encodeDurationMs: number;
}

export class DerivativeProcessingError extends Error {
  constructor(
    message: string,
    public readonly sourceMediaAssetId: string,
    public readonly stage: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DerivativeProcessingError";
  }
}

/**
 * Downloads an asset from Cloudflare R2 to a local destination file path.
 */
async function downloadR2AssetToFile(storageKey: string, destPath: string): Promise<void> {
  const client = getR2Client();
  const bucket = getR2BucketName();
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: storageKey }));

  await new Promise<void>((resolve, reject) => {
    const fileStream = fs.createWriteStream(destPath);
    (res.Body as NodeJS.ReadableStream).pipe(fileStream);
    fileStream.on("finish", () => resolve());
    fileStream.on("error", (err) => reject(err));
  });
}

/**
 * Processes a PREVIEW_LOOP derivative for a given source media asset ID using the frozen preview-loop-v1 recipe.
 *
 * Strict Invariants:
 * 1. Operates at the physical media_assets level (never ad-ID coupled).
 * 2. Idempotent: returns existing READY derivative job immediately if already completed.
 * 3. Reuses existing physical derived media asset if matching SHA-256 already exists.
 * 4. Backfills physical metadata on source asset if missing.
 * 5. Cleans up all temporary files regardless of outcome.
 * 6. Isolated failure: marks derivative job as FAILED without throwing fatal database aborts.
 */
export async function processPreviewLoopDerivative(
  db: DbClient,
  sourceMediaAssetId: string,
  options?: {
    tempBaseDir?: string;
  },
): Promise<ProcessPreviewLoopResult> {
  // 1. Resolve source media asset
  const sourceRows = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, sourceMediaAssetId))
    .limit(1);

  const sourceAsset = sourceRows[0];
  if (!sourceAsset) {
    throw new DerivativeProcessingError(
      `Source media asset "${sourceMediaAssetId}" does not exist`,
      sourceMediaAssetId,
      "resolve_source",
    );
  }

  if (sourceAsset.mediaType !== "VIDEO") {
    throw new DerivativeProcessingError(
      `Source media asset "${sourceMediaAssetId}" has mediaType "${sourceAsset.mediaType}", expected "VIDEO"`,
      sourceMediaAssetId,
      "validate_media_type",
    );
  }

  if (!sourceAsset.storageKey || !isCanonicalMediaStorageKey(sourceAsset.storageKey)) {
    throw new DerivativeProcessingError(
      `Source media asset "${sourceMediaAssetId}" has noncanonical storageKey "${sourceAsset.storageKey}"`,
      sourceMediaAssetId,
      "validate_storage_key",
    );
  }

  // 2. Check or create derivative job record
  const job = await getOrCreateDerivativeJob(
    db,
    sourceMediaAssetId,
    "PREVIEW_LOOP",
    PREVIEW_LOOP_V1.version,
  );

  // If already READY with derived asset ID, return immediately (Idempotency)
  if (job.status === "READY" && job.derivedMediaAssetId) {
    const derivedRows = await db
      .select({ byteSize: mediaAssets.byteSize })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, job.derivedMediaAssetId))
      .limit(1);

    return {
      job,
      derivedMediaAssetId: job.derivedMediaAssetId,
      wasAlreadyReady: true,
      wasPhysicalAssetReused: false,
      sourceByteSize: Number(sourceAsset.byteSize ?? 0),
      derivedByteSize: Number(derivedRows[0]?.byteSize ?? 0),
      encodeDurationMs: 0,
    };
  }

  // 3. Transition job into PROCESSING
  const processingJob = await markDerivativeProcessing(db, job.id);

  // 4. Setup temporary workspace
  const baseTempDir = options?.tempBaseDir ?? path.join(process.cwd(), "tmp", "media-processing");
  const jobTempDir = path.join(baseTempDir, processingJob.id);
  await fs.promises.mkdir(jobTempDir, { recursive: true });

  const sourceTempPath = path.join(jobTempDir, "source.mp4");
  const derivedTempPath = path.join(jobTempDir, "preview-loop-v1.mp4");

  let encodeDurationMs = 0;

  try {
    // 5. Download original source from R2
    await downloadR2AssetToFile(sourceAsset.storageKey, sourceTempPath);

    // 6. Check and backfill source physical metadata if missing
    if (
      sourceAsset.width === null ||
      sourceAsset.height === null ||
      sourceAsset.durationMs === null ||
      sourceAsset.hasAudio === null ||
      sourceAsset.byteSize === null
    ) {
      const sourceProbe = await probeMediaFile(sourceTempPath);
      const sourceStat = await fs.promises.stat(sourceTempPath);
      await updateMediaAssetPhysicalMetadata(db, sourceMediaAssetId, {
        width: sourceProbe.width,
        height: sourceProbe.height,
        durationMs: sourceProbe.durationMs,
        hasAudio: sourceProbe.hasAudio,
        byteSize: BigInt(sourceStat.size),
      });
    }

    // 7. Encode preview loop derivative locally via FFmpeg
    const encodeStart = Date.now();
    await encodeVideoDerivative({
      inputPath: sourceTempPath,
      outputPath: derivedTempPath,
      recipe: PREVIEW_LOOP_V1,
      timeoutMs: 45000,
    });
    encodeDurationMs = Date.now() - encodeStart;

    // 8. Validate output derivative
    const derivedStat = await fs.promises.stat(derivedTempPath);
    if (!derivedStat.isFile() || derivedStat.size === 0) {
      throw new Error("FFmpeg produced an empty or missing output file");
    }

    const derivedProbe = await probeMediaFile(derivedTempPath);
    if (!derivedProbe.width || !derivedProbe.height) {
      throw new Error("FFmpeg output is not decodable or has invalid dimensions");
    }

    if (derivedProbe.hasAudio) {
      throw new Error("FFmpeg output unexpectedly contains audio stream");
    }

    const maxEdge = Math.max(derivedProbe.width, derivedProbe.height);
    if (maxEdge > PREVIEW_LOOP_V1.maxLongEdge) {
      throw new Error(
        `FFmpeg output long edge ${maxEdge}px exceeds recipe bound ${PREVIEW_LOOP_V1.maxLongEdge}px`,
      );
    }

    // 9. Compute exact derived SHA-256
    const derivedSha = await computeFileSha256(derivedTempPath);
    const derivedStorageKey = `media/sha256/${derivedSha}`;

    // 10. Check if this exact physical asset already exists in PostgreSQL
    let derivedAssetId: string;
    let wasPhysicalAssetReused = false;

    const existingDerivedRows = await db
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(eq(mediaAssets.sha256, derivedSha))
      .limit(1);

    if (existingDerivedRows.length > 0 && existingDerivedRows[0]) {
      derivedAssetId = existingDerivedRows[0].id;
      wasPhysicalAssetReused = true;
    } else {
      // Store to Cloudflare R2
      await storeDownloadedMedia({
        tempFilePath: derivedTempPath,
        sha256: derivedSha,
        mimeType: "video/mp4",
        byteSize: BigInt(derivedStat.size),
        mediaType: "VIDEO",
        sourceUrl: `internal://media/sha256/${derivedSha}`,
        finalUrl: `internal://media/sha256/${derivedSha}`,
        cleanup: async () => {},
      });

      // Insert derived media asset record
      const insertedAsset = await db
        .insert(mediaAssets)
        .values({
          mediaType: "VIDEO",
          mimeType: "video/mp4",
          sha256: derivedSha,
          storageProvider: "cloudflare_r2",
          storageKey: derivedStorageKey,
          width: derivedProbe.width,
          height: derivedProbe.height,
          durationMs: derivedProbe.durationMs ?? 3500,
          byteSize: BigInt(derivedStat.size),
          hasAudio: false,
          downloadStatus: "STORED",
        })
        .returning();

      if (insertedAsset.length === 0 || !insertedAsset[0]) {
        throw new Error("Failed to insert derived media_assets row");
      }

      derivedAssetId = insertedAsset[0].id;
    }

    // 11. Mark derivative job READY
    const readyJob = await markDerivativeReady(db, processingJob.id, derivedAssetId);

    return {
      job: readyJob,
      derivedMediaAssetId: derivedAssetId,
      wasAlreadyReady: false,
      wasPhysicalAssetReused,
      sourceByteSize: Number(sourceAsset.byteSize ?? 0),
      derivedByteSize: derivedStat.size,
      encodeDurationMs,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await markDerivativeFailed(db, processingJob.id, errorMsg);
    throw new DerivativeProcessingError(
      `Failed to process PREVIEW_LOOP for source "${sourceMediaAssetId}": ${errorMsg}`,
      sourceMediaAssetId,
      "processing_pipeline",
      err,
    );
  } finally {
    // 12. Cleanup local temp files
    try {
      await fs.promises.rm(jobTempDir, { recursive: true, force: true });
    } catch {
      // Non-fatal cleanup warning
    }
  }
}
