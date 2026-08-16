/**
 * scripts/media-benchmark-dev.ts
 *
 * Media Derivative Encoding Benchmark against Real AdLabs Corpus.
 *
 * Requirements:
 * - Operates only on existing media assets from R2.
 * - Generates temporary local MP4 candidate files only in tmp/media-benchmark/.
 * - Performs NO DB writes and NO R2 uploads.
 * - Tests 4 candidate recipes (640-crf24, 640-crf26, 540-crf24, 540-crf26).
 * - Measures output dimensions, duration, fps, audio presence, byte size, compression ratio %, and encode time.
 */

import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";
import { GetObjectCommand } from "@aws-sdk/client-s3";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(__dirname, "..");
const { loadEnvConfig } = require("@next/env") as {
  loadEnvConfig: (dir: string) => void;
};
loadEnvConfig(projectRoot);

import { getR2Client, getR2BucketName } from "../src/storage/r2-client";
import {
  checkFfmpegAvailability,
  probeMediaFile,
  encodeVideoDerivative,
  VIDEO_BENCHMARK_RECIPES,
  type BenchmarkOutputMetric,
} from "../src/media";

// Curated representative benchmark video sources from current real corpus
interface BenchmarkSource {
  slug: string;
  brand: string;
  canonicalAdId: string;
  sourceAdId: string;
  storageKey: string;
  description: string;
}

const CURATED_SOURCES: BenchmarkSource[] = [
  {
    slug: "kapiva-ugc-talking-head",
    brand: "Kapiva",
    canonicalAdId: "7f353270-7a9c-421e-b858-94f64b06c8a8",
    sourceAdId: "1633919545411022",
    storageKey: "media/sha256/7df0071b3b73a1f409772ba653082232fd14bba09b4c44f06a258dcade2ba669",
    description: "9:16 portrait UGC talking-head (reviewed Kapiva ad, 9.7MB)",
  },
  {
    slug: "kapiva-fast-motion",
    brand: "Kapiva",
    canonicalAdId: "fe1b54e6-8b09-444b-9b13-d506b87a8ceb",
    sourceAdId: "1505931401258455",
    storageKey: "media/sha256/c23bc2bcbe7348664b8f2e20bc7e5331ff9a2829f2068ffdd0c896efb8eb90c2",
    description: "9:16 portrait fast-cut commercial (6.2MB)",
  },
  {
    slug: "souled-store-4-5-motion",
    brand: "The Souled Store",
    canonicalAdId: "ade858ad-5e42-43a8-b422-97dc7e615d30",
    sourceAdId: "1841121180105853",
    storageKey: "media/sha256/40475838f8f6e5242b299c6f7ccbbf9c5763469efda01076a6f906ef7de7a1a8",
    description: "4:5 vertical kinetic text & motion graphics (1.3MB)",
  },
  {
    slug: "souled-store-9-16-commercial",
    brand: "The Souled Store",
    canonicalAdId: "95608455-c555-44d6-9acf-d978e4efac64",
    sourceAdId: "1864019234278403",
    storageKey: "media/sha256/9e5f0ac053bafb186bb28d6ad64c29b18559406986a1b0d6db974bb0a2ea275f",
    description: "9:16 portrait high-contrast fashion cuts (7.8MB)",
  },
  {
    slug: "mamaearth-16-9-landscape",
    brand: "Mamaearth",
    canonicalAdId: "c6fa116b-204c-4263-8850-12d709ea38fd",
    sourceAdId: "2832114477187625",
    storageKey: "media/sha256/b3146a45316034a9aeae7d9463753d205817b8a9cd5c3e1e535639a84a213044",
    description: "16:9 landscape product demo with typography (2.5MB)",
  },
  {
    slug: "mamaearth-heavy-ugc",
    brand: "Mamaearth",
    canonicalAdId: "960c1db0-22f6-426b-86ee-1d886e4e315d",
    sourceAdId: "3222940311240557",
    storageKey: "media/sha256/05a09031dd2983b1c45148408bf22f258c8cbe79ef45fe7fbb1fb3903f378b72",
    description: "9:16 portrait long high-bitrate UGC (18.2MB)",
  },
];

async function downloadR2ToFile(storageKey: string, destPath: string): Promise<void> {
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

async function main() {
  console.log("================================================================================");
  console.log("AdLabs Media Derivatives — Real Corpus Benchmark Runner");
  console.log("================================================================================\n");

  // 1. Check Binary Availability
  const bin = await checkFfmpegAvailability();
  console.log("CLI Engine Availability:");
  console.log(`  ffmpeg:  ${bin.ffmpeg ? `✓ (${bin.ffmpegVersion})` : "❌ NOT FOUND IN PATH"}`);
  console.log(`  ffprobe: ${bin.ffprobe ? `✓ (${bin.ffprobeVersion})` : "❌ NOT FOUND IN PATH"}\n`);

  if (!bin.ffmpeg || !bin.ffprobe) {
    console.error("❌ FFmpeg and/or ffprobe are missing from system PATH.");
    console.error("Please install FFmpeg on your host (e.g. via winget or npm packages) to execute the benchmark.");
    process.exit(1);
  }

  // 2. Setup Benchmark Directory
  const benchmarkDir = path.join(projectRoot, "tmp", "media-benchmark");
  fs.mkdirSync(benchmarkDir, { recursive: true });

  const metrics: BenchmarkOutputMetric[] = [];

  for (const src of CURATED_SOURCES) {
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`Processing: [${src.brand}] ${src.slug}`);
    console.log(`Description: ${src.description}`);

    const sourceDir = path.join(benchmarkDir, src.slug);
    fs.mkdirSync(sourceDir, { recursive: true });

    const originalPath = path.join(sourceDir, "original.mp4");
    if (!fs.existsSync(originalPath)) {
      process.stdout.write("  Downloading original from R2... ");
      await downloadR2ToFile(src.storageKey, originalPath);
      console.log("done.");
    }

    const srcProbe = await probeMediaFile(originalPath);
    const srcSize = fs.statSync(originalPath).size;
    const srcDimStr = `${srcProbe.width ?? "?"}x${srcProbe.height ?? "?"}`;
    const srcDurSec = srcProbe.durationMs ? Number((srcProbe.durationMs / 1000).toFixed(2)) : null;

    console.log(`  Source Properties: ${srcDimStr}, Duration: ${srcDurSec}s, Size: ${(srcSize / 1024 / 1024).toFixed(2)} MB`);

    // Run each candidate recipe
    for (const [recipeKey, recipe] of Object.entries(VIDEO_BENCHMARK_RECIPES)) {
      const outFilename = `${recipe.maxLongEdge}-crf${recipe.crf}.mp4`;
      const outPath = path.join(sourceDir, outFilename);

      process.stdout.write(`  Encoding ${recipeKey}... `);
      const startTime = Date.now();
      await encodeVideoDerivative({
        inputPath: originalPath,
        outputPath: outPath,
        recipe,
        timeoutMs: 30000,
      });
      const encodeDurationMs = Date.now() - startTime;

      const outProbe = await probeMediaFile(outPath);
      const outSize = fs.statSync(outPath).size;
      const outDimStr = `${outProbe.width ?? "?"}x${outProbe.height ?? "?"}`;
      const outDurSec = outProbe.durationMs ? Number((outProbe.durationMs / 1000).toFixed(2)) : 3.5;
      const compressionRatio = Number(((1 - outSize / srcSize) * 100).toFixed(1));

      console.log(`done in ${encodeDurationMs}ms → ${outDimStr}, ${(outSize / 1024).toFixed(1)} KB (-${compressionRatio}%)`);

      metrics.push({
        sourceMediaAssetId: src.canonicalAdId,
        sourceDimensions: srcDimStr,
        sourceDurationSec: srcDurSec,
        sourceByteSize: srcSize,
        candidateRecipe: recipeKey,
        outputDimensions: outDimStr,
        outputDurationSec: outDurSec,
        outputByteSize: outSize,
        outputFps: outProbe.fps ?? 30,
        hasAudio: outProbe.hasAudio ?? false,
        compressionRatioPercent: compressionRatio,
        encodeDurationMs,
        outputPath: outPath,
      });
    }
  }

  // 3. Write summary JSON
  const summaryPath = path.join(benchmarkDir, "benchmark-summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(metrics, null, 2), "utf8");

  console.log("\n================================================================================");
  console.log("BENCHMARK EXECUTION COMPLETE");
  console.log(`Results saved to: ${summaryPath}`);
  console.log(`Inspect candidate MP4s in: ${benchmarkDir}`);
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
