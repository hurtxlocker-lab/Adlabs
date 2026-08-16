import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env") as {
  loadEnvConfig: (dir: string) => void;
};
loadEnvConfig(projectRoot);

import { and, eq } from "drizzle-orm";
import { db, closeDatabaseConnection } from "../src/db/client.ts";
import { mediaAssets } from "../src/db/schema/index.ts";
import { getR2Client, getR2BucketName } from "../src/storage/r2-client.ts";
import { isCanonicalMediaStorageKey } from "../src/storage/index.ts";
import { probeImageBuffer } from "../src/media/image-probe.ts";
import { GetObjectCommand } from "@aws-sdk/client-s3";

interface ImageBackfillSummary {
  scanned: number;
  ineligibleSkipped: number;
  alreadyCompleteSkipped: number;
  eligibleMissing: number;
  successfullyPopulated: number;
  failedProbes: number;
  elapsedMs: number;
}

async function runWorkerPool<T>(
  items: T[],
  concurrency: number,
  workerFn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await workerFn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const startTime = Date.now();

  console.log("================================================================================");
  console.log("AdLabs Media — Production Physical Image Metadata Backfill (Dev)");
  console.log("================================================================================\n");

  const allStoredImages = await db
    .select({
      id: mediaAssets.id,
      storageKey: mediaAssets.storageKey,
      width: mediaAssets.width,
      height: mediaAssets.height,
      byteSize: mediaAssets.byteSize,
      mimeType: mediaAssets.mimeType,
    })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.mediaType, "IMAGE"),
        eq(mediaAssets.downloadStatus, "STORED"),
      ),
    );

  const eligibleMissing: typeof allStoredImages = [];
  let ineligibleSkipped = 0;
  let alreadyCompleteSkipped = 0;

  for (const img of allStoredImages) {
    if (!isCanonicalMediaStorageKey(img.storageKey)) {
      ineligibleSkipped++;
    } else if (img.width != null && img.height != null) {
      alreadyCompleteSkipped++;
    } else {
      eligibleMissing.push(img);
    }
  }

  const summary: ImageBackfillSummary = {
    scanned: allStoredImages.length,
    ineligibleSkipped,
    alreadyCompleteSkipped,
    eligibleMissing: eligibleMissing.length,
    successfullyPopulated: 0,
    failedProbes: 0,
    elapsedMs: 0,
  };

  console.log(`Scanned ${summary.scanned} stored image assets in database.`);
  console.log(`Already complete (with width & height): ${summary.alreadyCompleteSkipped}.`);
  console.log(`Ineligible / noncanonical skipped:     ${summary.ineligibleSkipped}.`);
  console.log(`Eligible missing-metadata images:       ${summary.eligibleMissing}.\n`);

  if (eligibleMissing.length === 0) {
    console.log("✓ All eligible canonical image assets already have physical dimensions populated.");
    summary.elapsedMs = Date.now() - startTime;
    return;
  }

  const r2Client = getR2Client();
  const bucket = getR2BucketName();

  console.log(`Probing physical image dimensions with concurrency = 4...\n`);

  await runWorkerPool(eligibleMissing, 4, async (asset, idx) => {
    const label = `[${idx + 1}/${eligibleMissing.length}] Asset ${asset.id.slice(0, 8)}`;
    try {
      // Fetch the first 64KB for header sniffing (or full body)
      const res = await r2Client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: asset.storageKey!,
          Range: "bytes=0-65535",
        }),
      );

      const buf = Buffer.from(
        await (res.Body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray(),
      );

      const probe = probeImageBuffer(buf);

      if (probe) {
        await db
          .update(mediaAssets)
          .set({
            width: probe.width,
            height: probe.height,
            updatedAt: new Date(),
          })
          .where(eq(mediaAssets.id, asset.id));

        summary.successfullyPopulated++;
        console.log(
          `${label} → PROBED: ${probe.width}x${probe.height} (${probe.format.toUpperCase()})`,
        );
      } else {
        summary.failedProbes++;
        console.log(`${label} → FAILED: Unknown image header format for "${asset.storageKey}"`);
      }
    } catch (err) {
      summary.failedProbes++;
      console.log(
        `${label} → ERROR: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  summary.elapsedMs = Date.now() - startTime;

  console.log("\n================================================================================");
  console.log("IMAGE METADATA BACKFILL COMPLETED");
  console.log("================================================================================");
  console.log(`Images Scanned:             ${summary.scanned}`);
  console.log(`Already Complete Skipped:   ${summary.alreadyCompleteSkipped}`);
  console.log(`Ineligible Skipped:         ${summary.ineligibleSkipped}`);
  console.log(`Eligible Missing:           ${summary.eligibleMissing}`);
  console.log(`Successfully Populated:     ${summary.successfullyPopulated}`);
  console.log(`Failed Probes:              ${summary.failedProbes}`);
  console.log(`Total Elapsed Time:         ${(summary.elapsedMs / 1000).toFixed(2)}s`);
  console.log("================================================================================\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .catch((err) => {
      console.error("\n❌ Image Backfill Error:", err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDatabaseConnection();
    });
}
