/**
 * scripts/ingest-curious-coder-dev.ts
 *
 * DEV smoke run: Apify saved task → Curious Coder → Step 4F ingestion.
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
 *   pnpm ingest:curious-coder:dev
 *
 * Executes EXACTLY ONE saved Apify task run. No automatic retries.
 * Local hard cap = 3 items.
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
  // 2. Validate required config (fail closed before any paid call)
  // ---------------------------------------------------------------------------

  const TASK_ID = process.env.APIFY_CURIOUS_CODER_TASK_ID;
  const LOCAL_HARD_CAP = 3;
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

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    console.error(
      "\n❌ R2 configuration is incomplete. All of R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,\n" +
        "   R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME must be set in .env.local.\n",
    );
    process.exitCode = 1;
    return;
  }

  // ---------------------------------------------------------------------------
  // 3. Pre-flight confirmation
  // ---------------------------------------------------------------------------

  const isDryRun = process.argv.includes("--dry-run");

  console.log("\n=== AdLabs DEV Smoke Run — Curious Coder Ingestion ===\n");
  console.log(`  environment:       DEV`);
  console.log(`  task ID:           ${TASK_ID.trim()}`);
  console.log(`  local hard cap:    ${LOCAL_HARD_CAP}`);
  console.log(`  apify timeout:     ${APIFY_TIMEOUT_SECONDS}s`);
  console.log(`  DB target safety:  PASSED`);
  console.log(`  R2 config:         PRESENT`);
  console.log(`  dry run mode:      ${isDryRun ? "YES (no network/DB calls will be made)" : "NO"}`);
  console.log("");

  if (isDryRun) {
    console.log("  ✓ [Dry Run] Module graph, dependencies, and pre-flight configuration loaded successfully.");
    console.log("  ✓ Zero Apify calls made. Zero DB writes made. Zero R2 writes made.");
    console.log("\n=== Dry run complete ===\n");
    return;
  }

  console.log("  NOTE: This will execute ONE paid Apify task run. No automatic retries.");
  console.log("");

  // ---------------------------------------------------------------------------
  // 4. Execute Apify saved task (ONE run, no retries)
  // ---------------------------------------------------------------------------

  let runId: string;
  let runStatus: string;
  let datasetId: string;
  let datasetItemCount: number;
  let providerItems: unknown[];

  try {
    const apifyClient = createApifyClient();

    console.log(`[Apify] Starting saved task: ${TASK_ID.trim()} ...`);
    const fetchResult = await fetchCuriousCoderTaskItems(
      {
        taskId: TASK_ID.trim(),
        limit: LOCAL_HARD_CAP,
        timeoutSeconds: APIFY_TIMEOUT_SECONDS,
      },
      apifyClient,
    );

    runId = fetchResult.runId;
    runStatus = fetchResult.runStatus;
    datasetId = fetchResult.datasetId;
    datasetItemCount = fetchResult.datasetItemCount;
    providerItems = fetchResult.items;
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
  console.log(`  items to ingest:   ${providerItems.length} (after local cap of ${LOCAL_HARD_CAP})`);

  if (providerItems.length === 0) {
    console.log("\n⚠  No items returned from Apify dataset. Run completed but nothing to ingest.\n");
    return;
  }

  // ---------------------------------------------------------------------------
  // 5. Determine and validate sourcePageId from parsed provider items
  //
  // The normalizer requires item.page_id (the top-level tracked advertiser page ID).
  // The sourcePageId for the source account must match what the normalizer
  // will extract from item.page_id on each ingested ad.
  //
  // Safety rule:
  //  - Parse up to locally capped items.
  //  - Obtain top-level advertiser/source page ID from first parseable item.
  //  - Require non-empty sourcePageId.
  //  - Require all successfully parsed items to agree on the same advertiser page ID.
  //  - If any disagree, STOP before Step 4F / DB mutation.
  // ---------------------------------------------------------------------------

  let firstResolvedSourcePageId: string | null = null;
  let firstResolvedDisplayName: string | null = null;

  for (let i = 0; i < providerItems.length; i++) {
    const parseResult = safeParseCuriousCoderItem(providerItems[i]);
    if (!parseResult.success) {
      // If the first item fails to parse, we cannot resolve source account
      if (i === 0) {
        console.error(
          "\n❌ First dataset item failed Curious Coder schema validation.\n" +
            "   Cannot safely determine sourcePageId for the source account.\n" +
            "   Parse error: " +
            parseResult.error.message +
            "\n",
        );
        process.exitCode = 1;
        return;
      }
      // Subsequent item parse failures will be handled during Step 4F per-item isolation
      continue;
    }

    const item = parseResult.data;
    const itemAdvertiserPageId = item.page_id ? item.page_id.trim() : "";

    if (itemAdvertiserPageId.length === 0) {
      if (i === 0) {
        console.error(
          "\n❌ First dataset item has a missing or blank top-level page_id.\n" +
            "   Cannot safely determine sourcePageId for the source account.\n",
        );
        process.exitCode = 1;
        return;
      }
      continue;
    }

    if (firstResolvedSourcePageId === null) {
      firstResolvedSourcePageId = itemAdvertiserPageId;
      firstResolvedDisplayName = item.page_name ?? null;
    } else if (firstResolvedSourcePageId !== itemAdvertiserPageId) {
      console.error(
        `\n❌ Advertiser page_id mismatch detected in dataset items.\n` +
          `   Item 0 has page_id "${firstResolvedSourcePageId}", but item ${i} has page_id "${itemAdvertiserPageId}".\n` +
          `   All items in a single source-account run must belong to the same advertiser.\n` +
          `   Halting before DB mutation.\n`,
      );
      process.exitCode = 1;
      return;
    }
  }

  if (!firstResolvedSourcePageId) {
    console.error(
      "\n❌ No valid top-level advertiser page_id found among provider items.\n" +
        "   Cannot safely determine sourcePageId for the source account.\n",
    );
    process.exitCode = 1;
    return;
  }

  const resolvedSourcePageId: string = firstResolvedSourcePageId;
  const resolvedDisplayName: string | null = firstResolvedDisplayName;

  console.log("\n[Source account]");
  console.log(`  resolved sourcePageId: ${resolvedSourcePageId}`);
  console.log(
    `  display name:          ${resolvedDisplayName ?? "(not present in items)"}`,
  );

  // ---------------------------------------------------------------------------
  // 6. Call Step 4F (existing batch orchestration — unchanged)
  // ---------------------------------------------------------------------------

  console.log("\n[Ingestion] Starting Step 4F batch run ...\n");

  const brandInput = {
    name: "Mamaearth",
    slug: "mamaearth",
  };

  const sourceAccountInput = {
    sourcePageId: resolvedSourcePageId,
    sourcePageUrl: "https://www.facebook.com/Mamaearthindia",
    displayName: resolvedDisplayName ?? "Mamaearth India",
  };

  let ingestionResult;
  try {
    ingestionResult = await runCuriousCoderIngestion({
      brand: brandInput,
      sourceAccount: sourceAccountInput,
      providerItems,
      sourceMetadata: {
        apifyRunId: runId,
        apifyTaskId: TASK_ID.trim(),
        apifyDatasetId: datasetId,
      },
      ingestionRunMetadata: {
        trigger: "manual-dev-smoke",
      },
    });
  } catch (err) {
    console.error(
      "\n❌ runCuriousCoderIngestion threw an unexpected error:\n" +
        `   ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
    return;
  }

  // ---------------------------------------------------------------------------
  // 7. Safe output summary
  // ---------------------------------------------------------------------------

  console.log("\n=== Ingestion Result ===\n");
  console.log(`  ingestionRunId:        ${ingestionResult.ingestionRunId}`);
  console.log(`  status:                ${ingestionResult.status}`);
  console.log(`  sourceItemsCount:      ${ingestionResult.sourceItemsCount}`);
  console.log(`  succeededItemsCount:   ${ingestionResult.succeededItemsCount}`);
  console.log(`  failedItemsCount:      ${ingestionResult.failedItemsCount}`);
  console.log(`  createdAdsCount:       ${ingestionResult.createdAdsCount}`);
  console.log(`  updatedAdsCount:       ${ingestionResult.updatedAdsCount}`);

  if (ingestionResult.failures.length > 0) {
    console.log("\n  Item failures:");
    for (const failure of ingestionResult.failures) {
      console.log(`    [item ${failure.itemIndex}]`);
      console.log(`      sourceAdId: ${failure.sourceAdId ?? "(unknown)"}`);
      console.log(`      stage:      ${failure.stage}`);
      console.log(`      errorCode:  ${failure.errorCode ?? "(none)"}`);
      // Message has already been sanitized by runCuriousCoderIngestion (URLs redacted)
      console.log(`      message:    ${failure.message}`);
    }
  }

  console.log("");
  console.log("  Apify exact cost: exact cost not available");
  console.log("  (Check Apify console for billing details for run ID: " + runId + ")");
  console.log("");
  console.log("  No automatic retries were performed.");
  console.log("  No credentials were printed.");
  console.log("  No schema changes. No migrations.");
  console.log("");
  console.log("=== DEV smoke run complete ===\n");
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
