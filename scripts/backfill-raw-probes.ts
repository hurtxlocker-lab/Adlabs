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
import { ingestionRuns, ads, adObservations } from "../src/db/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  ensureBrand,
  ensureSourceAccount,
  startIngestionRun,
  finishIngestionRun,
  persistPreparedObservedAd,
  persistObservedAd,
} from "../src/ingestion/persistence";
import { parseCuriousCoderItem } from "../src/ingestion/sources/meta/curious-coder/parser";
import { normalizeCuriousCoderAd } from "../src/ingestion/sources/meta/curious-coder/normalizer";
import { prepareAdMedia } from "../src/ingestion/media-orchestration/prepare-ad-media";
import type { PreparedAdMedia } from "../src/ingestion/media-orchestration/types";
import { queryDiscoveryAds, queryDiscoveryFacets } from "../src/discovery/filters";

interface CohortConfig {
  name: string;
  brandName: string;
  brandSlug: string;
  sourcePageId: string;
  rawFilePath: string;
  metaFilePath: string;
}

const cohorts: CohortConfig[] = [
  {
    name: "SHOKZ",
    brandName: "Shokz",
    brandSlug: "shokz",
    sourcePageId: "600548870095210",
    rawFilePath: "tmp/france-transparency-probe-full.json",
    metaFilePath: "tmp/france-transparency-probe-meta.json",
  },
  {
    name: "NIDA",
    brandName: "NIDA Skincare",
    brandSlug: "nida-skincare",
    sourcePageId: "107300265685734",
    rawFilePath: "tmp/colombia-transparency-probe-full.json",
    metaFilePath: "tmp/colombia-transparency-probe-meta.json",
  },
  {
    name: "EVOLV",
    brandName: "Evolv",
    brandSlug: "evolv",
    sourcePageId: "407694675756821",
    rawFilePath: "tmp/transparency-probe-full.json",
    metaFilePath: "tmp/transparency-probe-meta.json",
  },
];

async function backfillCohort(cohort: CohortConfig) {
  console.log(`\n==================================================`);
  console.log(`BACKFILLING COHORT: ${cohort.name}`);
  console.log(`==================================================`);

  const rawFull = path.resolve(projectRoot, cohort.rawFilePath);
  const metaFull = path.resolve(projectRoot, cohort.metaFilePath);

  if (!fs.existsSync(rawFull) || !fs.existsSync(metaFull)) {
    throw new Error(`Missing raw or meta file for ${cohort.name}`);
  }

  const rawItems: Array<Record<string, unknown>> = JSON.parse(fs.readFileSync(rawFull, "utf-8"));
  const meta: Record<string, unknown> = JSON.parse(fs.readFileSync(metaFull, "utf-8"));

  const providerRunId = typeof meta.runId === "string" ? meta.runId : undefined;
  const providerDatasetId = typeof meta.datasetId === "string" ? meta.datasetId : undefined;
  const startedAt = typeof meta.startedAt === "string" ? new Date(meta.startedAt) : new Date();
  const finishedAt = typeof meta.finishedAt === "string" ? new Date(meta.finishedAt) : new Date();
  const metaInput = meta.input && typeof meta.input === "object" ? (meta.input as Record<string, unknown>) : {};
  const collectionCountryCode = typeof metaInput["scrapePageAds.countryCode"] === "string" ? metaInput["scrapePageAds.countryCode"] : undefined;

  console.log(`Provider Run ID: ${providerRunId}`);
  console.log(`Original Observation Timestamp: ${startedAt.toISOString()}`);
  console.log(`Collection Country Context: ${collectionCountryCode || "NONE"}`);
  console.log(`Raw Item Count: ${rawItems.length}`);

  // 1. Ensure canonical brand & account
  const brand = await ensureBrand({
    name: cohort.brandName,
    slug: cohort.brandSlug,
  });

  const account = await ensureSourceAccount({
    brandId: brand.id,
    source: "meta",
    sourcePageId: cohort.sourcePageId,
    displayName: cohort.brandName,
  });

  console.log(`Brand: ${brand.name} (${brand.id})`);
  console.log(`Source Account: ${account.displayName} (${account.id})`);

  // 2. Check for existing backfill ingestion run (Idempotency)
  let runId: string;
  const [existingRun] = await db
    .select()
    .from(ingestionRuns)
    .where(
      sql`${ingestionRuns.metadata}->>'providerRunId' = ${providerRunId}`,
    )
    .limit(1);

  if (existingRun) {
    runId = existingRun.id;
    console.log(`Found existing ingestion run: ${runId} (status: ${existingRun.status})`);
  } else {
    const newRun = await startIngestionRun({
      source: "meta",
      sourceAccountId: account.id,
      startedAt,
      metadata: {
        backfill: true,
        providerRunId,
        providerDatasetId,
        collectionCountryCode,
        scrapeAdDetails: true,
      },
    });
    runId = newRun.id;
    console.log(`Started new backfill ingestion run: ${runId}`);
  }

  // 3. Process each raw item through the normal pipeline
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let mediaDownloaded = 0;
  const mediaDuplicates = 0;
  let mediaFailed = 0;
  const bytesDownloaded = BigInt(0);
  let bytesStored = BigInt(0);

  for (let idx = 0; idx < rawItems.length; idx++) {
    const raw = rawItems[idx];
    const adArchiveId = String(raw.ad_archive_id || raw.adArchiveID || raw.id);

    // Parse with Curious Coder parser
    const parsed = parseCuriousCoderItem(raw);

    // Normalize with pure domain normalizer
    const normalizedAd = normalizeCuriousCoderAd(parsed.data, raw);

    // Check if canonical ad exists
    const [existingAd] = await db
      .select({ id: ads.id })
      .from(ads)
      .where(and(eq(ads.source, "meta"), eq(ads.sourceAdId, normalizedAd.sourceAdId)))
      .limit(1);

    if (existingAd) {
      // Check if observation for this ad in this run already exists
      const [existingObs] = await db
        .select({ id: adObservations.id })
        .from(adObservations)
        .where(
          and(
            eq(adObservations.adId, existingAd.id),
            eq(adObservations.ingestionRunId, runId),
          ),
        )
        .limit(1);

      if (existingObs) {
        console.log(` [${idx + 1}/${rawItems.length}] Ad ${adArchiveId}: Observation already exists. Skipping.`);
        skippedCount++;
        continue;
      }
    }

    // Try full media preparation
    let preparedMedia: PreparedAdMedia | null = null;
    try {
      preparedMedia = await prepareAdMedia(normalizedAd);
      for (const dm of preparedMedia.directMedia) {
        bytesStored += dm.media.byteSize;
        mediaDownloaded++;
      }
      for (const cm of preparedMedia.cardMedia) {
        for (const m of cm.media) {
          bytesStored += m.media.byteSize;
          mediaDownloaded++;
        }
      }
    } catch (mediaErr: unknown) {
      const msg = mediaErr instanceof Error ? mediaErr.message : String(mediaErr);
      console.warn(` [${idx + 1}/${rawItems.length}] Ad ${adArchiveId}: Media preparation warning: ${msg}. Falling back to persistence without direct media assets.`);
      mediaFailed++;
    }

    if (preparedMedia) {
      const persistRes = await persistPreparedObservedAd({
        sourceAccountId: account.id,
        ingestionRunId: runId,
        ad: normalizedAd,
        rawPayload: raw,
        preparedMedia,
        observedAt: startedAt,
      });
      if (persistRes.adOutcome === "created") createdCount++;
      else updatedCount++;
      console.log(` [${idx + 1}/${rawItems.length}] Ad ${adArchiveId} (${persistRes.adOutcome}) -> DB ID: ${persistRes.ad.id}, Trans: ${persistRes.transparencyObservationCount ?? 0}`);
    } else {
      const persistRes = await persistObservedAd({
        sourceAccountId: account.id,
        ingestionRunId: runId,
        ad: normalizedAd,
        rawPayload: raw,
        rawPayloadHash: `sha256:backfill_${adArchiveId}`,
        observedAt: startedAt,
      });
      if (persistRes.adOutcome === "created") createdCount++;
      else updatedCount++;
      console.log(` [${idx + 1}/${rawItems.length}] Ad ${adArchiveId} (${persistRes.adOutcome}) -> DB ID: ${persistRes.ad.id}, Trans: ${persistRes.transparencyObservationCount ?? 0}`);
    }
  }

  // Finalize run if it was RUNNING
  if (!existingRun || existingRun.status === "RUNNING") {
    await finishIngestionRun({
      ingestionRunId: runId,
      status: "SUCCEEDED",
      finishedAt,
      sourceItemsCount: rawItems.length,
      newAdsCount: createdCount,
      updatedAdsCount: updatedCount,
      mediaDownloadedCount: mediaDownloaded,
      mediaDuplicateCount: mediaDuplicates,
      mediaFailedCount: mediaFailed,
      bytesDownloaded,
      uniqueBytesStored: bytesStored,
      metadata: {
        backfillCompletedAt: new Date().toISOString(),
        providerRunId,
        providerDatasetId,
      },
    });
    console.log(`Finalized ingestion run ${runId} with status SUCCEEDED.`);
  }

  console.log(`Cohort Summary: Created: ${createdCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}`);
}

async function main() {
  try {
    for (const cohort of cohorts) {
      await backfillCohort(cohort);

      // Targeted assertions after each cohort
      console.log(`\n--- RUNNING TARGETED FILTER ASSERTIONS FOR ${cohort.name} ---`);
      if (cohort.name === "SHOKZ") {
        const resEu = await queryDiscoveryAds({
          filters: {
            hasEuTransparencyEvidence: true,
          },
        });
        console.log(` - Ads with EU Transparency Evidence: ${resEu.items.length}`);

        const resReach1k = await queryDiscoveryAds({
          filters: {
            euReachMin: 1000,
          },
        });
        console.log(` - Ads with EU Reach >= 1K: ${resReach1k.items.length}`);

        const resAge = await queryDiscoveryAds({
          filters: {
            euTargetAgeMin: 25,
            euTargetAgeMax: 44,
          },
        });
        console.log(` - Ads with EU Target Age Overlapping 25-44: ${resAge.items.length}`);

        const resFr = await queryDiscoveryAds({
          filters: {
            targetCountries: ["FR"],
          },
        });
        console.log(` - Ads with Target Country FR: ${resFr.items.length}`);
      }

      if (cohort.name === "NIDA") {
        const resEs = await queryDiscoveryAds({
          filters: {
            reachedCountries: ["ES"],
          },
        });
        console.log(` - Ads with Reached Country ES: ${resEs.items.length}`);

        const resCo = await queryDiscoveryAds({
          filters: {
            targetCountries: ["CO"],
          },
        });
        console.log(` - Ads with Target Country CO (should be 0 because CO was collection only): ${resCo.items.length}`);

        const resCombinedNida = await queryDiscoveryAds({
          filters: {
            hasEuTransparencyEvidence: true,
            reachedCountries: ["ES"],
          },
        });
        console.log(` - Ads with EU Evidence AND Reached Country ES: ${resCombinedNida.items.length}`);
      }

      if (cohort.name === "EVOLV") {
        const resUk = await queryDiscoveryAds({
          filters: {
            hasUkTransparencyEvidence: true,
          },
        });
        console.log(` - Ads with UK Transparency Evidence: ${resUk.items.length}`);

        const resAllFacets = await queryDiscoveryFacets({});
        console.log(` - Transparency Presence Across Corpus:`, resAllFacets.transparencyEvidence);
      }
    }
  } finally {
    await closeDatabaseConnection();
  }
}

main().catch(console.error);
