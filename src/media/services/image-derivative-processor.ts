import * as fs from "node:fs";
import * as path from "node:path";
import { eq, and, inArray } from "drizzle-orm";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { mediaAssets, mediaDerivatives } from "@/db/schema";
import { getR2Client, getR2BucketName } from "@/storage/r2-client";
import { storeDownloadedMedia } from "@/storage/r2-storage";
import { isCanonicalMediaStorageKey } from "@/storage";
import { BROWSE_IMAGE_V1, DETAIL_IMAGE_V1 } from "../recipes";
import { optimizeImageDerivative } from "../engine/sharp";
import { probeImageBuffer } from "../image-probe";
import type { ImageDerivativeRecipeConfig } from "../types";
import {
  getOrCreateDerivativeJob,
  markDerivativeProcessing,
  markDerivativeReady,
  markDerivativeFailed,
  updateMediaAssetPhysicalMetadata,
  type DbClient,
  type DerivativeJobRecord,
} from "../persistence/derivative-repository";

export interface ProcessSingleImageDerivativeResult {
  job: DerivativeJobRecord | null;
  derivedMediaAssetId: string | null;
  recipeVersion: string;
  wasAlreadyReady: boolean;
  wasPhysicalAssetReused: boolean;
  sourceByteSize: number;
  derivedByteSize: number;
  derivedWidth: number;
  derivedHeight: number;
  durationMs: number;
}

export interface ProcessImageDerivativesResult {
  sourceMediaAssetId: string;
  sourceByteSize: number;
  browse: ProcessSingleImageDerivativeResult;
  detail: ProcessSingleImageDerivativeResult;
}

export class ImageDerivativeProcessingError extends Error {
  constructor(
    message: string,
    public readonly sourceMediaAssetId: string,
    public readonly stage: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ImageDerivativeProcessingError";
  }
}

/**
 * Downloads an asset from Cloudflare R2 into an in-memory buffer.
 */
async function downloadR2AssetToBuffer(storageKey: string): Promise<Buffer> {
  const client = getR2Client();
  const bucket = getR2BucketName();
  const res = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: storageKey }),
  );

  const chunks: Buffer[] = [];
  const stream = res.Body as NodeJS.ReadableStream;

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on("end", () => resolve());
    stream.on("error", (err) => reject(err));
  });

  return Buffer.concat(chunks);
}

/**
 * Processes a single image derivative profile for a source media asset.
 *
 * Invariants:
 *  1. Operates at the physical media_assets level.
 *  2. Idempotent: returns existing READY derivative immediately if already completed.
 *  3. Physical deduplication: reuses existing media_assets row if derived SHA already exists.
 *  4. Backfills physical metadata on source asset if missing.
 *  5. Isolated failure: marks derivative job as FAILED without throwing database aborts.
 */
export async function processSingleImageDerivative(
  db: DbClient,
  sourceAsset: {
    id: string;
    mediaType: string;
    storageKey: string | null;
    byteSize: bigint | null;
    width: number | null;
    height: number | null;
  },
  sourceBuffer: Buffer,
  recipe: ImageDerivativeRecipeConfig,
  tempBaseDir?: string,
): Promise<ProcessSingleImageDerivativeResult> {
  const sourceMediaAssetId = sourceAsset.id;

  // 1. Get or create derivative job record
  const job = await getOrCreateDerivativeJob(
    db,
    sourceMediaAssetId,
    "DISPLAY_IMAGE",
    recipe.version,
  );

  // If already READY with derived asset ID, return immediately (Idempotency)
  if (job.status === "READY" && job.derivedMediaAssetId) {
    const derivedRows = await db
      .select({
        byteSize: mediaAssets.byteSize,
        width: mediaAssets.width,
        height: mediaAssets.height,
      })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, job.derivedMediaAssetId))
      .limit(1);

    const derived = derivedRows[0];
    return {
      job,
      derivedMediaAssetId: job.derivedMediaAssetId,
      recipeVersion: recipe.version,
      wasAlreadyReady: true,
      wasPhysicalAssetReused: false,
      sourceByteSize: Number(sourceAsset.byteSize ?? sourceBuffer.length),
      derivedByteSize: Number(derived?.byteSize ?? 0),
      derivedWidth: derived?.width ?? 0,
      derivedHeight: derived?.height ?? 0,
      durationMs: 0,
    };
  }

  // 2. Transition job into PROCESSING
  const processingJob = await markDerivativeProcessing(db, job.id);

  const startTime = Date.now();
  let tempFilePath: string | null = null;

  try {
    // 3. Optimize image via Sharp engine
    const optimized = await optimizeImageDerivative({
      input: sourceBuffer,
      recipe,
    });

    const durationMs = Date.now() - startTime;

    // 4. Physical Asset Deduplication: Check if derived SHA-256 already exists in media_assets
    const existingDerived = await db
      .select({
        id: mediaAssets.id,
        width: mediaAssets.width,
        height: mediaAssets.height,
        byteSize: mediaAssets.byteSize,
      })
      .from(mediaAssets)
      .where(eq(mediaAssets.sha256, optimized.sha256))
      .limit(1);

    let derivedAssetId: string;
    let wasPhysicalAssetReused = false;

    if (existingDerived.length > 0 && existingDerived[0]) {
      derivedAssetId = existingDerived[0].id;
      wasPhysicalAssetReused = true;
    } else {
      // Write to temp file for storeDownloadedMedia streaming upload
      const baseDir = tempBaseDir ?? path.join(process.cwd(), "tmp", "media-processing");
      await fs.promises.mkdir(baseDir, { recursive: true });
      tempFilePath = path.join(baseDir, `${processingJob.id}-${recipe.version}.webp`);
      await fs.promises.writeFile(tempFilePath, optimized.buffer);

      const derivedStorageKey = `media/sha256/${optimized.sha256}`;

      // Store in Cloudflare R2
      await storeDownloadedMedia({
        tempFilePath,
        sha256: optimized.sha256,
        mimeType: "image/webp",
        byteSize: BigInt(optimized.byteSize),
        mediaType: "IMAGE",
        sourceUrl: `internal://media/sha256/${optimized.sha256}`,
        finalUrl: `internal://media/sha256/${optimized.sha256}`,
        cleanup: async () => {},
      });

      // Insert new derived media_assets row
      const insertedAsset = await db
        .insert(mediaAssets)
        .values({
          mediaType: "IMAGE",
          mimeType: "image/webp",
          sha256: optimized.sha256,
          storageProvider: "cloudflare_r2",
          storageKey: derivedStorageKey,
          width: optimized.width,
          height: optimized.height,
          byteSize: BigInt(optimized.byteSize),
          hasAudio: false,
          downloadStatus: "STORED",
        })
        .returning();

      if (insertedAsset.length === 0 || !insertedAsset[0]) {
        throw new Error("Failed to insert derived media_assets row");
      }

      derivedAssetId = insertedAsset[0].id;
    }

    // 5. Mark derivative job READY
    const readyJob = await markDerivativeReady(
      db,
      processingJob.id,
      derivedAssetId,
    );

    return {
      job: readyJob,
      derivedMediaAssetId: derivedAssetId,
      recipeVersion: recipe.version,
      wasAlreadyReady: false,
      wasPhysicalAssetReused,
      sourceByteSize: Number(sourceAsset.byteSize ?? sourceBuffer.length),
      derivedByteSize: optimized.byteSize,
      derivedWidth: optimized.width,
      derivedHeight: optimized.height,
      durationMs,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await markDerivativeFailed(db, processingJob.id, errorMsg);
    throw new ImageDerivativeProcessingError(
      `Failed to process ${recipe.version} for source "${sourceMediaAssetId}": ${errorMsg}`,
      sourceMediaAssetId,
      "processing_pipeline",
      err,
    );
  } finally {
    if (tempFilePath) {
      try {
        await fs.promises.unlink(tempFilePath);
      } catch {
        // Non-fatal temp cleanup
      }
    }
  }
}

export interface ProcessImageDerivativesOptions {
  tempBaseDir?: string;
  retryFailed?: boolean;
}

export interface ProcessImageDerivativesResult {
  sourceMediaAssetId: string;
  sourceByteSize: number;
  sourceR2Read: boolean;
  browse: ProcessSingleImageDerivativeResult;
  detail: ProcessSingleImageDerivativeResult;
}

/**
 * Processes both browse-image-v1 and detail-image-v1 derivatives for an IMAGE media asset.
 *
 * Strict Execution Idempotency & Invariants:
 *  1. PREFLIGHT DB CHECK: Queries existing derivative jobs before performing ANY R2 GET or Sharp work.
 *  2. IMMEDIATE EARLY EXIT: If both browse-image-v1 and detail-image-v1 are READY, exits immediately
 *     with ZERO R2 GETs, ZERO Sharp invocations, ZERO memory buffer allocations, and ZERO R2 PUTs.
 *  3. PARTIAL RECIPE SUPPORT: If only one recipe is missing (e.g. browse is READY, detail is missing),
 *     downloads the CANONICAL ORIGINAL once and executes ONLY the missing recipe.
 *  4. SOURCE FIDELITY: Always processes from the canonical original source asset bytes (never derivative-to-derivative).
 *  5. FAILED POLICY: Skips FAILED derivative jobs unless explicit `retryFailed: true` option is provided.
 */
export async function processImageDerivatives(
  db: DbClient,
  sourceMediaAssetId: string,
  options?: ProcessImageDerivativesOptions,
): Promise<ProcessImageDerivativesResult> {
  // 1. Resolve source media asset
  const sourceRows = await db
    .select({
      id: mediaAssets.id,
      mediaType: mediaAssets.mediaType,
      storageKey: mediaAssets.storageKey,
      byteSize: mediaAssets.byteSize,
      width: mediaAssets.width,
      height: mediaAssets.height,
      mimeType: mediaAssets.mimeType,
      downloadStatus: mediaAssets.downloadStatus,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, sourceMediaAssetId))
    .limit(1);

  const sourceAsset = sourceRows[0];
  if (!sourceAsset) {
    throw new ImageDerivativeProcessingError(
      `Source media asset "${sourceMediaAssetId}" does not exist`,
      sourceMediaAssetId,
      "resolve_source",
    );
  }

  if (sourceAsset.mediaType !== "IMAGE") {
    throw new ImageDerivativeProcessingError(
      `Source media asset "${sourceMediaAssetId}" has mediaType "${sourceAsset.mediaType}", expected "IMAGE"`,
      sourceMediaAssetId,
      "validate_media_type",
    );
  }

  if (
    !sourceAsset.storageKey ||
    !isCanonicalMediaStorageKey(sourceAsset.storageKey)
  ) {
    throw new ImageDerivativeProcessingError(
      `Source media asset "${sourceMediaAssetId}" has noncanonical storageKey "${sourceAsset.storageKey}"`,
      sourceMediaAssetId,
      "validate_storage_key",
    );
  }

  // 2. PREFLIGHT DERIVATIVE STATE QUERY (BEFORE ANY R2 GET OR SHARP WORK)
  const existingJobs = await db
    .select({
      id: mediaDerivatives.id,
      sourceMediaAssetId: mediaDerivatives.sourceMediaAssetId,
      derivedMediaAssetId: mediaDerivatives.derivedMediaAssetId,
      derivativeKind: mediaDerivatives.derivativeKind,
      recipeVersion: mediaDerivatives.recipeVersion,
      status: mediaDerivatives.status,
      errorReason: mediaDerivatives.errorReason,
      createdAt: mediaDerivatives.createdAt,
      updatedAt: mediaDerivatives.updatedAt,
      derivedByteSize: mediaAssets.byteSize,
      derivedWidth: mediaAssets.width,
      derivedHeight: mediaAssets.height,
    })
    .from(mediaDerivatives)
    .leftJoin(mediaAssets, eq(mediaDerivatives.derivedMediaAssetId, mediaAssets.id))
    .where(
      and(
        eq(mediaDerivatives.sourceMediaAssetId, sourceMediaAssetId),
        eq(mediaDerivatives.derivativeKind, "DISPLAY_IMAGE"),
        inArray(mediaDerivatives.recipeVersion, [
          BROWSE_IMAGE_V1.version,
          DETAIL_IMAGE_V1.version,
        ]),
      ),
    );

  const browseJob = existingJobs.find((j) => j.recipeVersion === BROWSE_IMAGE_V1.version);
  const detailJob = existingJobs.find((j) => j.recipeVersion === DETAIL_IMAGE_V1.version);

  const browseIsReady = browseJob?.status === "READY" && !!browseJob.derivedMediaAssetId;
  const detailIsReady = detailJob?.status === "READY" && !!detailJob.derivedMediaAssetId;

  const retryFailed = options?.retryFailed ?? false;
  const browseIsFailed = browseJob?.status === "FAILED";
  const detailIsFailed = detailJob?.status === "FAILED";

  const needBrowse = !browseIsReady && (retryFailed || !browseIsFailed);
  const needDetail = !detailIsReady && (retryFailed || !detailIsFailed);

  // 3. IMMEDIATE EARLY EXIT IF NEITHER RECIPE REQUIRES WORK (ZERO R2 READ, ZERO SHARP, ZERO R2 PUT)
  if (!needBrowse && !needDetail) {
    const browseRecord: DerivativeJobRecord | null = browseJob
      ? {
          id: browseJob.id,
          sourceMediaAssetId,
          derivedMediaAssetId: browseJob.derivedMediaAssetId,
          derivativeKind: "DISPLAY_IMAGE",
          recipeVersion: BROWSE_IMAGE_V1.version,
          status: browseJob.status,
          errorReason: browseJob.errorReason,
          createdAt: browseJob.createdAt,
          updatedAt: browseJob.updatedAt,
        }
      : null;

    const detailRecord: DerivativeJobRecord | null = detailJob
      ? {
          id: detailJob.id,
          sourceMediaAssetId,
          derivedMediaAssetId: detailJob.derivedMediaAssetId,
          derivativeKind: "DISPLAY_IMAGE",
          recipeVersion: DETAIL_IMAGE_V1.version,
          status: detailJob.status,
          errorReason: detailJob.errorReason,
          createdAt: detailJob.createdAt,
          updatedAt: detailJob.updatedAt,
        }
      : null;

    return {
      sourceMediaAssetId,
      sourceByteSize: Number(sourceAsset.byteSize ?? 0),
      sourceR2Read: false,
      browse: {
        job: browseRecord,
        derivedMediaAssetId: browseJob?.derivedMediaAssetId ?? null,
        recipeVersion: BROWSE_IMAGE_V1.version,
        wasAlreadyReady: browseIsReady,
        wasPhysicalAssetReused: false,
        sourceByteSize: Number(sourceAsset.byteSize ?? 0),
        derivedByteSize: Number(browseJob?.derivedByteSize ?? 0),
        derivedWidth: browseJob?.derivedWidth ?? 0,
        derivedHeight: browseJob?.derivedHeight ?? 0,
        durationMs: 0,
      },
      detail: {
        job: detailRecord,
        derivedMediaAssetId: detailJob?.derivedMediaAssetId ?? null,
        recipeVersion: DETAIL_IMAGE_V1.version,
        wasAlreadyReady: detailIsReady,
        wasPhysicalAssetReused: false,
        sourceByteSize: Number(sourceAsset.byteSize ?? 0),
        derivedByteSize: Number(detailJob?.derivedByteSize ?? 0),
        derivedWidth: detailJob?.derivedWidth ?? 0,
        derivedHeight: detailJob?.derivedHeight ?? 0,
        durationMs: 0,
      },
    };
  }

  // 4. AT LEAST ONE RECIPE REQUIRES WORK
  // Fetch canonical original source from R2 ONCE
  const sourceBuffer = await downloadR2AssetToBuffer(sourceAsset.storageKey);

  // Backfill physical dimensions on source asset if missing
  if (
    sourceAsset.width === null ||
    sourceAsset.height === null ||
    sourceAsset.byteSize === null
  ) {
    const probe = probeImageBuffer(sourceBuffer);
    if (probe) {
      await updateMediaAssetPhysicalMetadata(db, sourceMediaAssetId, {
        width: probe.width,
        height: probe.height,
        durationMs: null,
        hasAudio: false,
        byteSize: BigInt(sourceBuffer.length),
      });
      sourceAsset.width = probe.width;
      sourceAsset.height = probe.height;
      sourceAsset.byteSize = BigInt(sourceBuffer.length);
    }
  }

  // 5. Generate ONLY the needed recipes (Partial Recipe Support)
  let browseResult: ProcessSingleImageDerivativeResult;
  if (needBrowse) {
    browseResult = await processSingleImageDerivative(
      db,
      sourceAsset,
      sourceBuffer,
      BROWSE_IMAGE_V1,
      options?.tempBaseDir,
    );
  } else {
    const browseRecord: DerivativeJobRecord | null = browseJob
      ? {
          id: browseJob.id,
          sourceMediaAssetId,
          derivedMediaAssetId: browseJob.derivedMediaAssetId,
          derivativeKind: "DISPLAY_IMAGE",
          recipeVersion: BROWSE_IMAGE_V1.version,
          status: browseJob.status,
          errorReason: browseJob.errorReason,
          createdAt: browseJob.createdAt,
          updatedAt: browseJob.updatedAt,
        }
      : null;

    browseResult = {
      job: browseRecord,
      derivedMediaAssetId: browseJob?.derivedMediaAssetId ?? null,
      recipeVersion: BROWSE_IMAGE_V1.version,
      wasAlreadyReady: browseIsReady,
      wasPhysicalAssetReused: false,
      sourceByteSize: Number(sourceAsset.byteSize ?? sourceBuffer.length),
      derivedByteSize: Number(browseJob?.derivedByteSize ?? 0),
      derivedWidth: browseJob?.derivedWidth ?? 0,
      derivedHeight: browseJob?.derivedHeight ?? 0,
      durationMs: 0,
    };
  }

  let detailResult: ProcessSingleImageDerivativeResult;
  if (needDetail) {
    detailResult = await processSingleImageDerivative(
      db,
      sourceAsset,
      sourceBuffer,
      DETAIL_IMAGE_V1,
      options?.tempBaseDir,
    );
  } else {
    const detailRecord: DerivativeJobRecord | null = detailJob
      ? {
          id: detailJob.id,
          sourceMediaAssetId,
          derivedMediaAssetId: detailJob.derivedMediaAssetId,
          derivativeKind: "DISPLAY_IMAGE",
          recipeVersion: DETAIL_IMAGE_V1.version,
          status: detailJob.status,
          errorReason: detailJob.errorReason,
          createdAt: detailJob.createdAt,
          updatedAt: detailJob.updatedAt,
        }
      : null;

    detailResult = {
      job: detailRecord,
      derivedMediaAssetId: detailJob?.derivedMediaAssetId ?? null,
      recipeVersion: DETAIL_IMAGE_V1.version,
      wasAlreadyReady: detailIsReady,
      wasPhysicalAssetReused: false,
      sourceByteSize: Number(sourceAsset.byteSize ?? sourceBuffer.length),
      derivedByteSize: Number(detailJob?.derivedByteSize ?? 0),
      derivedWidth: detailJob?.derivedWidth ?? 0,
      derivedHeight: detailJob?.derivedHeight ?? 0,
      durationMs: 0,
    };
  }

  return {
    sourceMediaAssetId,
    sourceByteSize: sourceBuffer.length,
    sourceR2Read: true,
    browse: browseResult,
    detail: detailResult,
  };
}
