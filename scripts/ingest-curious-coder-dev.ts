/**
 * scripts/ingest-curious-coder-dev.ts
 *
 * DEV smoke / stress run: Apify saved task → Curious Coder → Step 4F ingestion.
 *
 * This script is the ONLY entry point for the Apify paid task execution.
 * It is NOT part of pnpm test, pnpm test:db, pnpm build, or pnpm lint.
 *
 * Pre-conditions:
 *   - .env.local contains APIFY_TOKEN and APIFY_CURIOUS_CODER_TASK_ID
 *   - .env.local contains DATABASE_URL and SUPABASE_PROJECT_REF
 *   - .env.local contains R2 credentials
 *
 * Run via:
 *   pnpm ingest:curious-coder:dev [--limit <1..10>] [--dry-run]
 *
 * Executes EXACTLY ONE saved Apify task run. No automatic retries.
 * Default local hard cap = 3 items.
 *
 * Timeout for Apify run: 5 minutes (300 seconds).
 *
 * Safe output only — never prints token, DATABASE_URL, or R2 credentials.
 * Never prints raw provider payloads or signed Meta CDN URLs.
 */

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { closeDatabaseConnection } from "../src/db/client.ts";
import { verifyDatabaseTargetSafety } from "../src/db/target-safety.ts";
import {
  createApifyClient,
  fetchCuriousCoderTaskItems,
  ApifyConfigurationError,
  ApifyTaskRunError,
  ApifyDatasetError,
} from "../src/ingestion/providers/apify/index.ts";
import { runCuriousCoderIngestion } from "../src/ingestion/run-orchestration/index.ts";
import { safeParseCuriousCoderItem } from "../src/ingestion/sources/meta/curious-coder/index.ts";
import type { CuriousCoderItem } from "../src/ingestion/sources/meta/curious-coder/schema.ts";

/**
 * Validates and parses the --limit CLI argument.
 *
 * Contract:
 *  - Default cap = 3
 *  - Explicit override: 1 <= requested limit <= 10
 *  - Rejects: 0, negative numbers, floats, non-integers, > 10.
 */
function parseCliLimit(args: string[]): number {
  const limitIndex = args.indexOf("--limit");
  if (limitIndex === -1) {
    return 3;
  }

  const valueStr = args[limitIndex + 1];
  if (!valueStr || valueStr.startsWith("--")) {
    throw new Error(
      "❌ --limit flag provided without a value. Usage: pnpm ingest:curious-coder:dev [--limit <1..10>]",
    );
  }

  const parsed = Number(valueStr);
  if (!Number.isInteger(parsed) || isNaN(parsed)) {
    throw new Error(
      `❌ Invalid --limit value "${valueStr}". Limit must be an integer between 1 and 10.`,
    );
  }

  if (parsed < 1 || parsed > 10) {
    throw new Error(
      `❌ Invalid --limit value ${parsed}. Limit must be between 1 and 10.`,
    );
  }

  return parsed;
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

function resolveBrandForPage(item: CuriousCoderItem): {
  name: string;
  slug: string;
} {
  const rawName = (item.page_name ?? item.snapshot?.page_name ?? "").trim();
  const pageUrl = (
    item.page_profile_uri ??
    item.snapshot?.page_profile_uri ??
    ""
  ).toLowerCase();

  // Known brand normalization
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

  const name = rawName || `Page ${item.page_id}`;
  return { name, slug: slugifyBrandName(name) };
}

async function main(): Promise<void> {
  // ---------------------------------------------------------------------------
  // 1. Load environment
  // ---------------------------------------------------------------------------

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(__dirname, "..");

  const require = createRequire(import.meta.url);
  const { loadEnvConfig } = require("@next/env") as {
    loadEnvConfig: (dir: string) => void;
  };
  loadEnvConfig(projectRoot);

  // ---------------------------------------------------------------------------
  // 2. Validate CLI arguments & Cap Contract
  // ---------------------------------------------------------------------------

  let requestedLimit: number;
  try {
    requestedLimit = parseCliLimit(process.argv.slice(2));
  } catch (err) {
    console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
    return;
  }

  const isDryRun = process.argv.includes("--dry-run");

  // ---------------------------------------------------------------------------
  // 3. Validate required config (fail closed before any paid call)
  // ---------------------------------------------------------------------------

  const TASK_ID = process.env.APIFY_CURIOUS_CODER_TASK_ID;
  const APIFY_TIMEOUT_SECONDS = 300;

  if (!TASK_ID || TASK_ID.trim().length === 0) {
    console.error(
      "\n❌ APIFY_CURIOUS_CODER_TASK_ID is not set.\n" +
        "   Set it in .env.local (see .env.example).\n",
    );
    process.exitCode = 1;
    return;
  }

  // DB target safety — fail closed before any network or DB mutation.
  const DATABASE_URL = process.env.DATABASE_URL;
  const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;

  if (!DATABASE_URL) {
    console.error("\n❌ DATABASE_URL is not set. Check .env.local.\n");
    process.exitCode = 1;
    return;
  }

  try {
    verifyDatabaseTargetSafety(DATABASE_URL, SUPABASE_PROJECT_REF);
  } catch (err) {
    console.error(
      `\n❌ DB Target Safety failed:\n   ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
    return;
  }

  // R2 configuration check
  const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
  const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
  const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

  if (
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET_NAME
  ) {
    console.error(
      "\n❌ R2 configuration is incomplete. All of R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,\n" +
        "   R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME must be set in .env.local.\n",
    );
    process.exitCode = 1;
    return;
  }

  // ---------------------------------------------------------------------------
  // 4. Pre-flight confirmation
  // ---------------------------------------------------------------------------

  console.log("\n=== AdLabs DEV Ingestion — Curious Coder Live Runner ===\n");
  console.log(`  environment:       DEV`);
  console.log(`  task ID:           ${TASK_ID.trim()}`);
  console.log(`  requested limit:   ${requestedLimit} items max`);
  console.log(`  apify timeout:     ${APIFY_TIMEOUT_SECONDS}s`);
  console.log(`  DB target safety:  PASSED`);
  console.log(`  R2 config:         PRESENT`);
  console.log(
    `  dry run mode:      ${isDryRun ? "YES (no network/DB calls will be made)" : "NO"}`,
  );
  console.log("");

  if (isDryRun) {
    console.log(
      "  ✓ [Dry Run] Module graph, dependencies, and pre-flight configuration loaded successfully.",
    );
    console.log(
      "  ✓ Zero Apify calls made. Zero DB writes made. Zero R2 writes made.",
    );
    console.log("\n=== Dry run complete ===\n");
    return;
  }

  console.log(
    "  NOTE: This will execute ONE paid Apify task run. No automatic retries.",
  );
  console.log("");

  // ---------------------------------------------------------------------------
  // 5. Execute Apify saved task (ONE run, no retries)
  // ---------------------------------------------------------------------------

  let runId: string;
  let runStatus: string;
  let datasetId: string;
  let datasetItemCount: number;
  let rawDatasetItems: unknown[];

  try {
    const apifyClient = createApifyClient();

    console.log(`[Apify] Starting saved task: ${TASK_ID.trim()} ...`);
    // Retrieve up to 10 dataset items (actor-side total ceiling) to allow balanced selection
    const fetchResult = await fetchCuriousCoderTaskItems(
      {
        taskId: TASK_ID.trim(),
        limit: 10,
        timeoutSeconds: APIFY_TIMEOUT_SECONDS,
      },
      apifyClient,
    );

    runId = fetchResult.runId;
    runStatus = fetchResult.runStatus;
    datasetId = fetchResult.datasetId;
    datasetItemCount = fetchResult.datasetItemCount;
    rawDatasetItems = fetchResult.items;
  } catch (err) {
    if (err instanceof ApifyConfigurationError) {
      console.error(`\n❌ Apify configuration error: ${err.message}\n`);
    } else if (err instanceof ApifyTaskRunError) {
      console.error(
        `\n❌ Apify task run error:\n` +
          `   task ID:    ${err.taskId}\n` +
          `   run ID:     ${err.runId ?? "(unknown)"}\n` +
          `   run status: ${err.runStatus ?? "(unknown)"}\n` +
          `   message:    ${err.message}\n`,
      );
    } else if (err instanceof ApifyDatasetError) {
      console.error(
        `\n❌ Apify dataset error:\n` +
          `   task ID:    ${err.taskId}\n` +
          `   run ID:     ${err.runId ?? "(unknown)"}\n` +
          `   dataset ID: ${err.datasetId ?? "(unknown)"}\n` +
          `   message:    ${err.message}\n`,
      );
    } else {
      console.error(
        `\n❌ Unexpected Apify error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log("\n[Apify] Run complete:");
  console.log(`  run ID:            ${runId}`);
  console.log(`  final status:      ${runStatus}`);
  console.log(`  dataset ID:        ${datasetId}`);
  console.log(`  dataset items:     ${datasetItemCount}`);

  if (rawDatasetItems.length === 0) {
    console.log(
      "\n⚠  No items returned from Apify dataset. Run completed but nothing to ingest.\n",
    );
    return;
  }

  // ---------------------------------------------------------------------------
  // 6. Balanced Multi-Brand Grouping & Selection
  // ---------------------------------------------------------------------------

  interface BrandGroup {
    pageId: string;
    brand: { name: string; slug: string };
    sourceAccount: {
      sourcePageId: string;
      sourcePageUrl: string;
      displayName: string;
    };
    rawItems: unknown[];
  }

  const brandGroups = new Map<string, BrandGroup>();

  for (let i = 0; i < rawDatasetItems.length; i++) {
    const parseResult = safeParseCuriousCoderItem(rawDatasetItems[i]);
    if (!parseResult.success) {
      console.warn(
        `  ⚠ Dataset item ${i} failed schema parse: ${parseResult.error.message}`,
      );
      continue;
    }

    const item = parseResult.data;
    const pageId = (item.page_id ?? "").trim();
    if (!pageId) {
      console.warn(`  ⚠ Dataset item ${i} has missing or blank page_id`);
      continue;
    }

    if (!brandGroups.has(pageId)) {
      const brandInfo = resolveBrandForPage(item);
      const pageUrl =
        item.page_profile_uri ??
        item.snapshot?.page_profile_uri ??
        `https://www.facebook.com/${pageId}`;
      const displayName =
        item.page_name ?? item.snapshot?.page_name ?? brandInfo.name;

      brandGroups.set(pageId, {
        pageId,
        brand: brandInfo,
        sourceAccount: {
          sourcePageId: pageId,
          sourcePageUrl: pageUrl,
          displayName,
        },
        rawItems: [],
      });
    }

    brandGroups.get(pageId)!.rawItems.push(rawDatasetItems[i]);
  }

  const uniqueBrandCount = brandGroups.size;
  console.log(`\n[Multi-Brand Detection]`);
  console.log(`  distinct brands found: ${uniqueBrandCount}`);
  for (const [pageId, group] of brandGroups) {
    console.log(
      `    - ${group.brand.name} (page_id: ${pageId}): ${group.rawItems.length} items in dataset`,
    );
  }

  if (uniqueBrandCount === 0) {
    console.error("\n❌ No valid parseable brand items found in dataset.\n");
    process.exitCode = 1;
    return;
  }

  // Calculate balanced per-brand selection quota
  // Target: equal share per brand up to requestedLimit, capped at 3 per brand
  const maxPerBrand = Math.max(1, Math.min(3, Math.ceil(requestedLimit / uniqueBrandCount)));
  let totalSelectedCount = 0;

  const finalExecutionGroups: {
    group: BrandGroup;
    selectedItems: unknown[];
  }[] = [];

  for (const [, group] of brandGroups) {
    const remainingCap = requestedLimit - totalSelectedCount;
    if (remainingCap <= 0) break;

    const countToTake = Math.min(group.rawItems.length, maxPerBrand, remainingCap);
    const selected = group.rawItems.slice(0, countToTake);
    totalSelectedCount += selected.length;

    finalExecutionGroups.push({
      group,
      selectedItems: selected,
    });
  }

  console.log(`\n[Balanced Selection — Max Cap: ${requestedLimit}]`);
  for (const { group, selectedItems } of finalExecutionGroups) {
    console.log(
      `  - ${group.brand.name}: ${selectedItems.length} items selected for ingestion`,
    );
  }
  console.log(`  Total items passed to ingestion: ${totalSelectedCount}`);

  // ---------------------------------------------------------------------------
  // 7. Execute Step 4F Ingestion per Brand Group
  // ---------------------------------------------------------------------------

  const overallResults: {
    brandName: string;
    ingestionRunId: string;
    status: string;
    sourceItemsCount: number;
    succeededCount: number;
    failedCount: number;
    createdAdsCount: number;
    updatedAdsCount: number;
  }[] = [];

  for (const { group, selectedItems } of finalExecutionGroups) {
    if (selectedItems.length === 0) continue;

    console.log(
      `\n[Ingestion] Starting Step 4F batch for ${group.brand.name} (${selectedItems.length} items) ...`,
    );

    try {
      const result = await runCuriousCoderIngestion({
        brand: group.brand,
        sourceAccount: group.sourceAccount,
        providerItems: selectedItems,
        sourceMetadata: {
          apifyRunId: runId,
          apifyTaskId: TASK_ID.trim(),
          apifyDatasetId: datasetId,
        },
        ingestionRunMetadata: {
          trigger: "manual-dev-stress-test",
        },
      });

      overallResults.push({
        brandName: group.brand.name,
        ingestionRunId: result.ingestionRunId,
        status: result.status,
        sourceItemsCount: result.sourceItemsCount,
        succeededCount: result.succeededItemsCount,
        failedCount: result.failedItemsCount,
        createdAdsCount: result.createdAdsCount,
        updatedAdsCount: result.updatedAdsCount,
      });

      if (result.failures.length > 0) {
        console.log(`  ⚠ Failures in ${group.brand.name}:`);
        for (const failure of result.failures) {
          console.log(
            `    [item ${failure.itemIndex}: ${failure.stage}] sourceAdId: ${failure.sourceAdId ?? "(unknown)"} — ${failure.message}`,
          );
        }
      }
    } catch (err) {
      console.error(
        `\n❌ Ingestion batch failed for brand ${group.brand.name}:\n` +
          `   ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exitCode = 1;
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // 8. Output Summary
  // ---------------------------------------------------------------------------

  console.log("\n=== Live Ingestion Summary ===\n");
  console.log(`  Apify Run ID:          ${runId}`);
  console.log(`  Apify Dataset ID:      ${datasetId}`);
  console.log(`  Apify Final Status:    ${runStatus}`);
  console.log(`  Apify Total Items:     ${datasetItemCount}`);
  console.log(`  Total Items Ingested:  ${totalSelectedCount}`);
  console.log("");

  for (const r of overallResults) {
    console.log(`  Brand: ${r.brandName}`);
    console.log(`    Ingestion Run ID:    ${r.ingestionRunId}`);
    console.log(`    Status:              ${r.status}`);
    console.log(`    Source Items:        ${r.sourceItemsCount}`);
    console.log(`    Succeeded:           ${r.succeededCount}`);
    console.log(`    Failed:              ${r.failedCount}`);
    console.log(`    Created Ads:         ${r.createdAdsCount}`);
    console.log(`    Updated Ads:         ${r.updatedAdsCount}`);
  }

  console.log("\n  No automatic retries were performed.");
  console.log("  No credentials were printed.");
  console.log("  No schema changes. No migrations.");
  console.log("\n=== Live Ingestion Complete ===\n");
}

main()
  .catch((err) => {
    console.error(
      `\n❌ Unhandled error in dev ingestion runner:\n   ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection();
  });
