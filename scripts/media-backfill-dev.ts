/**
 * scripts/media-backfill-dev.ts
 *
 * Current Corpus PREVIEW_LOOP Backfill Runner (Dev).
 *
 * Hardened Requirements:
 * - Scans all stored VIDEO assets with download_status = 'STORED' and non-null storage_key.
 * - Filters strictly on canonical content-addressed storage keys: media/sha256/<64-hex>.
 * - Skips noncanonical fixture/dummy assets BEFORE job creation (no FAILED rows created for skipped assets).
 * - Excludes any media_assets that are themselves derived outputs of a PREVIEW_LOOP relation.
 * - Generates and stores preview-loop-v1 derivatives in R2 + DB.
 * - Populates missing physical metadata on source assets.
 * - Enforces bounded concurrency (2 workers).
 * - Enforces item-level failure isolation.
 * - Performs NO ad/brand/observation mutations.
 * - Cleanly closes PostgreSQL connection pool in finally block (no unconditional process.exit).
 */

import { createRequire } from "node:module";
import * as path from "node:path";
import { and, eq, isNotNull } from "drizzle-orm";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(__dirname, "..");
const { loadEnvConfig } = require("@next/env") as {
  loadEnvConfig: (dir: string) => void;
};
loadEnvConfig(projectRoot);

import { db, closeDatabaseConnection } from "../src/db/client";
import { mediaAssets, mediaDerivatives } from "../src/db/schema";
import {
  checkFfmpegAvailability,
  processPreviewLoopDerivative,
  PREVIEW_LOOP_V1,
} from "../src/media";
import { isCanonicalMediaStorageKey } from "../src/storage";

interface BackfillSummary {
  scanned: number;
  eligible: number;
  ineligibleSkipped: number;
  alreadyReady: number;
  generated: number;
  reused: number;
  failed: number;
  totalSourceBytes: number;
  totalDerivativeBytes: number;
  derivativeByteSizes: number[];
  encodeTimesMs: number[];
  errors: { assetId: string; error: string }[];
  readyRelations: {
    sourceAssetId: string;
    derivedAssetId: string;
    sourceBytes: number;
    derivedBytes: number;
    compressionRatio: string;
    encodeDurationMs: number;
  }[];
}

async function runWorkerPool<T>(
  items: T[],
  concurrency: number,
  workerFn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      await workerFn(items[current]!, current);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
}

async function main() {
  const startTime = Date.now();
  console.log("================================================================================");
  console.log("AdLabs Media Derivatives — Production preview-loop-v1 Backfill");
  console.log("================================================================================\n");

  // 1. Verify FFmpeg availability
  const bin = await checkFfmpegAvailability();
  if (!bin.ffmpeg || !bin.ffprobe) {
    console.error("❌ FFmpeg/ffprobe not found in system PATH. Cannot proceed with backfill.");
    process.exitCode = 1;
    return;
  }
  console.log(`FFmpeg Engine: ${bin.ffmpegVersion}`);
  console.log(`Recipe:        ${PREVIEW_LOOP_V1.version} (640px, CRF 24, 30fps, 3.5s, yuv420p, libx264)\n`);

  // 2. Query all stored video assets in database
  const allStoredVideoAssets = await db
    .select({
      id: mediaAssets.id,
      mediaType: mediaAssets.mediaType,
      storageKey: mediaAssets.storageKey,
      byteSize: mediaAssets.byteSize,
      sha256: mediaAssets.sha256,
      width: mediaAssets.width,
      height: mediaAssets.height,
      durationMs: mediaAssets.durationMs,
      downloadStatus: mediaAssets.downloadStatus,
    })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.mediaType, "VIDEO"),
        eq(mediaAssets.downloadStatus, "STORED"),
        isNotNull(mediaAssets.storageKey),
      ),
    );

  // 3. Query existing derived media asset IDs to prevent recursive derivation
  const existingDerivedJobRows = await db
    .select({ derivedMediaAssetId: mediaDerivatives.derivedMediaAssetId })
    .from(mediaDerivatives);
  const derivedAssetIdSet = new Set(
    existingDerivedJobRows.map((r) => r.derivedMediaAssetId).filter(Boolean),
  );

  // 4. Partition into eligible canonical source originals vs ineligible/skipped assets
  const eligibleSourceAssets: typeof allStoredVideoAssets = [];
  const skippedIneligibleAssets: { id: string; storageKey: string | null; reason: string }[] = [];

  for (const asset of allStoredVideoAssets) {
    if (derivedAssetIdSet.has(asset.id)) {
      skippedIneligibleAssets.push({
        id: asset.id,
        storageKey: asset.storageKey,
        reason: "Derived asset (cannot derive from derivative)",
      });
    } else if (!isCanonicalMediaStorageKey(asset.storageKey)) {
      skippedIneligibleAssets.push({
        id: asset.id,
        storageKey: asset.storageKey,
        reason: `Noncanonical storageKey "${asset.storageKey}"`,
      });
    } else {
      eligibleSourceAssets.push(asset);
    }
  }

  const summary: BackfillSummary = {
    scanned: allStoredVideoAssets.length,
    eligible: eligibleSourceAssets.length,
    ineligibleSkipped: skippedIneligibleAssets.length,
    alreadyReady: 0,
    generated: 0,
    reused: 0,
    failed: 0,
    totalSourceBytes: 0,
    totalDerivativeBytes: 0,
    derivativeByteSizes: [],
    encodeTimesMs: [],
    errors: [],
    readyRelations: [],
  };

  console.log(`Scanned ${summary.scanned} stored video assets in database.`);
  console.log(`Eligible canonical source originals: ${summary.eligible}.`);
  console.log(`Ineligible/fixture assets skipped:   ${summary.ineligibleSkipped}.\n`);

  if (skippedIneligibleAssets.length > 0) {
    console.log("Skipped Ineligible Assets (Pre-filtered before job creation):");
    for (const [idx, s] of skippedIneligibleAssets.entries()) {
      console.log(`  ${idx + 1}. Source ${s.id.slice(0, 8)} (${s.storageKey}) → SKIPPED: ${s.reason}`);
    }
    console.log("");
  }

  console.log("Starting backfill with worker concurrency = 2...\n");

  await runWorkerPool(eligibleSourceAssets, 2, async (asset, idx) => {
    const shortSourceId = asset.id.slice(0, 8);
    const label = `[${idx + 1}/${eligibleSourceAssets.length}] Source ${shortSourceId}`;

    try {
      const res = await processPreviewLoopDerivative(db, asset.id);

      summary.totalSourceBytes += res.sourceByteSize;
      summary.totalDerivativeBytes += res.derivedByteSize;
      summary.derivativeByteSizes.push(res.derivedByteSize);
      if (res.encodeDurationMs > 0) {
        summary.encodeTimesMs.push(res.encodeDurationMs);
      }

      const compression =
        res.sourceByteSize > 0
          ? `${((1 - res.derivedByteSize / res.sourceByteSize) * 100).toFixed(1)}%`
          : "N/A";

      const shortDerivedId = (res.derivedMediaAssetId ?? "").slice(0, 8);

      if (res.wasAlreadyReady) {
        summary.alreadyReady++;
        console.log(`${label} → ALREADY READY (Derived: ${shortDerivedId}, ${(res.derivedByteSize / 1024).toFixed(1)} KB, -${compression})`);
      } else if (res.wasPhysicalAssetReused) {
        summary.reused++;
        console.log(`${label} → READY (Physical reuse: ${shortDerivedId}, ${(res.derivedByteSize / 1024).toFixed(1)} KB, -${compression})`);
      } else {
        summary.generated++;
        console.log(
          `${label} → GENERATED & UPLOADED in ${res.encodeDurationMs}ms (Derived: ${shortDerivedId}, ${(res.derivedByteSize / 1024).toFixed(1)} KB, -${compression})`,
        );
      }

      if (res.derivedMediaAssetId) {
        summary.readyRelations.push({
          sourceAssetId: asset.id,
          derivedAssetId: res.derivedMediaAssetId,
          sourceBytes: res.sourceByteSize,
          derivedBytes: res.derivedByteSize,
          compressionRatio: compression,
          encodeDurationMs: res.encodeDurationMs,
        });
      }
    } catch (err: unknown) {
      summary.failed++;
      const errorMsg = err instanceof Error ? err.message : String(err);
      summary.errors.push({ assetId: asset.id, error: errorMsg });
      console.error(`${label} → FAILED: ${errorMsg}`);
    }
  });

  const totalElapsedMs = Date.now() - startTime;

  const meanBytes =
    summary.derivativeByteSizes.length > 0
      ? Math.round(summary.totalDerivativeBytes / summary.derivativeByteSizes.length)
      : 0;

  const sortedSizes = [...summary.derivativeByteSizes].sort((a, b) => a - b);
  const medianBytes =
    sortedSizes.length > 0
      ? sortedSizes.length % 2 === 1
        ? sortedSizes[Math.floor(sortedSizes.length / 2)]!
        : Math.round(
            (sortedSizes[sortedSizes.length / 2 - 1]! + sortedSizes[sortedSizes.length / 2]!) / 2,
          )
      : 0;

  const minBytes =
    summary.derivativeByteSizes.length > 0
      ? Math.min(...summary.derivativeByteSizes)
      : 0;
  const maxBytes =
    summary.derivativeByteSizes.length > 0
      ? Math.max(...summary.derivativeByteSizes)
      : 0;

  const meanEncodeMs =
    summary.encodeTimesMs.length > 0
      ? Math.round(
          summary.encodeTimesMs.reduce((acc, t) => acc + t, 0) / summary.encodeTimesMs.length,
        )
      : 0;

  console.log("\n================================================================================");
  console.log("BACKFILL EXECUTION COMPLETED");
  console.log("================================================================================");
  console.log(`Video Sources Scanned:        ${summary.scanned}`);
  console.log(`Eligible Source Originals:    ${summary.eligible}`);
  console.log(`Ineligible Fixtures Skipped:  ${summary.ineligibleSkipped}`);
  console.log(`Already READY (Reused):       ${summary.alreadyReady}`);
  console.log(`Newly Generated & Uploaded:   ${summary.generated}`);
  console.log(`Reused Physical Derivatives:  ${summary.reused}`);
  console.log(`Failed:                       ${summary.failed}`);
  console.log(`Total Source Bytes:           ${(summary.totalSourceBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Total Derivative Bytes:       ${(summary.totalDerivativeBytes / 1024 / 1024).toFixed(2)} MB`);
  if (summary.totalSourceBytes > 0) {
    const overallReduction = ((1 - summary.totalDerivativeBytes / summary.totalSourceBytes) * 100).toFixed(1);
    console.log(`Overall Payload Reduction:    ${overallReduction}%`);
  }
  console.log(`Derivative Mean Size:         ${(meanBytes / 1024).toFixed(1)} KB`);
  console.log(`Derivative Median Size:       ${(medianBytes / 1024).toFixed(1)} KB`);
  console.log(`Derivative Min Size:          ${(minBytes / 1024).toFixed(1)} KB`);
  console.log(`Derivative Max Size:          ${(maxBytes / 1024).toFixed(1)} KB`);
  if (summary.encodeTimesMs.length > 0) {
    console.log(`Mean Encode Time:             ${meanEncodeMs} ms`);
  }
  console.log(`Total Wall-Clock Time:        ${(totalElapsedMs / 1000).toFixed(2)} s`);
  console.log("================================================================================\n");

  if (summary.failed > 0) {
    console.warn(`⚠️ Completed with ${summary.failed} failed items.`);
    for (const err of summary.errors) {
      console.warn(`  - Source ${err.assetId}: ${err.error}`);
    }
  } else {
    console.log("✓ All eligible canonical source video assets have READY preview-loop-v1 derivatives.");
  }
}

main()
  .catch((err) => {
    console.error("Fatal backfill error:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection();
  });
