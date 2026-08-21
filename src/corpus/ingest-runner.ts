/**
 * src/corpus/ingest-runner.ts
 *
 * Semi-automatic operator runner for controlled single-brand/query corpus ingestion.
 *
 * Coordinates the full existing ingestion lifecycle:
 *  1. Input validation & CLI parsing (Meta URL, count, countryCode, scrapeAdDetails).
 *  2. Database target safety verification.
 *  3. Apify Curious Coder execution (using canonical task input).
 *  4. Canonical Step 4F ingestion (parser, normalizer, media hashing, R2 storage, PostgreSQL persistence).
 *  5. Post-ingestion video derivative processing (preview-loop-v1).
 *  6. Incremental discovery projection refresh (ad_discovery_index + source account fanout).
 *  7. Structured operator summary report.
 *
 * Invariants:
 *  - scrapeAdDetails defaults to true.
 *  - Zero direct SQL writes or bypassed repositories.
 *  - Never prints secrets, credentials, or signed tokens.
 *  - Fully idempotent for repeated runs.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db as defaultDb } from "@/db/client";
import {
  adCards,
  adMedia,
  adObservations,
  adTransparencyObservations,
  cardMedia,
  mediaAssets,
  sourceAccountObservations,
} from "@/db/schema";
import { verifyDatabaseTargetSafety } from "@/db/target-safety";
import { projectAd, projectSourceAccount } from "@/discovery/projection";
import {
  createApifyClient,
  fetchCuriousCoderTaskItems,
  buildCuriousCoderTaskInput,
  type ApifyClientInterface,
  type CuriousCoderActorInput,
} from "@/ingestion/providers/apify";
import { runCuriousCoderIngestion } from "@/ingestion/run-orchestration";
import { safeParseCuriousCoderItem } from "@/ingestion/sources/meta/curious-coder";
import type { CuriousCoderItem } from "@/ingestion/sources/meta/curious-coder/schema";
import { isCanonicalMediaStorageKey } from "@/storage";
import { processPreviewLoopDerivative } from "@/media/services/derivative-processor";
import type { DbOrTx } from "@/ingestion/persistence/types";

export interface CorpusIngestCliArgs {
  url?: string;
  count?: number;
  country?: string;
  brand?: string;
  concurrency?: number;
  scrapeAdDetails?: boolean;
  isDryRun: boolean;
}

export interface ValidatedCorpusIngestInput {
  url: string;
  count: number;
  country: string;
  brand?: string;
  concurrency: number;
  scrapeAdDetails: boolean;
  isDryRun: boolean;
}

export interface CorpusIngestExecutionPlan {
  validatedInput: ValidatedCorpusIngestInput;
  actorInput: CuriousCoderActorInput;
  taskId: string;
}

export interface CorpusIngestSummary {
  provider: {
    url: string;
    country: string;
    requestedCount: number;
    providerCount: number;
    scrapeAdDetails: boolean;
    apifyRunId?: string;
    apifyDatasetId?: string;
    costUsd?: number | null;
  };
  ingestion: {
    providerItems: number;
    newAds: number;
    updatedAds: number;
    failedItems: number;
    ingestionRunId?: string;
    brandName: string;
    brandSlug: string;
    sourcePageId: string;
  };
  evidence: {
    adObservations: number;
    sourceAccountObservations: number;
    transparencyObservations: number;
  };
  media: {
    totalObserved: number;
    uniqueStored: number;
    videos: number;
    images: number;
  };
  derivatives: {
    eligibleVideos: number;
    alreadyReady: number;
    newlyReady: number;
    failed: number;
  };
  discovery: {
    projectedAds: number;
  };
  ui: {
    discoverReady: "YES" | "PARTIAL" | "NO";
  };
}

/**
 * Parses raw command-line arguments into structured options.
 */
export function parseCorpusIngestCliArgs(argv: string[]): CorpusIngestCliArgs {
  let url: string | undefined;
  let count: number | undefined;
  let country: string | undefined;
  let brand: string | undefined;
  let concurrency: number | undefined;
  let scrapeAdDetails = true;
  const isDryRun = argv.includes("--dry-run");

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--url" && argv[i + 1] && !argv[i + 1].startsWith("--")) {
      url = argv[++i];
    } else if (arg.startsWith("--url=")) {
      url = arg.slice("--url=".length);
    } else if (arg === "--count" && argv[i + 1] && !argv[i + 1].startsWith("--")) {
      const parsed = parseInt(argv[++i], 10);
      if (!isNaN(parsed)) count = parsed;
    } else if (arg.startsWith("--count=")) {
      const parsed = parseInt(arg.slice("--count=".length), 10);
      if (!isNaN(parsed)) count = parsed;
    } else if (arg === "--country" && argv[i + 1] && !argv[i + 1].startsWith("--")) {
      country = argv[++i];
    } else if (arg.startsWith("--country=")) {
      country = arg.slice("--country=".length);
    } else if (arg === "--brand" && argv[i + 1] && !argv[i + 1].startsWith("--")) {
      brand = argv[++i];
    } else if (arg.startsWith("--brand=")) {
      brand = arg.slice("--brand=".length);
    } else if (arg === "--concurrency" && argv[i + 1] && !argv[i + 1].startsWith("--")) {
      const parsed = parseInt(argv[++i], 10);
      if (!isNaN(parsed)) concurrency = parsed;
    } else if (arg.startsWith("--concurrency=")) {
      const parsed = parseInt(arg.slice("--concurrency=".length), 10);
      if (!isNaN(parsed)) concurrency = parsed;
    } else if (arg === "--no-details") {
      scrapeAdDetails = false;
    }
  }

  return {
    url,
    count,
    country,
    brand,
    concurrency,
    scrapeAdDetails,
    isDryRun,
  };
}

/**
 * Validates CLI arguments against safety and domain requirements.
 */
export function validateCorpusIngestArgs(raw: CorpusIngestCliArgs): ValidatedCorpusIngestInput {
  // 1. URL Validation
  if (!raw.url || raw.url.trim().length === 0) {
    throw new Error("Missing required argument: --url <META_AD_LIBRARY_URL>");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(raw.url.trim());
  } catch {
    throw new Error(`Invalid --url: "${raw.url}" is not a valid URL.`);
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`Invalid --url protocol: "${parsedUrl.protocol}". Must be http or https.`);
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const isMetaDomain =
    hostname === "facebook.com" ||
    hostname.endsWith(".facebook.com") ||
    hostname === "meta.com" ||
    hostname.endsWith(".meta.com") ||
    hostname === "fb.com" ||
    hostname.endsWith(".fb.com");

  if (!isMetaDomain) {
    throw new Error(
      `Invalid --url domain: "${hostname}". Must be a Meta/Facebook Ad Library URL.`,
    );
  }

  // 2. Count Validation
  if (raw.count === undefined || isNaN(raw.count)) {
    throw new Error("Missing required argument: --count <number>");
  }

  if (!Number.isInteger(raw.count) || raw.count <= 0) {
    throw new Error(`Invalid --count: ${raw.count}. Must be a positive integer (e.g. 1..500).`);
  }

  if (raw.count > 500) {
    throw new Error(`Invalid --count: ${raw.count}. Sane DEV safety maximum is 500.`);
  }

  // 3. Country Validation
  if (!raw.country || raw.country.trim().length === 0) {
    throw new Error("Missing required argument: --country <ISO_COUNTRY_CODE> (e.g. IN, US, ALL)");
  }

  const normalizedCountry = raw.country.trim().toUpperCase();
  if (normalizedCountry !== "ALL" && !/^[A-Z]{2}$/.test(normalizedCountry)) {
    throw new Error(
      `Invalid --country: "${raw.country}". Must be a 2-letter ISO country code (e.g. IN, US, GB) or "ALL".`,
    );
  }

  return {
    url: raw.url.trim(),
    count: raw.count,
    country: normalizedCountry,
    brand: raw.brand?.trim() || undefined,
    concurrency: raw.concurrency && raw.concurrency > 0 ? Math.min(raw.concurrency, 10) : 2,
    scrapeAdDetails: raw.scrapeAdDetails ?? true,
    isDryRun: Boolean(raw.isDryRun),
  };
}

/**
 * Creates the execution plan and Apify actor payload.
 */
export function buildCorpusIngestPlan(
  input: ValidatedCorpusIngestInput,
  taskIdOverride?: string,
): CorpusIngestExecutionPlan {
  const taskId = taskIdOverride || process.env.APIFY_CURIOUS_CODER_TASK_ID || "curious_coder/facebook-ads-library-scraper";

  const actorInput = buildCuriousCoderTaskInput({
    url: input.url,
    limit: input.count,
    countryCode: input.country,
    scrapeAdDetails: input.scrapeAdDetails,
  });

  return {
    validatedInput: input,
    actorInput,
    taskId,
  };
}

/**
 * Helper to slugify brand names consistently.
 */
export function slugifyBrandName(name: string): string {
  const normalized = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "unknown-brand";
}

/**
 * Resolves brand metadata from the first parsed provider item or explicit fallback.
 */
export function resolveBrandFromItem(
  item?: CuriousCoderItem,
  fallbackBrand?: string,
): { name: string; slug: string } {
  if (fallbackBrand && fallbackBrand.trim() !== "") {
    return { name: fallbackBrand.trim(), slug: slugifyBrandName(fallbackBrand) };
  }

  if (!item) {
    return { name: "Unknown Brand", slug: "unknown-brand" };
  }

  const rawName = (item.page_name ?? item.snapshot?.page_name ?? "").trim();
  const pageUrl = (
    item.page_profile_uri ??
    item.snapshot?.page_profile_uri ??
    ""
  ).toLowerCase();

  // Known brand normalization
  if (rawName.toLowerCase().includes("souled store") || pageUrl.includes("souledstore")) {
    return { name: "The Souled Store", slug: "the-souled-store" };
  }
  if (rawName.toLowerCase().includes("kapiva") || pageUrl.includes("kapiva")) {
    return { name: "Kapiva", slug: "kapiva" };
  }
  if (rawName.toLowerCase().includes("mamaearth") || pageUrl.includes("mamaearth")) {
    return { name: "Mamaearth", slug: "mamaearth" };
  }
  if (rawName.toLowerCase().includes("dot") || pageUrl.includes("dotandkey")) {
    return { name: "Dot & Key", slug: "dot-and-key" };
  }

  const name = rawName || `Page ${item.page_id ?? "unknown"}`;
  return { name, slug: slugifyBrandName(name) };
}

export interface CorpusIngestRunnerDependencies {
  db?: DbOrTx;
  apifyClient?: ApifyClientInterface;
}

/**
 * Executes the complete semi-automatic corpus ingestion runner.
 */
export async function runCorpusIngest(
  args: CorpusIngestCliArgs,
  deps?: CorpusIngestRunnerDependencies,
): Promise<{ success: boolean; dryRun: boolean; summary?: CorpusIngestSummary }> {
  // 1. Validate CLI Input
  const validatedInput = validateCorpusIngestArgs(args);
  const plan = buildCorpusIngestPlan(validatedInput);

  // 2. Pre-flight Environment & Safety Checks
  const dbClient = deps?.db ?? defaultDb;
  const databaseUrl = process.env.DATABASE_URL;
  const expectedProjectRef = process.env.SUPABASE_PROJECT_REF;

  if (!databaseUrl && !deps?.db) {
    throw new Error("DATABASE_URL is not set in environment.");
  }

  if (databaseUrl && !deps?.db) {
    verifyDatabaseTargetSafety(databaseUrl, expectedProjectRef);
  }

  // 3. Dry-Run Mode
  if (validatedInput.isDryRun) {
    console.log("\n==================================================");
    console.log("ADLABS CORPUS INGEST — DRY RUN");
    console.log("==================================================");
    console.log(`\nTarget URL:          ${plan.validatedInput.url}`);
    console.log(`Requested Count:     ${plan.validatedInput.count}`);
    console.log(`Target Country:      ${plan.validatedInput.country}`);
    console.log(`Scrape Ad Details:   ${plan.validatedInput.scrapeAdDetails}`);
    console.log(`Brand Override:      ${plan.validatedInput.brand ?? "(auto-detect from page)"}`);
    console.log(`Concurrency:         ${plan.validatedInput.concurrency}`);
    console.log(`DB Target Safety:    PASSED`);
    console.log("\nProvider Payload (Apify Curious Coder Task Input):");
    console.log(JSON.stringify(plan.actorInput, null, 2));
    console.log("\n✓ Dry-run completed. Zero network, database, or R2 mutations made.\n");
    return { success: true, dryRun: true };
  }

  // 4. Live Provider Execution (Apify)
  const apifyClient = deps?.apifyClient ?? createApifyClient();
  console.log("\n==================================================");
  console.log("ADLABS CORPUS INGEST — LIVE RUN");
  console.log("==================================================");
  console.log(`Target URL:        ${plan.validatedInput.url}`);
  console.log(`Target Country:    ${plan.validatedInput.country}`);
  console.log(`Requested Count:   ${plan.validatedInput.count}`);
  console.log(`Scrape Details:    ${plan.validatedInput.scrapeAdDetails}`);
  console.log("\n[1/4] Executing Curious Coder scraper on Apify...");

  const fetchResult = await fetchCuriousCoderTaskItems(
    {
      taskId: plan.taskId,
      limit: plan.validatedInput.count,
      inputOverrides: plan.actorInput as unknown as Record<string, unknown>,
    },
    apifyClient,
  );

  console.log(
    `✓ Apify run completed (${fetchResult.runStatus}): Run ID ${fetchResult.runId}, Dataset ID ${fetchResult.datasetId}`,
  );
  console.log(`  Items retrieved: ${fetchResult.items.length} (total in dataset: ${fetchResult.datasetItemCount})`);

  if (fetchResult.items.length === 0) {
    console.log("\n⚠ Provider returned 0 items. Ingestion completed with no data.\n");
    return {
      success: true,
      dryRun: false,
      summary: {
        provider: {
          url: plan.validatedInput.url,
          country: plan.validatedInput.country,
          requestedCount: plan.validatedInput.count,
          providerCount: 0,
          scrapeAdDetails: plan.validatedInput.scrapeAdDetails,
          apifyRunId: fetchResult.runId,
          apifyDatasetId: fetchResult.datasetId,
          costUsd: fetchResult.costUsd,
        },
        ingestion: {
          providerItems: 0,
          newAds: 0,
          updatedAds: 0,
          failedItems: 0,
          brandName: "N/A",
          brandSlug: "n-a",
          sourcePageId: "N/A",
        },
        evidence: { adObservations: 0, sourceAccountObservations: 0, transparencyObservations: 0 },
        media: { totalObserved: 0, uniqueStored: 0, videos: 0, images: 0 },
        derivatives: { eligibleVideos: 0, alreadyReady: 0, newlyReady: 0, failed: 0 },
        discovery: { projectedAds: 0 },
        ui: { discoverReady: "NO" },
      },
    };
  }

  // 5. Brand and Source Account Identification
  const firstParsed = safeParseCuriousCoderItem(fetchResult.items[0]);
  const brandInfo = resolveBrandFromItem(
    firstParsed.success ? firstParsed.data : undefined,
    plan.validatedInput.brand,
  );

  const firstItemData = firstParsed.success ? firstParsed.data : ({} as Partial<CuriousCoderItem>);
  const sourcePageId = firstItemData.page_id ?? `page_${brandInfo.slug}`;
  const sourcePageUrl = firstItemData.page_profile_uri ?? plan.validatedInput.url;
  const displayName = firstItemData.page_name ?? brandInfo.name;

  console.log(`\n[2/4] Running Step 4F canonical ingestion for "${brandInfo.name}" (Page ID: ${sourcePageId})...`);

  // 6. Execute Canonical Ingestion
  const ingestionResult = await runCuriousCoderIngestion(
    {
      brand: {
        name: brandInfo.name,
        slug: brandInfo.slug,
      },
      sourceAccount: {
        sourcePageId,
        sourcePageUrl,
        displayName,
      },
      providerItems: fetchResult.items,
      sourceMetadata: {
        apifyRunId: fetchResult.runId,
        apifyTaskId: plan.taskId,
        apifyDatasetId: fetchResult.datasetId,
      },
      ingestionRunMetadata: {
        trigger: "corpus-ingest-runner",
        targetCountry: plan.validatedInput.country,
        requestedCount: plan.validatedInput.count,
        scrapeAdDetails: plan.validatedInput.scrapeAdDetails,
      },
    },
    { db: dbClient },
  );

  console.log(
    `✓ Ingestion complete: ${ingestionResult.createdAdsCount} created, ${ingestionResult.updatedAdsCount} updated, ${ingestionResult.failedItemsCount} failed.`,
  );

  if (ingestionResult.failures.length > 0) {
    for (const f of ingestionResult.failures) {
      console.log(`  ⚠ Item ${f.itemIndex} failed at stage [${f.stage}]: ${f.message}`);
    }
  }

  // 7. Post-Ingestion Video Derivatives
  console.log(`\n[3/4] Processing media derivatives (preview-loop-v1)...`);

  const runObservations = await dbClient
    .select({ adId: adObservations.adId })
    .from(adObservations)
    .where(eq(adObservations.ingestionRunId, ingestionResult.ingestionRunId));

  const runAdIds = runObservations.map((o) => o.adId).filter((id): id is string => Boolean(id));

  let runEligibleVideos: typeof mediaAssets.$inferSelect[] = [];
  let totalDirectMediaCount = 0;
  let totalCardMediaCount = 0;

  if (runAdIds.length > 0) {
    const directMedia = await dbClient
      .select({ mediaAssetId: adMedia.mediaAssetId })
      .from(adMedia)
      .where(inArray(adMedia.adId, runAdIds));
    totalDirectMediaCount = directMedia.length;

    const cardMediaRows = await dbClient
      .select({ mediaAssetId: cardMedia.mediaAssetId })
      .from(cardMedia)
      .innerJoin(adCards, eq(cardMedia.adCardId, adCards.id))
      .where(inArray(adCards.adId, runAdIds));
    totalCardMediaCount = cardMediaRows.length;

    const runMediaIds = Array.from(
      new Set([
        ...directMedia.map((m) => m.mediaAssetId),
        ...cardMediaRows.map((m) => m.mediaAssetId),
      ]),
    );

    if (runMediaIds.length > 0) {
      const candidates = await dbClient
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

  let alreadyReadyCount = 0;
  let newlyReadyCount = 0;
  let failedDerivativesCount = 0;

  for (const video of runEligibleVideos) {
    try {
      const res = await processPreviewLoopDerivative(dbClient, video.id);
      if (res.wasAlreadyReady) {
        alreadyReadyCount++;
      } else if (res.job.status === "READY") {
        newlyReadyCount++;
      }
    } catch {
      failedDerivativesCount++;
      // Derivative failure does not fail canonical ingestion
    }
  }

  console.log(
    `✓ Derivatives processed: ${newlyReadyCount} newly generated, ${alreadyReadyCount} already ready, ${failedDerivativesCount} failed.`,
  );

  // 8. Discovery Projection Refresh
  console.log(`\n[4/4] Projecting newly ingested ads into discovery index...`);
  let projectedCount = 0;

  for (const adId of runAdIds) {
    try {
      await projectAd(adId, dbClient);
      projectedCount++;
    } catch (projErr) {
      console.warn(`  ⚠ Failed to project ad ${adId}: ${projErr instanceof Error ? projErr.message : String(projErr)}`);
    }
  }

  try {
    await projectSourceAccount(ingestionResult.sourceAccountId, dbClient);
  } catch {
    // Non-fatal account projection fanout
  }

  console.log(`✓ Projected ${projectedCount} ads into ad_discovery_index.`);

  // 9. Query Observational Evidence Counts
  const sourceAccountObsRows = await dbClient
    .select({ id: sourceAccountObservations.id })
    .from(sourceAccountObservations)
    .where(eq(sourceAccountObservations.ingestionRunId, ingestionResult.ingestionRunId));

  const runObsRows = await dbClient
    .select({ id: adObservations.id })
    .from(adObservations)
    .where(eq(adObservations.ingestionRunId, ingestionResult.ingestionRunId));

  const obsIdList = runObsRows.map((o) => o.id);

  const transparencyObsRows =
    obsIdList.length > 0
      ? await dbClient
          .select({ id: adTransparencyObservations.id })
          .from(adTransparencyObservations)
          .where(inArray(adTransparencyObservations.adObservationId, obsIdList))
      : [];

  const summary: CorpusIngestSummary = {
    provider: {
      url: plan.validatedInput.url,
      country: plan.validatedInput.country,
      requestedCount: plan.validatedInput.count,
      providerCount: fetchResult.items.length,
      scrapeAdDetails: plan.validatedInput.scrapeAdDetails,
      apifyRunId: fetchResult.runId,
      apifyDatasetId: fetchResult.datasetId,
      costUsd: fetchResult.costUsd,
    },
    ingestion: {
      providerItems: fetchResult.items.length,
      newAds: ingestionResult.createdAdsCount,
      updatedAds: ingestionResult.updatedAdsCount,
      failedItems: ingestionResult.failedItemsCount,
      ingestionRunId: ingestionResult.ingestionRunId,
      brandName: brandInfo.name,
      brandSlug: brandInfo.slug,
      sourcePageId,
    },
    evidence: {
      adObservations: runAdIds.length,
      sourceAccountObservations: sourceAccountObsRows.length,
      transparencyObservations: transparencyObsRows.length,
    },
    media: {
      totalObserved: totalDirectMediaCount + totalCardMediaCount,
      uniqueStored: runEligibleVideos.length,
      videos: runEligibleVideos.length,
      images: Math.max(0, (totalDirectMediaCount + totalCardMediaCount) - runEligibleVideos.length),
    },
    derivatives: {
      eligibleVideos: runEligibleVideos.length,
      alreadyReady: alreadyReadyCount,
      newlyReady: newlyReadyCount,
      failed: failedDerivativesCount,
    },
    discovery: {
      projectedAds: projectedCount,
    },
    ui: {
      discoverReady: projectedCount > 0 && failedDerivativesCount === 0 ? "YES" : "PARTIAL",
    },
  };

  printCorpusIngestSummary(summary);

  return {
    success: ingestionResult.status !== "FAILED",
    dryRun: false,
    summary,
  };
}

/**
 * Formats and prints the operator end-of-run summary.
 */
export function printCorpusIngestSummary(summary: CorpusIngestSummary): void {
  console.log("\n==================================================");
  console.log("CORPUS INGEST COMPLETE");
  console.log("==================================================");
  console.log("\nProvider:");
  console.log(`  URL:                     ${summary.provider.url}`);
  console.log(`  Country:                 ${summary.provider.country}`);
  console.log(`  Requested Ads:           ${summary.provider.requestedCount}`);
  console.log(`  Provider Items Returned: ${summary.provider.providerCount}`);
  console.log(`  Scrape Ad Details:       ${summary.provider.scrapeAdDetails}`);
  if (summary.provider.costUsd != null) {
    console.log(`  Cost (USD):              $${summary.provider.costUsd.toFixed(4)}`);
  }

  console.log("\nIngestion:");
  console.log(`  Brand:                   ${summary.ingestion.brandName} (${summary.ingestion.brandSlug})`);
  console.log(`  Source Page ID:          ${summary.ingestion.sourcePageId}`);
  console.log(`  Provider Items:          ${summary.ingestion.providerItems}`);
  console.log(`  New Ads:                 ${summary.ingestion.newAds}`);
  console.log(`  Updated Ads:             ${summary.ingestion.updatedAds}`);
  console.log(`  Failed Items:            ${summary.ingestion.failedItems}`);

  console.log("\nEvidence:");
  console.log(`  Ad Observations:         ${summary.evidence.adObservations}`);
  console.log(`  Source Account Obs:      ${summary.evidence.sourceAccountObservations}`);
  console.log(`  Transparency Obs:        ${summary.evidence.transparencyObservations}`);

  console.log("\nMedia:");
  console.log(`  Total Media Observed:    ${summary.media.totalObserved}`);
  console.log(`  Stored Video Assets:     ${summary.media.videos}`);

  console.log("\nDerivatives (preview-loop-v1):");
  console.log(`  Eligible Videos:         ${summary.derivatives.eligibleVideos}`);
  console.log(`  READY (Already Existed): ${summary.derivatives.alreadyReady}`);
  console.log(`  READY (Newly Generated): ${summary.derivatives.newlyReady}`);
  console.log(`  FAILED:                  ${summary.derivatives.failed}`);

  console.log("\nDiscovery:");
  console.log(`  Projected Ads:           ${summary.discovery.projectedAds}`);

  console.log("\nRun IDs:");
  console.log(`  Ingestion Run ID:        ${summary.ingestion.ingestionRunId ?? "N/A"}`);
  console.log(`  Apify Run ID:            ${summary.provider.apifyRunId ?? "N/A"}`);

  console.log("\nUI:");
  console.log(`  Discover-Ready:          ${summary.ui.discoverReady}`);
  console.log("==================================================\n");
}
