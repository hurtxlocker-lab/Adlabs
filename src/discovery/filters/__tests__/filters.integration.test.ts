import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { verifyDatabaseTargetSafety } from "@/db/target-safety";
import { env } from "@/env/server";
import { inArray } from "drizzle-orm";
import {
  ensureBrand,
  ensureSourceAccount,
  persistObservedAd,
  startIngestionRun,
} from "@/ingestion/persistence";
import { projectAd } from "@/discovery/projection";
import { queryDiscoveryAds, queryDiscoveryFacets } from "../query";
import type { SourceAd } from "@/ingestion/types";

describe("Discovery Filter Engine — Integration Tests", { timeout: 15000 }, () => {
  const testPrefix = `filt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const createdBrandIds: string[] = [];
  const createdSourceAccountIds: string[] = [];
  const createdIngestionRunIds: string[] = [];
  const createdRawItemIds: string[] = [];
  const createdAdIds: string[] = [];
  const createdObservationIds: string[] = [];

  beforeAll(() => {
    const target = verifyDatabaseTargetSafety(
      env.DATABASE_URL,
      env.SUPABASE_PROJECT_REF,
    );
    expect(target.matchesExpected).toBe(true);
  });

  afterAll(async () => {
    // 0. ad_discovery_index
    if (createdAdIds.length > 0) {
      await db
        .delete(schema.adDiscoveryIndex)
        .where(inArray(schema.adDiscoveryIndex.adId, createdAdIds));
    }

    // 1. observations
    if (createdObservationIds.length > 0) {
      await db
        .delete(schema.adTransparencyObservations)
        .where(
          inArray(
            schema.adTransparencyObservations.adObservationId,
            createdObservationIds,
          ),
        );
    }
    if (createdSourceAccountIds.length > 0) {
      await db
        .delete(schema.sourceAccountObservations)
        .where(
          inArray(
            schema.sourceAccountObservations.sourceAccountId,
            createdSourceAccountIds,
          ),
        );
    }

    // 2. ad_observations
    if (createdAdIds.length > 0) {
      await db
        .delete(schema.adObservations)
        .where(inArray(schema.adObservations.adId, createdAdIds));
    }

    // 3. raw_ingestion_items
    if (createdRawItemIds.length > 0) {
      await db
        .delete(schema.rawIngestionItems)
        .where(inArray(schema.rawIngestionItems.id, createdRawItemIds));
    }

    // 4. ads
    if (createdAdIds.length > 0) {
      await db
        .delete(schema.ads)
        .where(inArray(schema.ads.id, createdAdIds));
    }

    // 5. ingestion_runs
    if (createdIngestionRunIds.length > 0) {
      await db
        .delete(schema.ingestionRuns)
        .where(inArray(schema.ingestionRuns.id, createdIngestionRunIds));
    }

    // 6. source_accounts
    if (createdSourceAccountIds.length > 0) {
      await db
        .delete(schema.sourceAccounts)
        .where(inArray(schema.sourceAccounts.id, createdSourceAccountIds));
    }

    // 7. brands
    if (createdBrandIds.length > 0) {
      await db
        .delete(schema.brands)
        .where(inArray(schema.brands.id, createdBrandIds));
    }
  });

  it("1. filters by creative media type and active state", async () => {
    const brand = await ensureBrand({
      name: "Media Filter Brand",
      slug: `${testPrefix}_media_brand`,
    });
    createdBrandIds.push(brand.id);

    const account = await ensureSourceAccount({
      brandId: brand.id,
      source: "meta",
      sourcePageId: `page_${testPrefix}_media`,
      displayName: "Media Page",
    });
    createdSourceAccountIds.push(account.id);

    const run = await startIngestionRun({
      source: "meta",
      sourceAccountId: account.id,
    });
    createdIngestionRunIds.push(run.id);

    // Create Video Asset
    const [videoAsset] = await db
      .insert(schema.mediaAssets)
      .values({
        mediaType: "VIDEO",
        sha256: `${testPrefix}_sha_vid`,
        byteSize: BigInt(50000),
        storageProvider: "r2",
        storageKey: `media/videos/${testPrefix}_vid.mp4`,
        width: 1080,
        height: 1920,
        downloadStatus: "STORED",
      })
      .returning();

    // Ad 1: Active Video
    const ad1: SourceAd = {
      source: "meta",
      sourceAdId: `${testPrefix}_ad_vid_act`,
      advertiser: { sourcePageId: account.sourcePageId },
      headline: "Active Video Ad",
      primaryText: "Body 1",
      cards: [],
      directMedia: [],
      publisherPlatforms: ["facebook"],
      active: true,
      raw: { id: "1" },
    };

    const res1 = await persistObservedAd({
      sourceAccountId: account.id,
      ingestionRunId: run.id,
      ad: ad1,
      rawPayload: ad1.raw,
      rawPayloadHash: `sha256:${testPrefix}_1`,
    });
    createdRawItemIds.push(res1.rawItem.id);
    createdAdIds.push(res1.ad.id);
    createdObservationIds.push(res1.observation.id);

    await db.insert(schema.adMedia).values({
      adId: res1.ad.id,
      mediaAssetId: videoAsset.id,
      role: "video",
      position: 0,
    });
    await projectAd(res1.ad.id);

    // Query for active videos
    const result = await queryDiscoveryAds({
      filters: {
        brandIds: [brand.id],
        mediaTypes: ["VIDEO"],
        isActive: true,
      },
    });

    expect(result.items.some((i) => i.adId === res1.ad.id)).toBe(true);
  });

  it("2. filters by country using existential ANY semantics", async () => {
    const brand = await ensureBrand({
      name: "Country Filter Brand",
      slug: `${testPrefix}_country_brand`,
    });
    createdBrandIds.push(brand.id);

    const account = await ensureSourceAccount({
      brandId: brand.id,
      source: "meta",
      sourcePageId: `page_${testPrefix}_country`,
      displayName: "Country Page",
    });
    createdSourceAccountIds.push(account.id);

    const run = await startIngestionRun({
      source: "meta",
      sourceAccountId: account.id,
    });
    createdIngestionRunIds.push(run.id);

    // Ad 1: Reached Spain and France
    const ad1: SourceAd = {
      source: "meta",
      sourceAdId: `${testPrefix}_ad_es_fr`,
      advertiser: { sourcePageId: account.sourcePageId },
      headline: "European Delivery",
      primaryText: "Available in ES and FR.",
      transparencyObservations: [
        {
          region: "EU",
          totalReach: BigInt(50000),
          targetAgeMin: 18,
          targetAgeMax: 65,
          targetGender: "ALL",
          targetCountries: ["ES", "FR"],
          reachedCountries: ["ES", "FR"],
          reachBreakdown: {},
          providerPayload: {},
        },
      ],
      cards: [],
      directMedia: [],
      publisherPlatforms: ["facebook"],
      active: true,
      raw: { id: "c1" },
    };

    const res1 = await persistObservedAd({
      sourceAccountId: account.id,
      ingestionRunId: run.id,
      ad: ad1,
      rawPayload: ad1.raw,
      rawPayloadHash: `sha256:${testPrefix}_c1`,
    });
    createdRawItemIds.push(res1.rawItem.id);
    createdAdIds.push(res1.ad.id);
    createdObservationIds.push(res1.observation.id);

    // Ad 2: Reached Germany only
    const ad2: SourceAd = {
      source: "meta",
      sourceAdId: `${testPrefix}_ad_de`,
      advertiser: { sourcePageId: account.sourcePageId },
      headline: "Germany Delivery",
      primaryText: "Available in DE only.",
      transparencyObservations: [
        {
          region: "EU",
          totalReach: BigInt(30000),
          targetAgeMin: 18,
          targetAgeMax: 65,
          targetGender: "ALL",
          targetCountries: ["DE"],
          reachedCountries: ["DE"],
          reachBreakdown: {},
          providerPayload: {},
        },
      ],
      cards: [],
      directMedia: [],
      publisherPlatforms: ["facebook"],
      active: true,
      raw: { id: "c2" },
    };

    const res2 = await persistObservedAd({
      sourceAccountId: account.id,
      ingestionRunId: run.id,
      ad: ad2,
      rawPayload: ad2.raw,
      rawPayloadHash: `sha256:${testPrefix}_c2`,
    });
    createdRawItemIds.push(res2.rawItem.id);
    createdAdIds.push(res2.ad.id);
    createdObservationIds.push(res2.observation.id);

    // Query for reachedCountries: ["ES", "IT"] -> should match Ad 1 (has ES) but NOT Ad 2 (DE only)
    const result = await queryDiscoveryAds({
      filters: {
        brandIds: [brand.id],
        reachedCountries: ["ES", "IT"],
      },
    });

    const matchingIds = result.items.map((i) => i.adId);
    expect(matchingIds).toContain(res1.ad.id);
    expect(matchingIds).not.toContain(res2.ad.id);
  });

  it("3. verifies age interval overlap semantics and NULL exclusion", async () => {
    const brand = await ensureBrand({
      name: "Age Filter Brand",
      slug: `${testPrefix}_age_brand`,
    });
    createdBrandIds.push(brand.id);

    const account = await ensureSourceAccount({
      brandId: brand.id,
      source: "meta",
      sourcePageId: `page_${testPrefix}_age`,
      displayName: "Age Page",
    });
    createdSourceAccountIds.push(account.id);

    const run = await startIngestionRun({
      source: "meta",
      sourceAccountId: account.id,
    });
    createdIngestionRunIds.push(run.id);

    // Ad A: target 18–34
    const resA = await persistObservedAd({
      sourceAccountId: account.id,
      ingestionRunId: run.id,
      ad: {
        source: "meta",
        sourceAdId: `${testPrefix}_ad_age_18_34`,
        advertiser: { sourcePageId: account.sourcePageId },
        headline: "Young Adult Ad",
        transparencyObservations: [
          {
            region: "EU",
            totalReach: BigInt(50000),
            targetAgeMin: 18,
            targetAgeMax: 34,
            targetGender: "ALL",
            targetCountries: ["ES"],
            reachedCountries: ["ES"],
            reachBreakdown: {},
            providerPayload: {},
          },
        ],
        cards: [],
        directMedia: [],
        publisherPlatforms: ["facebook"],
        active: true,
        raw: { id: "a" },
      },
      rawPayload: { id: "a" },
      rawPayloadHash: `sha256:${testPrefix}_a`,
    });
    createdRawItemIds.push(resA.rawItem.id);
    createdAdIds.push(resA.ad.id);
    createdObservationIds.push(resA.observation.id);

    // Ad B: target 55–65
    const resB = await persistObservedAd({
      sourceAccountId: account.id,
      ingestionRunId: run.id,
      ad: {
        source: "meta",
        sourceAdId: `${testPrefix}_ad_age_55_65`,
        advertiser: { sourcePageId: account.sourcePageId },
        headline: "Senior Ad",
        transparencyObservations: [
          {
            region: "EU",
            totalReach: BigInt(50000),
            targetAgeMin: 55,
            targetAgeMax: 65,
            targetGender: "ALL",
            targetCountries: ["ES"],
            reachedCountries: ["ES"],
            reachBreakdown: {},
            providerPayload: {},
          },
        ],
        cards: [],
        directMedia: [],
        publisherPlatforms: ["facebook"],
        active: true,
        raw: { id: "b" },
      },
      rawPayload: { id: "b" },
      rawPayloadHash: `sha256:${testPrefix}_b`,
    });
    createdRawItemIds.push(resB.rawItem.id);
    createdAdIds.push(resB.ad.id);
    createdObservationIds.push(resB.observation.id);

    // Ad C: Non-regulated / Indian ad (NULL target age)
    const resC = await persistObservedAd({
      sourceAccountId: account.id,
      ingestionRunId: run.id,
      ad: {
        source: "meta",
        sourceAdId: `${testPrefix}_ad_age_null`,
        advertiser: { sourcePageId: account.sourcePageId },
        headline: "No Age Ad",
        transparencyObservations: [],
        cards: [],
        directMedia: [],
        publisherPlatforms: ["facebook"],
        active: true,
        raw: { id: "c" },
      },
      rawPayload: { id: "c" },
      rawPayloadHash: `sha256:${testPrefix}_c`,
    });
    createdRawItemIds.push(resC.rawItem.id);
    createdAdIds.push(resC.ad.id);
    createdObservationIds.push(resC.observation.id);

    // Query for age interval 25–34
    // Overlap: ad_min <= 34 AND ad_max >= 25
    // Ad A (18–34): 18 <= 34 (T) && 34 >= 25 (T) -> MATCH
    // Ad B (55–65): 55 <= 34 (F) -> NO MATCH
    // Ad C (NULL): NO MATCH
    const result = await queryDiscoveryAds({
      filters: {
        brandIds: [brand.id],
        euTargetAgeMin: 25,
        euTargetAgeMax: 34,
      },
    });

    const ids = result.items.map((i) => i.adId);
    expect(ids).toContain(resA.ad.id);
    expect(ids).not.toContain(resB.ad.id);
    expect(ids).not.toContain(resC.ad.id);
  });

  it("4. verifies combined moat query across video, country, reach, age, and reuse", async () => {
    const brand = await ensureBrand({
      name: "Moat Brand",
      slug: `${testPrefix}_moat_brand`,
    });
    createdBrandIds.push(brand.id);

    const account = await ensureSourceAccount({
      brandId: brand.id,
      source: "meta",
      sourcePageId: `page_${testPrefix}_moat`,
      displayName: "Moat Page",
    });
    createdSourceAccountIds.push(account.id);

    const run = await startIngestionRun({
      source: "meta",
      sourceAccountId: account.id,
    });
    createdIngestionRunIds.push(run.id);

    // Create shared video asset
    const [moatVideo] = await db
      .insert(schema.mediaAssets)
      .values({
        mediaType: "VIDEO",
        sha256: `${testPrefix}_moat_video_sha`,
        byteSize: BigInt(80000),
        storageProvider: "r2",
        storageKey: `media/videos/${testPrefix}_moat.mp4`,
        width: 1080,
        height: 1920,
        durationMs: 15000,
        downloadStatus: "STORED",
      })
      .returning();

    // Ad 1 (Target Match): Video, reached ES, EU reach 75K, age 25-45, reused SHA
    const res1 = await persistObservedAd({
      sourceAccountId: account.id,
      ingestionRunId: run.id,
      ad: {
        source: "meta",
        sourceAdId: `${testPrefix}_moat_ad_1`,
        advertiser: { sourcePageId: account.sourcePageId },
        headline: "Winning Moat Ad 1",
        transparencyObservations: [
          {
            region: "EU",
            totalReach: BigInt(75000),
            targetAgeMin: 25,
            targetAgeMax: 45,
            targetGender: "Female",
            targetCountries: ["ES"],
            reachedCountries: ["ES"],
            reachBreakdown: {},
            providerPayload: {},
          },
        ],
        cards: [],
        directMedia: [],
        publisherPlatforms: ["facebook", "instagram"],
        active: true,
        raw: { id: "m1" },
      },
      rawPayload: { id: "m1" },
      rawPayloadHash: `sha256:${testPrefix}_m1`,
    });
    createdRawItemIds.push(res1.rawItem.id);
    createdAdIds.push(res1.ad.id);
    createdObservationIds.push(res1.observation.id);

    await db.insert(schema.adMedia).values({
      adId: res1.ad.id,
      mediaAssetId: moatVideo.id,
      role: "video",
      position: 0,
    });

    // Ad 2 (Sibling for creative reuse): Reuses same video
    const res2 = await persistObservedAd({
      sourceAccountId: account.id,
      ingestionRunId: run.id,
      ad: {
        source: "meta",
        sourceAdId: `${testPrefix}_moat_ad_2`,
        advertiser: { sourcePageId: account.sourcePageId },
        headline: "Winning Moat Ad 2",
        transparencyObservations: [],
        cards: [],
        directMedia: [],
        publisherPlatforms: ["facebook"],
        active: true,
        raw: { id: "m2" },
      },
      rawPayload: { id: "m2" },
      rawPayloadHash: `sha256:${testPrefix}_m2`,
    });
    createdRawItemIds.push(res2.rawItem.id);
    createdAdIds.push(res2.ad.id);
    createdObservationIds.push(res2.observation.id);

    await db.insert(schema.adMedia).values({
      adId: res2.ad.id,
      mediaAssetId: moatVideo.id,
      role: "video",
      position: 0,
    });

    // Project both ads
    await projectAd(res1.ad.id);
    await projectAd(res2.ad.id);

    // Execute combined query
    const result = await queryDiscoveryAds({
      filters: {
        brandIds: [brand.id],
        mediaTypes: ["VIDEO"],
        reachedCountries: ["ES"],
        euReachMin: 10000,
        euTargetAgeMin: 25,
        euTargetAgeMax: 44,
        exactCreativeReuseMin: 2,
      },
    });

    const ids = result.items.map((i) => i.adId);
    expect(ids).toContain(res1.ad.id);
    expect(ids).not.toContain(res2.ad.id); // Ad 2 has no EU reach / ES country
  });

  it("5. enforces limit_per_brand diversity control and cursor pagination", async () => {
    const brand1 = await ensureBrand({
      name: "Brand 1 Multi",
      slug: `${testPrefix}_b1_multi`,
    });
    createdBrandIds.push(brand1.id);
    const brand2 = await ensureBrand({
      name: "Brand 2 Multi",
      slug: `${testPrefix}_b2_multi`,
    });
    createdBrandIds.push(brand2.id);

    const acc1 = await ensureSourceAccount({
      brandId: brand1.id,
      source: "meta",
      sourcePageId: `page_${testPrefix}_b1`,
      displayName: "B1 Page",
    });
    createdSourceAccountIds.push(acc1.id);
    const acc2 = await ensureSourceAccount({
      brandId: brand2.id,
      source: "meta",
      sourcePageId: `page_${testPrefix}_b2`,
      displayName: "B2 Page",
    });
    createdSourceAccountIds.push(acc2.id);

    const run1 = await startIngestionRun({ source: "meta", sourceAccountId: acc1.id });
    const run2 = await startIngestionRun({ source: "meta", sourceAccountId: acc2.id });
    createdIngestionRunIds.push(run1.id, run2.id);

    // Ingest 3 ads for brand 1 and 3 ads for brand 2
    for (let i = 1; i <= 3; i++) {
      const r1 = await persistObservedAd({
        sourceAccountId: acc1.id,
        ingestionRunId: run1.id,
        ad: {
          source: "meta",
          sourceAdId: `${testPrefix}_b1_ad_${i}`,
          advertiser: { sourcePageId: acc1.sourcePageId },
          headline: `Brand 1 Ad ${i}`,
          cards: [],
          directMedia: [],
          publisherPlatforms: ["facebook"],
          active: true,
          raw: { id: `b1_${i}` },
        },
        rawPayload: { id: `b1_${i}` },
        rawPayloadHash: `sha256:${testPrefix}_b1_${i}`,
      });
      createdRawItemIds.push(r1.rawItem.id);
      createdAdIds.push(r1.ad.id);
      createdObservationIds.push(r1.observation.id);

      const r2 = await persistObservedAd({
        sourceAccountId: acc2.id,
        ingestionRunId: run2.id,
        ad: {
          source: "meta",
          sourceAdId: `${testPrefix}_b2_ad_${i}`,
          advertiser: { sourcePageId: acc2.sourcePageId },
          headline: `Brand 2 Ad ${i}`,
          cards: [],
          directMedia: [],
          publisherPlatforms: ["facebook"],
          active: true,
          raw: { id: `b2_${i}` },
        },
        rawPayload: { id: `b2_${i}` },
        rawPayloadHash: `sha256:${testPrefix}_b2_${i}`,
      });
      createdRawItemIds.push(r2.rawItem.id);
      createdAdIds.push(r2.ad.id);
      createdObservationIds.push(r2.observation.id);
    }

    // Query with limit_per_brand = 2 across both brands
    const result = await queryDiscoveryAds({
      filters: {
        brandIds: [brand1.id, brand2.id],
      },
      limitPerBrand: 2,
      pageSize: 10,
    });

    // Max 2 ads per brand -> at most 4 ads total
    expect(result.items.length).toBe(4);

    // Test cursor pagination: page size 2
    const page1 = await queryDiscoveryAds({
      filters: {
        brandIds: [brand1.id, brand2.id],
      },
      limitPerBrand: 2,
      pageSize: 2,
    });

    expect(page1.items.length).toBe(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await queryDiscoveryAds({
      filters: {
        brandIds: [brand1.id, brand2.id],
      },
      limitPerBrand: 2,
      pageSize: 2,
      cursor: page1.nextCursor!,
    });

    expect(page2.items.length).toBe(2);

    // Ensure no overlapping items between page 1 and page 2
    const page1Ids = new Set(page1.items.map((i) => i.adId));
    for (const item of page2.items) {
      expect(page1Ids.has(item.adId)).toBe(false);
    }
  });

  it("6. computes disjunctive facets without zero-collapsing unselected values", async () => {
    const brand = await ensureBrand({
      name: "Facet Test Brand",
      slug: `${testPrefix}_facet_brand`,
    });
    createdBrandIds.push(brand.id);

    const account = await ensureSourceAccount({
      brandId: brand.id,
      source: "meta",
      sourcePageId: `page_${testPrefix}_facet`,
      displayName: "Facet Page",
    });
    createdSourceAccountIds.push(account.id);

    const run = await startIngestionRun({
      source: "meta",
      sourceAccountId: account.id,
    });
    createdIngestionRunIds.push(run.id);

    // Asset Portrait
    const [portraitAsset] = await db
      .insert(schema.mediaAssets)
      .values({
        mediaType: "IMAGE",
        sha256: `${testPrefix}_facet_port`,
        byteSize: BigInt(30000),
        storageProvider: "r2",
        storageKey: `media/images/${testPrefix}_port.jpg`,
        width: 1080,
        height: 1920,
        downloadStatus: "STORED",
      })
      .returning();

    // Asset Square
    const [squareAsset] = await db
      .insert(schema.mediaAssets)
      .values({
        mediaType: "IMAGE",
        sha256: `${testPrefix}_facet_sq`,
        byteSize: BigInt(30000),
        storageProvider: "r2",
        storageKey: `media/images/${testPrefix}_sq.jpg`,
        width: 1080,
        height: 1080,
        downloadStatus: "STORED",
      })
      .returning();

    // Ad 1: Portrait Image
    const res1 = await persistObservedAd({
      sourceAccountId: account.id,
      ingestionRunId: run.id,
      ad: {
        source: "meta",
        sourceAdId: `${testPrefix}_ad_f_port`,
        advertiser: { sourcePageId: account.sourcePageId },
        headline: "Portrait Ad",
        cards: [],
        directMedia: [],
        publisherPlatforms: ["facebook"],
        active: true,
        raw: { id: "fp" },
      },
      rawPayload: { id: "fp" },
      rawPayloadHash: `sha256:${testPrefix}_fp`,
    });
    createdRawItemIds.push(res1.rawItem.id);
    createdAdIds.push(res1.ad.id);
    createdObservationIds.push(res1.observation.id);

    await db.insert(schema.adMedia).values({
      adId: res1.ad.id,
      mediaAssetId: portraitAsset.id,
      role: "primary",
      position: 0,
    });
    await projectAd(res1.ad.id);

    // Ad 2: Square Image
    const res2 = await persistObservedAd({
      sourceAccountId: account.id,
      ingestionRunId: run.id,
      ad: {
        source: "meta",
        sourceAdId: `${testPrefix}_ad_f_sq`,
        advertiser: { sourcePageId: account.sourcePageId },
        headline: "Square Ad",
        cards: [],
        directMedia: [],
        publisherPlatforms: ["facebook"],
        active: true,
        raw: { id: "fs" },
      },
      rawPayload: { id: "fs" },
      rawPayloadHash: `sha256:${testPrefix}_fs`,
    });
    createdRawItemIds.push(res2.rawItem.id);
    createdAdIds.push(res2.ad.id);
    createdObservationIds.push(res2.observation.id);

    await db.insert(schema.adMedia).values({
      adId: res2.ad.id,
      mediaAssetId: squareAsset.id,
      role: "primary",
      position: 0,
    });
    await projectAd(res2.ad.id);

    // When querying with shapeFamilies = ["portrait"], the shape facet should STILL report both portrait AND square counts!
    const facets = await queryDiscoveryFacets({
      filters: {
        brandIds: [brand.id],
        shapeFamilies: ["portrait"],
      },
    });

    const shapeCounts = new Map(facets.shapeFamilies.map((s) => [s.value, s.count]));
    expect(shapeCounts.get("portrait")).toBe(1);
    expect(shapeCounts.get("square")).toBe(1); // Disjunctive: not collapsed to zero!
  });
});
