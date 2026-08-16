import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs";
import path from "node:path";
import { closeDatabaseConnection } from "../src/db/client.ts";
import { CandidateBatchConfigSchema } from "../src/corpus/config-schema.ts";
import { sampleSingleBrand } from "./corpus-sample-dev.ts";
import { getAdLibraryItems } from "../src/features/ad-library/index.ts";
import { computeCorpusAudit, formatCorpusAuditTable } from "../src/corpus/audit.ts";

function parseCliArgs(argv: string[]) {
  let configPath = "";
  const isDryRun = argv.includes("--dry-run");

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--config" && argv[i + 1]) {
      configPath = argv[++i];
    }
  }

  return { configPath, isDryRun };
}

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(__dirname, "..");
  const require = createRequire(import.meta.url);
  const { loadEnvConfig } = require("@next/env") as {
    loadEnvConfig: (dir: string) => void;
  };
  loadEnvConfig(projectRoot);

  const { configPath, isDryRun } = parseCliArgs(process.argv.slice(2));

  if (!configPath) {
    console.error(
      "❌ Usage: pnpm corpus:sample-batch:dev --config <path-to-json-config> [--dry-run]",
    );
    process.exitCode = 1;
    return;
  }

  const resolvedPath = path.isAbsolute(configPath)
    ? configPath
    : path.resolve(process.cwd(), configPath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ Config file not found at: ${resolvedPath}`);
    process.exitCode = 1;
    return;
  }

  let rawJson: unknown;
  try {
    const fileContent = fs.readFileSync(resolvedPath, "utf-8");
    rawJson = JSON.parse(fileContent);
  } catch (err) {
    console.error(`❌ Failed to parse config JSON: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  const candidates = CandidateBatchConfigSchema.parse(rawJson);

  console.log(`\n================================================================================`);
  console.log(`ADLABS DEV BATCH CORPUS SAMPLER (${candidates.length} brands queued)`);
  console.log(`Mode: ${isDryRun ? "DRY-RUN (Zero network / DB writes)" : "LIVE SEQUENTIAL SAMPLING"}`);
  console.log(`================================================================================\n`);

  const results: Array<{
    brand: string;
    status: "SUCCEEDED" | "FAILED" | "DRY_RUN";
    error?: string;
    costUsd?: number | null;
    itemsCreated?: number;
    itemsUpdated?: number;
  }> = [];

  try {
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      console.log(`\n[${i + 1}/${candidates.length}] Processing Candidate: "${candidate.brand}"...`);

      try {
        const res = await sampleSingleBrand({
          brand: candidate.brand,
          url: candidate.url,
          limit: candidate.limit,
          isDryRun,
        });

        if (isDryRun) {
          results.push({ brand: candidate.brand, status: "DRY_RUN" });
        } else {
          results.push({
            brand: candidate.brand,
            status: "SUCCEEDED",
            costUsd: res.apifyResult?.costUsd,
            itemsCreated: res.ingestionResult?.createdAdsCount,
            itemsUpdated: res.ingestionResult?.updatedAdsCount,
          });
        }
      } catch (err) {
        console.error(`  ❌ Failed sampling "${candidate.brand}": ${err instanceof Error ? err.message : String(err)}`);
        results.push({
          brand: candidate.brand,
          status: "FAILED",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    console.log(`\n================================================================================`);
    console.log(`BATCH SAMPLING SUMMARY`);
    console.log(`================================================================================`);
    for (const r of results) {
      const statusStr = r.status.padEnd(10);
      const details =
        r.status === "SUCCEEDED"
          ? `+${r.itemsCreated ?? 0} created, ${r.itemsUpdated ?? 0} updated (Cost: ${r.costUsd != null ? `$${r.costUsd.toFixed(4)}` : "N/A"})`
          : r.status === "DRY_RUN"
            ? "Dry run validated"
            : `Error: ${r.error}`;
      console.log(`  ${r.brand.padEnd(25)} | ${statusStr} | ${details}`);
    }
    console.log(`================================================================================\n`);

    if (!isDryRun) {
      const allItems = await getAdLibraryItems();
      const auditResult = computeCorpusAudit(allItems);
      console.log(formatCorpusAuditTable(auditResult));
    }
  } finally {
    await closeDatabaseConnection();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error("\n❌ Batch Error:", err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
