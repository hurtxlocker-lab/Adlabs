/**
 * Phase 4 — Corpus Scenario Verification Script
 *
 * Run with: pnpm tsx scripts/verify-corpus-scenarios.ts
 *
 * Validates all 9 manual dev scenarios from the Phase 4 spec
 * against the live ad_discovery_index.
 */

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

import { queryDiscoveryAds } from "../src/discovery/filters";
import type { DiscoveryFilterInput } from "../src/discovery/filters/types";
import { closeDatabaseConnection } from "../src/db/client";

async function countAds(filters: DiscoveryFilterInput, label: string): Promise<number> {
  const result = await queryDiscoveryAds({ filters, pageSize: 100 });
  const n = result.items.length;
  console.log(`  ${label}: ${n}`);
  return n;
}

async function main() {
  console.log("\n=== Phase 4 Corpus Scenario Verification ===\n");

  try {
    // A. VIDEO
    const a = await countAds({ mediaTypes: ["VIDEO"] }, "A. VIDEO");

    // B. Reached Spain
    const b = await countAds({ reachedCountries: ["ES"] }, "B. Reached Spain (ES)");

    // C. EU transparency
    const c = await countAds({ hasEuTransparencyEvidence: true }, "C. EU transparency");

    // D. EU reach >= 10K
    const d = await countAds({ euReachMin: 10000 }, "D. EU reach >= 10K");

    // E. Reached France + EU target age overlap 25-44
    const e = await countAds(
      { reachedCountries: ["FR"], euTargetAgeMin: 25, euTargetAgeMax: 44 },
      "E. Reached France + EU age 25-44",
    );

    // F. Creative reuse >= 4
    const f = await countAds({ exactCreativeReuseMin: 4 }, "F. Creative reuse >= 4");

    // G. Instagram followers >= 50K
    const g = await countAds({ instagramFollowersMin: 50000 }, "G. IG followers >= 50K");

    // H. VIDEO + Reached Spain + EU reach >= 10K
    const h = await countAds(
      { mediaTypes: ["VIDEO"], reachedCountries: ["ES"], euReachMin: 10000 },
      "H. VIDEO + Spain + EU reach >= 10K",
    );

    // I. Clear all (no filters)
    const i = await countAds({}, "I. Clear all (full corpus)");

    console.log("\n=== Summary ===");
    console.log(`A (VIDEO):                     ${a}`);
    console.log(`B (Spain):                     ${b}`);
    console.log(`C (EU transparency):           ${c}`);
    console.log(`D (EU reach >= 10K):           ${d}`);
    console.log(`E (France + EU age 25-44):     ${e}`);
    console.log(`F (reuse >= 4):                ${f}`);
    console.log(`G (IG followers >= 50K):       ${g}`);
    console.log(`H (VIDEO + Spain + reach 10K): ${h}`);
    console.log(`I (all filters cleared):       ${i}`);
    console.log("");
  } finally {
    await closeDatabaseConnection();
  }
}

main().catch(console.error);
