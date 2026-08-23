/**
 * scripts/media-backfill-images-dev.ts
 *
 * Current Corpus DISPLAY_IMAGE Image Derivatives Backfill Runner (Dev).
 *
 * Hardened Requirements & Invariants:
 * - Selects canonical physical IMAGE assets genuinely referenced in `ad_media` or `card_media`.
 * - Excludes any media_assets row that is a derived_media_asset_id of ANY media_derivatives relation.
 * - Excludes noncanonical fixture/dummy assets.
 * - Selection-level idempotency: only selects source assets that currently REQUIRE derivative work.
 * - Preflight DB check: skips completed sources with ZERO R2 reads, ZERO Sharp decodes, ZERO R2 PUTs.
 * - Partial recipe support: if browse is READY, only generates detail (and vice versa).
 * - Bounded concurrency (default 3 workers).
 * - Bounded failure policy: skips FAILED jobs by default to avoid hot retry loops; retryable via `--retry-failed`.
 * - Cleanly closes PostgreSQL connection pool in finally block.
 */

import { createRequire } from "node:module";
import * as path from "node:path";
import { sql } from "drizzle-orm";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(__dirname, "..");
const { loadEnvConfig } = require("@next/env") as {
  loadEnvConfig: (dir: string) => void;
};
loadEnvConfig(projectRoot);

import { db, closeDatabaseConnection } from "../src/db/client";
import {
  processImageDerivatives,
  BROWSE_IMAGE_V1,
  DETAIL_IMAGE_V1,
} from "../src/media";

interface BackfillSummary {
  scanned: number;
  eligibleCanonicalSources: number;
  sourcesRequiringWork: number;
  targetBatchSize: number;
  bothAlreadyReadySkipped: number;
  sourceR2Gets: number;
  sharpDecodes: number;
  browseGenerated: number;
  detailGenerated: number;
  physicalAssetsReused: number;
  r2Puts: number;
  failedSkipped: number;
  failedNew: number;
  totalSourceBytesProcessed: number;
  totalBrowseBytesGenerated: number;
  totalDetailBytesGenerated: number;
  browseByteSizes: number[];
  detailByteSizes: number[];
  encodeTimesMs: number[];
  errors: { assetId: string; error: string }[];
}

function quantile(arr: number[], q: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
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
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
}

async function main() {
  const startTime = Date.now();
  console.log("================================================================================");
  console.log("AdLabs Media Derivatives — Production Image Derivatives Backfill");
  console.log("================================================================================\n");

  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]!, 10) : undefined;

  const concurrencyArg = args.find((a) => a.startsWith("--concurrency="));
  const concurrency = concurrencyArg
    ? parseInt(concurrencyArg.split("=")[1]!, 10)
    : 3;

  const targetAssetIdArg = args.find((a) => a.startsWith("--asset-id="));
  const targetAssetId = targetAssetIdArg
    ? targetAssetIdArg.split("=")[1]!
    : undefined;

  const retryFailed = args.includes("--retry-failed");
  const dryRun = args.includes("--dry-run");

  console.log(`Recipes:         ${BROWSE_IMAGE_V1.version} (768px, WebP q76) & ${DETAIL_IMAGE_V1.version} (1440px, WebP q84)`);
  console.log(`Concurrency:     ${concurrency} workers`);
  console.log(`Retry Failed:    ${retryFailed ? "YES" : "NO"}`);
  console.log(`Dry Run:         ${dryRun ? "YES" : "NO"}`);
  if (limit) console.log(`Limit:           ${limit} items needing work`);
  if (targetAssetId) console.log(`Target Asset:    ${targetAssetId}`);
  console.log("");

  // 1. Query Total Canonical Source Images referenced by ad_media or card_media
  const totalEligibleResult = (await db.execute(sql`
    SELECT count(DISTINCT ma.id)::int as total_canonical_sources
    FROM media_assets ma
    WHERE ma.media_type = 'IMAGE'
      AND ma.download_status = 'STORED'
      AND ma.storage_key IS NOT NULL
      AND ma.storage_key ~ '^media/sha256/[0-9a-f]{64}$'
      AND (
        EXISTS (SELECT 1 FROM ad_media am WHERE am.media_asset_id = ma.id)
        OR
        EXISTS (SELECT 1 FROM card_media cm WHERE cm.media_asset_id = ma.id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM media_derivatives md WHERE md.derived_media_asset_id = ma.id
      )
  `)) as unknown as { total_canonical_sources: number }[];
  const totalCanonicalSources = Number(totalEligibleResult[0]?.total_canonical_sources ?? 0);

  // 2. Query Canonical Sources requiring derivative work
  // A source requires work if either browse-image-v1 or detail-image-v1 is not READY (or if retrying failed)
  const failedCondition = retryFailed
    ? sql``
    : sql`
      AND NOT (
        EXISTS (
          SELECT 1 FROM media_derivatives md
          WHERE md.source_media_asset_id = ma.id
            AND md.derivative_kind = 'DISPLAY_IMAGE'
            AND md.recipe_version = 'browse-image-v1'
            AND md.status = 'FAILED'
        )
        AND
        EXISTS (
          SELECT 1 FROM media_derivatives md
          WHERE md.source_media_asset_id = ma.id
            AND md.derivative_kind = 'DISPLAY_IMAGE'
            AND md.recipe_version = 'detail-image-v1'
            AND md.status = 'FAILED'
        )
      )
    `;

  const targetAssetCondition = targetAssetId
    ? sql`AND ma.id = ${targetAssetId}::uuid`
    : sql``;

  const pendingSourcesQuery = sql`
    SELECT DISTINCT 
      ma.id,
      ma.storage_key,
      ma.byte_size,
      ma.sha256,
      ma.mime_type,
      EXISTS (
        SELECT 1 FROM media_derivatives md
        WHERE md.source_media_asset_id = ma.id
          AND md.derivative_kind = 'DISPLAY_IMAGE'
          AND md.recipe_version = 'browse-image-v1'
          AND md.status = 'READY'
          AND md.derived_media_asset_id IS NOT NULL
      ) as browse_ready,
      EXISTS (
        SELECT 1 FROM media_derivatives md
        WHERE md.source_media_asset_id = ma.id
          AND md.derivative_kind = 'DISPLAY_IMAGE'
          AND md.recipe_version = 'detail-image-v1'
          AND md.status = 'READY'
          AND md.derived_media_asset_id IS NOT NULL
      ) as detail_ready
    FROM media_assets ma
    WHERE ma.media_type = 'IMAGE'
      AND ma.download_status = 'STORED'
      AND ma.storage_key IS NOT NULL
      AND ma.storage_key ~ '^media/sha256/[0-9a-f]{64}$'
      AND (
        EXISTS (SELECT 1 FROM ad_media am WHERE am.media_asset_id = ma.id)
        OR
        EXISTS (SELECT 1 FROM card_media cm WHERE cm.media_asset_id = ma.id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM media_derivatives md WHERE md.derived_media_asset_id = ma.id
      )
      ${targetAssetCondition}
      AND NOT (
        EXISTS (
          SELECT 1 FROM media_derivatives md
          WHERE md.source_media_asset_id = ma.id
            AND md.derivative_kind = 'DISPLAY_IMAGE'
            AND md.recipe_version = 'browse-image-v1'
            AND md.status = 'READY'
            AND md.derived_media_asset_id IS NOT NULL
        )
        AND
        EXISTS (
          SELECT 1 FROM media_derivatives md
          WHERE md.source_media_asset_id = ma.id
            AND md.derivative_kind = 'DISPLAY_IMAGE'
            AND md.recipe_version = 'detail-image-v1'
            AND md.status = 'READY'
            AND md.derived_media_asset_id IS NOT NULL
        )
      )
      ${failedCondition}
    ORDER BY ma.id
  `;

  const pendingSources = (await db.execute(pendingSourcesQuery)) as unknown as {
    id: string;
    storage_key: string;
    byte_size: string | null;
    sha256: string;
    mime_type: string | null;
    browse_ready: boolean;
    detail_ready: boolean;
  }[];

  console.log(`Eligible Canonical Sources: ${totalCanonicalSources}`);
  console.log(`Sources Requiring Work:     ${pendingSources.length}`);

  const targetAssets = limit ? pendingSources.slice(0, limit) : pendingSources;
  console.log(`Target Batch Size:          ${targetAssets.length}\n`);

  if (dryRun) {
    console.log(`[DRY RUN] Would process ${targetAssets.length} canonical source images. Exiting.`);
    return;
  }

  if (targetAssets.length === 0) {
    console.log("✓ All canonical source images have READY browse-image-v1 and detail-image-v1 derivatives. Nothing to do.\n");
    return;
  }

  const summary: BackfillSummary = {
    scanned: totalCanonicalSources,
    eligibleCanonicalSources: totalCanonicalSources,
    sourcesRequiringWork: pendingSources.length,
    targetBatchSize: targetAssets.length,
    bothAlreadyReadySkipped: 0,
    sourceR2Gets: 0,
    sharpDecodes: 0,
    browseGenerated: 0,
    detailGenerated: 0,
    physicalAssetsReused: 0,
    r2Puts: 0,
    failedSkipped: 0,
    failedNew: 0,
    totalSourceBytesProcessed: 0,
    totalBrowseBytesGenerated: 0,
    totalDetailBytesGenerated: 0,
    browseByteSizes: [],
    detailByteSizes: [],
    encodeTimesMs: [],
    errors: [],
  };

  // 3. Process worker pool with execution-level metrics
  await runWorkerPool(targetAssets, concurrency, async (asset, idx) => {
    const itemStart = Date.now();
    try {
      const result = await processImageDerivatives(db, asset.id, {
        retryFailed,
      });
      const elapsed = Date.now() - itemStart;

      if (result.sourceR2Read) {
        summary.sourceR2Gets++;
        summary.sharpDecodes++;
        summary.totalSourceBytesProcessed += result.sourceByteSize;
      }

      if (result.browse.wasAlreadyReady && result.detail.wasAlreadyReady) {
        summary.bothAlreadyReadySkipped++;
      } else {
        if (!result.browse.wasAlreadyReady) {
          summary.browseGenerated++;
          summary.totalBrowseBytesGenerated += result.browse.derivedByteSize;
          summary.browseByteSizes.push(result.browse.derivedByteSize);
          if (result.browse.wasPhysicalAssetReused) {
            summary.physicalAssetsReused++;
          } else {
            summary.r2Puts++;
          }
        }
        if (!result.detail.wasAlreadyReady) {
          summary.detailGenerated++;
          summary.totalDetailBytesGenerated += result.detail.derivedByteSize;
          summary.detailByteSizes.push(result.detail.derivedByteSize);
          if (result.detail.wasPhysicalAssetReused) {
            summary.physicalAssetsReused++;
          } else {
            summary.r2Puts++;
          }
        }
      }

      summary.encodeTimesMs.push(elapsed);

      const progress = `[${idx + 1}/${targetAssets.length}]`;
      const browseStatus = result.browse.wasAlreadyReady
        ? "browse=READY(skipped)"
        : `browse=${(result.browse.derivedByteSize / 1024).toFixed(0)}KB`;
      const detailStatus = result.detail.wasAlreadyReady
        ? "detail=READY(skipped)"
        : `detail=${(result.detail.derivedByteSize / 1024).toFixed(0)}KB`;

      console.log(
        `${progress} Asset ${asset.id.slice(0, 8)}: ` +
        `src=${(result.sourceByteSize / 1024).toFixed(0)}KB (R2 GET: ${result.sourceR2Read ? "1" : "0"}) → ` +
        `${browseStatus}, ${detailStatus} in ${elapsed}ms`,
      );
    } catch (err: unknown) {
      summary.failedNew++;
      const errorMsg = err instanceof Error ? err.message : String(err);
      summary.errors.push({ assetId: asset.id, error: errorMsg });
      console.error(`[${idx + 1}/${targetAssets.length}] ❌ Asset ${asset.id.slice(0, 8)} failed: ${errorMsg}`);
    }
  });

  const totalElapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n================================================================================");
  console.log("BACKFILL EXECUTION SUMMARY");
  console.log("================================================================================");
  console.log(`Eligible Canonical Sources: ${summary.eligibleCanonicalSources}`);
  console.log(`Sources Requiring Work:     ${summary.sourcesRequiringWork}`);
  console.log(`Target Batch Processed:     ${summary.targetBatchSize}`);
  console.log(`Both Already READY Skipped: ${summary.bothAlreadyReadySkipped}`);
  console.log(`Source R2 GETs:             ${summary.sourceR2Gets}`);
  console.log(`Sharp Decodes:              ${summary.sharpDecodes}`);
  console.log(`Browse Generated:           ${summary.browseGenerated}`);
  console.log(`Detail Generated:           ${summary.detailGenerated}`);
  console.log(`Physical Assets Reused:     ${summary.physicalAssetsReused}`);
  console.log(`R2 PUTs:                    ${summary.r2Puts}`);
  console.log(`Failures:                   ${summary.failedNew}`);
  console.log(`Total Elapsed Time:         ${totalElapsedSec}s`);

  if (summary.browseByteSizes.length > 0 || summary.detailByteSizes.length > 0) {
    const browseMedian = quantile(summary.browseByteSizes, 0.5);
    const browseP90 = quantile(summary.browseByteSizes, 0.9);
    const detailMedian = quantile(summary.detailByteSizes, 0.5);
    const detailP90 = quantile(summary.detailByteSizes, 0.9);

    console.log("\n--- AGGREGATE STORAGE IMPACT ---");
    console.log(`Total Source Bytes Read:    ${(summary.totalSourceBytesProcessed / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Total Browse Bytes Stored:  ${(summary.totalBrowseBytesGenerated / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Total Detail Bytes Stored:  ${(summary.totalDetailBytesGenerated / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Browse Median / p90:        ${(browseMedian / 1024).toFixed(1)} KB / ${(browseP90 / 1024).toFixed(1)} KB`);
    console.log(`Detail Median / p90:        ${(detailMedian / 1024).toFixed(1)} KB / ${(detailP90 / 1024).toFixed(1)} KB`);
  }

  if (summary.errors.length > 0) {
    console.log(`\nErrors encountered (${summary.errors.length}):`);
    for (const err of summary.errors.slice(0, 10)) {
      console.log(`  - ${err.assetId}: ${err.error}`);
    }
  }
  console.log("================================================================================\n");
}

main()
  .catch((err) => {
    console.error("Fatal backfill runner error:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection();
  });
