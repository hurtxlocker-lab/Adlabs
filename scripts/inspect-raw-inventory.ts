import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env") as {
  loadEnvConfig: (dir: string) => void;
};
loadEnvConfig(projectRoot);

import { db, closeDatabaseConnection } from "../src/db/client";
import { ads, sourceAccounts, brands } from "../src/db/schema";
import { parseCuriousCoderItem } from "../src/ingestion/sources/meta/curious-coder/parser";
import { normalizeCuriousCoderAd } from "../src/ingestion/sources/meta/curious-coder/normalizer";

interface CandidateArtifact {
  path: string;
  metaPath?: string;
}

const candidates: CandidateArtifact[] = [
  {
    path: "tmp/france-transparency-probe-full.json",
    metaPath: "tmp/france-transparency-probe-meta.json",
  },
  {
    path: "tmp/colombia-transparency-probe-full.json",
    metaPath: "tmp/colombia-transparency-probe-meta.json",
  },
  {
    path: "tmp/transparency-probe-full.json",
    metaPath: "tmp/transparency-probe-meta.json",
  },
  {
    path: "tmp/run-on-full.json",
    metaPath: "tmp/comparison-runs-metadata.json",
  },
  {
    path: "tmp/run-off-full.json",
    metaPath: "tmp/comparison-runs-metadata.json",
  },
  {
    path: "tmp/curious-coder-details-on.json",
  },
  {
    path: "tmp/curious-coder-details-off.json",
  },
];

async function main() {
  try {
    const allDbAds = await db.select({
      id: ads.id,
      sourceAdId: ads.sourceAdId,
      sourceAccountId: ads.sourceAccountId,
    }).from(ads);
    const dbSourceAdIds = new Set(allDbAds.map((a) => a.sourceAdId));

    const allDbAccounts = await db.select({
      id: sourceAccounts.id,
      sourcePageId: sourceAccounts.sourcePageId,
      displayName: sourceAccounts.displayName,
      brandId: sourceAccounts.brandId,
    }).from(sourceAccounts);

    const allDbBrands = await db.select().from(brands);
    console.log(`Current DEV DB State: ${allDbAds.length} ads, ${allDbAccounts.length} accounts, ${allDbBrands.length} brands`);
    for (const b of allDbBrands) {
      console.log(` - Brand: ${b.name} (${b.slug}) id: ${b.id}`);
    }

    console.log("\n=== RAW ARTIFACTS INVENTORY ===");

    for (const cand of candidates) {
      const fullPath = path.resolve(projectRoot, cand.path);
      if (!fs.existsSync(fullPath)) continue;

      const rawContent = fs.readFileSync(fullPath, "utf-8");
      const parsedJson = JSON.parse(rawContent);
      let items: Array<Record<string, unknown>> = [];
      let meta: Record<string, unknown> = {};

      if (Array.isArray(parsedJson)) {
        items = parsedJson;
        if (cand.metaPath) {
          const metaFullPath = path.resolve(projectRoot, cand.metaPath);
          if (fs.existsSync(metaFullPath)) {
            meta = JSON.parse(fs.readFileSync(metaFullPath, "utf-8"));
          }
        }
      } else if (parsedJson && typeof parsedJson === "object" && Array.isArray(parsedJson.items)) {
        items = parsedJson.items;
        meta = parsedJson as Record<string, unknown>;
      } else {
        console.log(`\n${cand.path}: Not an array and no .items property (skipping)`);
        continue;
      }

      // Check items
      const itemAdArchiveIds: string[] = [];
      const pageNames = new Set<string>();
      const pageIds = new Set<string>();
      let parseSuccessCount = 0;
      let parseFailCount = 0;
      let hasTransparencyCount = 0;
      const regionsSeen = new Set<string>();
      let hasAccountEnrichmentCount = 0;
      let alreadyInDbCount = 0;
      const sourceStartDates: Date[] = [];

      const metaInput = meta.input && typeof meta.input === "object" ? (meta.input as Record<string, unknown>) : {};
      const runB = meta.runB_ON && typeof meta.runB_ON === "object" ? (meta.runB_ON as Record<string, unknown>) : {};
      const runBInput = runB.input && typeof runB.input === "object" ? (runB.input as Record<string, unknown>) : {};
      const collectionCountryCode = (typeof metaInput["scrapePageAds.countryCode"] === "string" ? metaInput["scrapePageAds.countryCode"] : undefined) ??
        (typeof runBInput["scrapePageAds.countryCode"] === "string" ? runBInput["scrapePageAds.countryCode"] : undefined);

      for (const item of items) {
        const adArchiveId = String(item.adArchiveID || item.ad_archive_id || item.id || "");
        if (adArchiveId) {
          itemAdArchiveIds.push(adArchiveId);
          if (dbSourceAdIds.has(adArchiveId)) {
            alreadyInDbCount++;
          }
        }

        const pName = typeof item.pageName === "string" ? item.pageName : typeof item.page_name === "string" ? item.page_name : undefined;
        const pId = item.pageID || item.page_id;
        if (pName) pageNames.add(pName);
        if (pId) pageIds.add(String(pId));

        try {
          const parsed = parseCuriousCoderItem(item);
          const normalized = normalizeCuriousCoderAd(parsed.data, item);
          if (normalized) {
            parseSuccessCount++;
            if (normalized.transparencyObservations && normalized.transparencyObservations.length > 0) {
              hasTransparencyCount++;
              for (const to of normalized.transparencyObservations) {
                regionsSeen.add(to.region);
              }
            }
            if (normalized.accountObservation && Object.keys(normalized.accountObservation).length > 0) {
              hasAccountEnrichmentCount++;
            }
            if (normalized.platformStartAt) {
              sourceStartDates.push(normalized.platformStartAt);
            }
          } else {
            parseFailCount++;
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("Parse error on item:", adArchiveId, msg);
          parseFailCount++;
        }
      }

      sourceStartDates.sort((a, b) => a.getTime() - b.getTime());

      console.log(`\nFile: ${cand.path}`);
      console.log(` - Item count: ${items.length}`);
      console.log(` - Pages: ${Array.from(pageNames).join(", ")} (Page IDs: ${Array.from(pageIds).join(", ")})`);
      console.log(` - Parse compatibility: ${parseSuccessCount}/${items.length} success, ${parseFailCount} failed`);
      console.log(` - Already in DB: ${alreadyInDbCount}/${items.length}`);
      console.log(` - Transparency items: ${hasTransparencyCount}/${items.length}`);
      console.log(` - Regions seen: ${Array.from(regionsSeen).join(", ") || "none"}`);
      console.log(` - Account enrichment: ${hasAccountEnrichmentCount}/${items.length}`);
      console.log(` - Source dates range: ${sourceStartDates.length > 0 ? `${sourceStartDates[0].toISOString()} to ${sourceStartDates[sourceStartDates.length - 1].toISOString()}` : "none"}`);
      if (meta.runId || (runB && "runId" in runB)) {
        console.log(` - Meta runId: ${meta.runId || (runB as Record<string, unknown>).runId}`);
        console.log(` - Meta startedAt: ${meta.startedAt || (runB as Record<string, unknown>).startedAt}`);
        console.log(` - Meta scrapeAdDetails: ${metaInput.scrapeAdDetails ?? runBInput.scrapeAdDetails}`);
        console.log(` - Meta countryCode: ${collectionCountryCode}`);
      }
    }
  } finally {
    await closeDatabaseConnection();
  }
}

main().catch(console.error);
