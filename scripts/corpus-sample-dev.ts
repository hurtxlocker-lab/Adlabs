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

import { closeDatabaseConnection, db } from "../src/db/client.ts";
import { verifyDatabaseTargetSafety } from "../src/db/target-safety.ts";
import {
  createApifyClient,
  fetchCuriousCoderTaskItems,
  buildCuriousCoderTaskInput,
  MIN_PROVIDER_COUNT,
} from "../src/ingestion/providers/apify/index.ts";
import { runCuriousCoderIngestion } from "../src/ingestion/run-orchestration/index.ts";
import { safeParseCuriousCoderItem } from "../src/ingestion/sources/meta/curious-coder/index.ts";
import type { CuriousCoderItem } from "../src/ingestion/sources/meta/curious-coder/schema.ts";
import { getAdLibraryItems } from "../src/features/ad-library/index.ts";
import { computeCorpusAudit, formatCorpusAuditTable } from "../src/corpus/audit.ts";
import { CandidateBrandSampleSchema } from "../src/corpus/config-schema.ts";
import { processPreviewLoopDerivative } from "../src/media/services/derivative-processor.ts";
import {
  adObservations,
  adMedia,
  cardMedia,
  adCards,
  mediaAssets,
  mediaDerivatives,
} from "../src/db/schema/index.ts";
import { eq, and, inArray } from "drizzle-orm";
import { isCanonicalMediaStorageKey } from "../src/storage/index.ts";

function parseCliArgs(argv: string[]) {
  let brand = "";
  let url = "";
  let limit = 6;
  const isDryRun = argv.includes("--dry-run");

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--brand" && argv[i + 1]) {
      brand = argv[++i];
    } else if (argv[i] === "--url" && argv[i + 1]) {
      url = argv[++i];
    } else if (argv[i] === "--limit" && argv[i + 1]) {
      const parsedLimit = parseInt(argv[++i], 10);
      if (!isNaN(parsedLimit)) {
        limit = parsedLimit;
      }
    }
  }

  return { brand, url, limit, isDryRun };
}

function slugifyBrandName(name: string): string {
  const normalized = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "unknown-brand";
}

function resolveBrandForPage(item: CuriousCoderItem, fallbackBrand: string): {
  name: string;
  slug: string;
} {
  const rawName = (item.page_name ?? item.snapshot?.page_name ?? "").trim();
  const pageUrl = (
    item.page_profile_uri ??
    item.snapshot?.page_profile_uri ??
    ""
  ).toLowerCase();

  if (fallbackBrand && fallbackBrand.trim() !== "") {
    return { name: fallbackBrand.trim(), slug: slugifyBrandName(fallbackBrand) };
  }

  if (
    rawName.toLowerCase().includes("souled store") ||
    pageUrl.includes("souledstore")
  ) {
    return { name: "The Souled Store", slug: "the-souled-store" };
  }
  if (
    rawName.toLowerCase().includes("kapiva") ||
    pageUrl.includes("kapiva")
  ) {
    return { name: "Kapiva", slug: "kapiva" };
  }
  if (
    rawName.toLowerCase().includes("mamaearth") ||
    pageUrl.includes("mamaearth")
  ) {
    return { name: "Mamaearth", slug: "mamaearth" };
  }
  if (
    rawName.toLowerCase().includes("dot") ||
    pageUrl.includes("dotandkey")
  ) {
    return { name: "Dot & Key", slug: "dot-and-key" };
  }

  const name = rawName || `Page ${item.page_id}`;
  return { name, slug: slugifyBrandName(name) };
}

export async function sampleSingleBrand(config: {
  brand: string;
  url: string;
  limit: number;
  isDryRun: boolean;
}) {
  const parsed = CandidateBrandSampleSchema.parse({
    brand: config.brand,
    url: config.url,
    limit: config.limit,
  });

  const TASK_ID = process.env.APIFY_CURIOUS_CODER_TASK_ID;
  if (!TASK_ID || TASK_ID.trim().length === 0) {
    throw new Error("APIFY_CURIOUS_CODER_TASK_ID is not set in environment.");
  }

  const DATABASE_URL = process.env.DATABASE_URL;
  const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
  if (!DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  verifyDatabaseTargetSafety(DATABASE_URL, SUPABASE_PROJECT_REF);

  const actorInput = buildCuriousCoderTaskInput({
    url: parsed.url,
    limit: parsed.limit,
  });

  console.log(`\n--------------------------------------------------------------------------------`);
  console.log(`Sampling Brand: ${parsed.brand}`);
  console.log(`Task:           ${TASK_ID}`);
  console.log(`Mode:           ${config.isDryRun ? "DRY-RUN (No API/DB calls)" : "LIVE DEV RUN"}`);
  console.log(`\nEFFECTIVE ACTOR INPUT SHAPE:`);
  console.log(`  urls:           [{ url: "${actorInput.urls[0].url}" }]`);
  console.log(`  provider count: ${actorInput.count} (clamped to min ${MIN_PROVIDER_COUNT})`);
  console.log(`  local limit:    ${parsed.limit}`);
  console.log(`  options:        activeStatus="all", sortBy="impressions_desc"`);
  console.log(`--------------------------------------------------------------------------------\n`);

  if (config.isDryRun) {
    console.log(`  ✓ [Dry Run] Config and input shape validated for "${parsed.brand}". Zero network or DB mutations made.`);
    return {
      brand: parsed.brand,
      success: true,
      dryRun: true,
      actorInput,
    };
  }

  const client = createApifyClient();

  console.log(`  [1/4] Executing Apify scraper with canonical actor input...`);
  const apifyResult = await fetchCuriousCoderTaskItems(
    {
      taskId: TASK_ID,
      limit: parsed.limit,
      inputOverrides: actorInput as unknown as Record<string, unknown>,
    },
    client,
  );

  console.log(
    `  ✓ Apify run ${apifyResult.runId} ${apifyResult.runStatus} (Dataset: ${apifyResult.datasetId}, Cost: ${apifyResult.costUsd != null ? `$${apifyResult.costUsd.toFixed(4)}` : "N/A"})`,
  );
  console.log(
    `  ✓ Provider items returned: ${apifyResult.datasetItemCount} → Locally selected: ${apifyResult.items.length}`,
  );

  if (apifyResult.items.length === 0) {
    console.log(`  ⚠ No items returned from provider for brand "${parsed.brand}".`);
    return {
      brand: parsed.brand,
      success: true,
      apifyResult,
      ingestedCount: 0,
    };
  }

  // Resolve brand identity from first item or fallback
  const firstParsed = safeParseCuriousCoderItem(apifyResult.items[0]);
  let brandName = parsed.brand;
  let brandSlug = slugifyBrandName(parsed.brand);
  let pageId = `page_${brandSlug}`;
  let pageUrl = parsed.url;

  if (firstParsed.success) {
    const resolved = resolveBrandForPage(firstParsed.data, parsed.brand);
    brandName = resolved.name;
    brandSlug = resolved.slug;
    pageId = firstParsed.data.page_id ?? `page_${brandSlug}`;
    pageUrl = firstParsed.data.page_profile_uri ?? parsed.url;
  }

  console.log(`  [2/4] Running canonical Step 4F ingestion for "${brandName}" (Page ID: ${pageId})...`);
  const ingestionResult = await runCuriousCoderIngestion({
    brand: {
      name: brandName,
      slug: brandSlug,
    },
    sourceAccount: {
      sourcePageId: pageId,
      sourcePageUrl: pageUrl,
      displayName: brandName,
    },
    providerItems: apifyResult.items,
  });

  console.log(
    `  ✓ Ingestion complete: ${ingestionResult.createdAdsCount} created, ${ingestionResult.updatedAdsCount} updated, ${ingestionResult.failedItemsCount} failed.`,
  );

  if (ingestionResult.failures.length > 0) {
    for (const f of ingestionResult.failures) {
      console.log(`  ⚠ Item ${f.itemIndex} failed at stage [${f.stage}]: ${f.message}`);
    }
  }

  // Step 3: Run-Scoped Post-Ingestion Media Derivatives
  console.log(`  [3/4] Checking and generating preview-loop-v1 derivatives for current-run video media...`);

  // Query ads observed in this run
  const runObservations = await db
    .select({ adId: adObservations.adId })
    .from(adObservations)
    .where(eq(adObservations.ingestionRunId, ingestionResult.ingestionRunId));

  const runAdIds = runObservations.map((o) => o.adId).filter((id): id is string => Boolean(id));

  let runEligibleVideos: typeof mediaAssets.$inferSelect[] = [];

  if (runAdIds.length > 0) {
    // 1. Direct ad_media
    const directMedia = await db
      .select({ mediaAssetId: adMedia.mediaAssetId })
      .from(adMedia)
      .where(inArray(adMedia.adId, runAdIds));

    // 2. Card media via ad_cards
    const cardMediaRows = await db
      .select({ mediaAssetId: cardMedia.mediaAssetId })
      .from(cardMedia)
      .innerJoin(adCards, eq(cardMedia.adCardId, adCards.id))
      .where(inArray(adCards.adId, runAdIds));

    const runMediaIds = Array.from(
      new Set([
        ...directMedia.map((m) => m.mediaAssetId),
        ...cardMediaRows.map((m) => m.mediaAssetId),
      ]),
    );

    if (runMediaIds.length > 0) {
      const candidates = await db
        .select()
        .from(mediaAssets)
        .where(
          and(
            inArray(mediaAssets.id, runMediaIds),
            eq(mediaAssets.mediaType, "VIDEO"),
            eq(mediaAssets.downloadStatus, "STORED"),
          ),
        );

      runEligibleVideos = candidates.filter(
        (c) => c.storageKey && isCanonicalMediaStorageKey(c.storageKey),
      );
    }
  }

  let readyExistingThisRun = 0;
  let newReadyThisRun = 0;
  let failedThisRun = 0;

  for (const video of runEligibleVideos) {
    try {
      const res = await processPreviewLoopDerivative(db, video.id);
      if (res.wasAlreadyReady) {
        readyExistingThisRun++;
      } else if (res.job.status === "READY") {
        newReadyThisRun++;
      }
    } catch {
      failedThisRun++;
      // Derivative failure never fails canonical ingestion
    }
  }

  const allStoredCanonicalVideos = await db
    .select()
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.mediaType, "VIDEO"),
        eq(mediaAssets.downloadStatus, "STORED"),
      ),
    );

  const allReadyDerivatives = await db
    .select()
    .from(mediaDerivatives)
    .where(eq(mediaDerivatives.status, "READY"));

  console.log(`\n  --- DERIVATIVES REPORT ---`);
  console.log(`  THIS INGESTION RUN:`);
  console.log(`    Eligible Source Videos:    ${runEligibleVideos.length}`);
  console.log(`    READY (Already Existing):  ${readyExistingThisRun}`);
  console.log(`    READY (Newly Generated):   ${newReadyThisRun}`);
  console.log(`    FAILED:                    ${failedThisRun}`);
  console.log(`\n  CURRENT WHOLE CORPUS:`);
  console.log(`    Total Stored Videos:       ${allStoredCanonicalVideos.length}`);
  console.log(`    Total READY Derivatives:   ${allReadyDerivatives.length}`);

  // Step 4: Corpus Inventory & Geometry Audit
  console.log(`\n  [4/4] Generating updated corpus audit...`);
  const allItems = await getAdLibraryItems();
  const auditResult = computeCorpusAudit(allItems);
  console.log("\n" + formatCorpusAuditTable(auditResult));

  return {
    brand: parsed.brand,
    success: true,
    apifyResult,
    ingestionResult,
    newDerivativesThisRun: newReadyThisRun,
    failedDerivativesThisRun: failedThisRun,
  };
}

async function main() {
  const { brand, url, limit, isDryRun } = parseCliArgs(process.argv.slice(2));

  if (!brand || !url) {
    console.error(
      "❌ Usage: pnpm corpus:sample:dev --brand \"<Brand Name>\" --url \"<Meta Ad Library URL>\" [--limit <1..10>] [--dry-run]",
    );
    process.exitCode = 1;
    return;
  }

  try {
    await sampleSingleBrand({ brand, url, limit, isDryRun });
  } finally {
    await closeDatabaseConnection();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error("\n❌ Sampling Error:", err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
