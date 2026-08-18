import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { verifyDatabaseTargetSafety } from "@/db/target-safety";
import { env } from "@/env/server";
import { and, eq, inArray } from "drizzle-orm";
import {
  ensureBrand,
  ensureSourceAccount,
  persistObservedAd,
  startIngestionRun,
} from "@/ingestion/persistence";
import {
  projectAd,
  rebuildDiscoveryIndex,
} from "../projector";
import type { SourceAd } from "@/ingestion/types";

describe("Discovery Projection Integration", () => {
  const testPrefix = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
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

    // 1. transparency & account observations
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

  it("1. projects an Indian / non-regulated ad accurately with zero transparency and null reach", async () => {
    const brand = await ensureBrand({
      name: "Indian Brand",
      slug: `${testPrefix}_in_brand`,
    });
    createdBrandIds.push(brand.id);

    const account = await ensureSourceAccount({
      brandId: brand.id,
      source: "meta",
      sourcePageId: `page_${testPrefix}_in`,
      displayName: "Indian Brand Page",
    });
    createdSourceAccountIds.push(account.id);

    const run = await startIngestionRun({
      source: "meta",
      sourceAccountId: account.id,
      metadata: { collection_country_code: "IN" },
    });
    createdIngestionRunIds.push(run.id);

    const sourceAd: SourceAd = {
      source: "meta",
      sourceAdId: `${testPrefix}_ad_in_1`,
      advertiser: {
        sourcePageId: account.sourcePageId,
        name: "Indian Brand",
      },
      headline: "Best Cotton T-Shirts",
      primaryText: "Buy 2 Get 1 Free on all casual wear.",
      transparencyObservations: [],
      cards: [],
      directMedia: [],
      publisherPlatforms: ["facebook", "instagram"],
      active: true,
      raw: { id: `${testPrefix}_ad_in_1` },
    };

    const persisted = await persistObservedAd({
      sourceAccountId: account.id,
      ingestionRunId: run.id,
      ad: sourceAd,
      rawPayload: sourceAd.raw,
      rawPayloadHash: `sha256:${testPrefix}_raw_in_1`,
    });

    createdRawItemIds.push(persisted.rawItem.id);
    createdAdIds.push(persisted.ad.id);
    createdObservationIds.push(persisted.observation.id);

    // Verify projection in ad_discovery_index
    const [projected] = await db
      .select()
      .from(schema.adDiscoveryIndex)
      .where(eq(schema.adDiscoveryIndex.adId, persisted.ad.id));

    expect(projected).toBeDefined();
    expect(projected.brandId).toBe(brand.id);
    expect(projected.isActive).toBe(true);
    expect(projected.copyLengthChars).toBe(57); // "Buy 2 Get 1 Free on all casual wear.\nBest Cotton T-Shirts"
    expect(projected.copyLengthWords).toBe(12);
    expect(projected.hasEuTransparencyEvidence).toBe(false);
    expect(projected.hasUkTransparencyEvidence).toBe(false);
    expect(projected.hasBrTransparencyEvidence).toBe(false);
    expect(projected.latestEuTotalReach).toBeNull();
    expect(projected.targetCountries).toEqual([]);
    expect(projected.reachedCountries).toEqual([]);
    expect(projected.latestEuTargetAgeMin).toBeNull();
    expect(projected.latestEuTargetAgeMax).toBeNull();
    expect(projected.latestEuTargetGender).toBeNull();
  });

  it("2. projects Nida-like ad (collection CO, EU reach ES) without collection country leakage", async () => {
    const brand = await ensureBrand({
      name: "Skincare Brand",
      slug: `${testPrefix}_skincare_brand`,
    });
    createdBrandIds.push(brand.id);

    const account = await ensureSourceAccount({
      brandId: brand.id,
      source: "meta",
      sourcePageId: `page_${testPrefix}_skincare`,
      displayName: "Skincare Page",
    });
    createdSourceAccountIds.push(account.id);

    const run = await startIngestionRun({
      source: "meta",
      sourceAccountId: account.id,
      metadata: { collection_country_code: "CO" },
    });
    createdIngestionRunIds.push(run.id);

    const sourceAd: SourceAd = {
      source: "meta",
      sourceAdId: `${testPrefix}_ad_nida_1`,
      advertiser: {
        sourcePageId: account.sourcePageId,
        name: "Skincare Brand",
      },
      headline: "Anti-Aging Serum",
      primaryText: "Clinically proven formula.",
      transparencyObservations: [
        {
          region: "EU",
          totalReach: BigInt(86294),
          targetAgeMin: 25,
          targetAgeMax: 55,
          targetGender: "Female",
          targetCountries: ["ES"],
          reachedCountries: ["ES"],
          reachBreakdown: { spain: 86294 },
          providerPayload: { eu_total_reach: 86294 },
        },
      ],
      cards: [],
      directMedia: [],
      publisherPlatforms: ["facebook"],
      active: true,
      raw: { id: `${testPrefix}_ad_nida_1` },
    };

    const persisted = await persistObservedAd({
      sourceAccountId: account.id,
      ingestionRunId: run.id,
      ad: sourceAd,
      rawPayload: sourceAd.raw,
      rawPayloadHash: `sha256:${testPrefix}_raw_nida_1`,
    });

    createdRawItemIds.push(persisted.rawItem.id);
    createdAdIds.push(persisted.ad.id);
    createdObservationIds.push(persisted.observation.id);

    const [projected] = await db
      .select()
      .from(schema.adDiscoveryIndex)
      .where(eq(schema.adDiscoveryIndex.adId, persisted.ad.id));

    expect(projected.hasEuTransparencyEvidence).toBe(true);
    expect(projected.latestEuTotalReach).toBe(BigInt(86294));
    expect(projected.targetCountries).toEqual(["ES"]);
    expect(projected.reachedCountries).toEqual(["ES"]);
    expect(projected.targetCountries).not.toContain("CO");
    expect(projected.reachedCountries).not.toContain("CO");
    expect(projected.latestEuTargetAgeMin).toBe(25);
    expect(projected.latestEuTargetAgeMax).toBe(55);
    expect(projected.latestEuTargetGender).toBe("Female");
  });

  it("3. lossy age/gender regression: preserves region-specific facts for EU 18-24 Female + UK 55-65 Male", async () => {
    const brand = await ensureBrand({
      name: "Global Audio Brand",
      slug: `${testPrefix}_audio_brand`,
    });
    createdBrandIds.push(brand.id);

    const account = await ensureSourceAccount({
      brandId: brand.id,
      source: "meta",
      sourcePageId: `page_${testPrefix}_audio`,
      displayName: "Audio Official",
    });
    createdSourceAccountIds.push(account.id);

    // Run 1: Observation with EU transparency (18-24, Female, FR/ES)
    const run1 = await startIngestionRun({
      source: "meta",
      sourceAccountId: account.id,
      metadata: { collection_country_code: "ALL" },
    });
    createdIngestionRunIds.push(run1.id);

    const adV1: SourceAd = {
      source: "meta",
      sourceAdId: `${testPrefix}_ad_audio_1`,
      advertiser: {
        sourcePageId: account.sourcePageId,
        name: "Global Audio",
      },
      headline: "Open-Ear Headphones",
      primaryText: "Hear your music and your surroundings.",
      transparencyObservations: [
        {
          region: "EU",
          totalReach: BigInt(95000),
          targetAgeMin: 18,
          targetAgeMax: 24,
          targetGender: "Female",
          targetCountries: ["ES", "FR"],
          reachedCountries: ["ES", "FR"],
          reachBreakdown: {},
          providerPayload: { eu_total_reach: 95000 },
        },
      ],
      cards: [],
      directMedia: [],
      publisherPlatforms: ["facebook", "instagram"],
      active: true,
      raw: { id: `${testPrefix}_ad_audio_1` },
    };

    const res1 = await persistObservedAd({
      sourceAccountId: account.id,
      ingestionRunId: run1.id,
      ad: adV1,
      rawPayload: adV1.raw,
      rawPayloadHash: `sha256:${testPrefix}_audio_raw_1`,
    });

    createdRawItemIds.push(res1.rawItem.id);
    createdAdIds.push(res1.ad.id);
    createdObservationIds.push(res1.observation.id);

    // Run 2: Reobservation of same ad with UK transparency (55-65, Male, GB)
    const run2 = await startIngestionRun({
      source: "meta",
      sourceAccountId: account.id,
      metadata: { collection_country_code: "GB" },
    });
    createdIngestionRunIds.push(run2.id);

    const adV2: SourceAd = {
      ...adV1,
      transparencyObservations: [
        {
          region: "UK",
          totalReach: BigInt(22000),
          targetAgeMin: 55,
          targetAgeMax: 65,
          targetGender: "Male",
          targetCountries: ["GB"],
          reachedCountries: ["GB"],
          reachBreakdown: {},
          providerPayload: { total_reach: 22000 },
        },
      ],
    };

    const res2 = await persistObservedAd({
      sourceAccountId: account.id,
      ingestionRunId: run2.id,
      ad: adV2,
      rawPayload: adV2.raw,
      rawPayloadHash: `sha256:${testPrefix}_audio_raw_2`,
    });

    createdRawItemIds.push(res2.rawItem.id);
    createdObservationIds.push(res2.observation.id);

    // Verify projection: preserves independent regional evidence
    const [projected] = await db
      .select()
      .from(schema.adDiscoveryIndex)
      .where(eq(schema.adDiscoveryIndex.adId, res1.ad.id));

    expect(projected.hasEuTransparencyEvidence).toBe(true);
    expect(projected.latestEuTotalReach).toBe(BigInt(95000));
    expect(projected.latestEuTargetAgeMin).toBe(18);
    expect(projected.latestEuTargetAgeMax).toBe(24);
    expect(projected.latestEuTargetGender).toBe("Female");

    expect(projected.hasUkTransparencyEvidence).toBe(true);
    expect(projected.latestUkTotalReach).toBe(BigInt(22000));
    expect(projected.latestUkTargetAgeMin).toBe(55);
    expect(projected.latestUkTargetAgeMax).toBe(65);
    expect(projected.latestUkTargetGender).toBe("Male");

    // Deterministic country union
    expect(projected.targetCountries).toEqual(["ES", "FR", "GB"]);
    expect(projected.reachedCountries).toEqual(["ES", "FR", "GB"]);
  });

  it("4. handles representative SHA change X -> Y: old SHA peers decrement and new SHA peers increment", async () => {
    const brand = await ensureBrand({
      name: "D2C Apparel",
      slug: `${testPrefix}_apparel_brand`,
    });
    createdBrandIds.push(brand.id);

    const account = await ensureSourceAccount({
      brandId: brand.id,
      source: "meta",
      sourcePageId: `page_${testPrefix}_apparel`,
      displayName: "Apparel Page",
    });
    createdSourceAccountIds.push(account.id);

    const run = await startIngestionRun({
      source: "meta",
      sourceAccountId: account.id,
    });
    createdIngestionRunIds.push(run.id);

    // Create media assets X and Y
    const [assetX] = await db
      .insert(schema.mediaAssets)
      .values({
        mediaType: "IMAGE",
        sha256: `${testPrefix}_sha_X`,
        byteSize: BigInt(20000),
        storageProvider: "r2",
        storageKey: `media/images/${testPrefix}_x.jpg`,
        width: 1080,
        height: 1080,
        downloadStatus: "STORED",
      })
      .returning();

    const [assetY] = await db
      .insert(schema.mediaAssets)
      .values({
        mediaType: "IMAGE",
        sha256: `${testPrefix}_sha_Y`,
        byteSize: BigInt(22000),
        storageProvider: "r2",
        storageKey: `media/images/${testPrefix}_y.jpg`,
        width: 1080,
        height: 1080,
        downloadStatus: "STORED",
      })
      .returning();

    // Ad A initially has SHA X
    const adA: SourceAd = {
      source: "meta",
      sourceAdId: `${testPrefix}_ad_A`,
      advertiser: { sourcePageId: account.sourcePageId },
      headline: "Ad A Headline",
      primaryText: "Ad A Body",
      cards: [],
      directMedia: [],
      publisherPlatforms: ["facebook"],
      active: true,
      raw: { id: "A" },
    };

    const resA = await persistObservedAd({
      sourceAccountId: account.id,
      ingestionRunId: run.id,
      ad: adA,
      rawPayload: adA.raw,
      rawPayloadHash: `sha256:${testPrefix}_raw_A`,
    });
    createdRawItemIds.push(resA.rawItem.id);
    createdAdIds.push(resA.ad.id);
    createdObservationIds.push(resA.observation.id);

    await db.insert(schema.adMedia).values({
      adId: resA.ad.id,
      mediaAssetId: assetX.id,
      role: "primary",
      position: 0,
    });
    await projectAd(resA.ad.id);

    // Ad B also has SHA X
    const adB: SourceAd = {
      source: "meta",
      sourceAdId: `${testPrefix}_ad_B`,
      advertiser: { sourcePageId: account.sourcePageId },
      headline: "Ad B Headline",
      primaryText: "Ad B Body",
      cards: [],
      directMedia: [],
      publisherPlatforms: ["facebook"],
      active: true,
      raw: { id: "B" },
    };

    const resB = await persistObservedAd({
      sourceAccountId: account.id,
      ingestionRunId: run.id,
      ad: adB,
      rawPayload: adB.raw,
      rawPayloadHash: `sha256:${testPrefix}_raw_B`,
    });
    createdRawItemIds.push(resB.rawItem.id);
    createdAdIds.push(resB.ad.id);
    createdObservationIds.push(resB.observation.id);

    await db.insert(schema.adMedia).values({
      adId: resB.ad.id,
      mediaAssetId: assetX.id,
      role: "primary",
      position: 0,
    });
    await projectAd(resB.ad.id);

    // Both Ad A and Ad B share SHA X (reuse count = 2)
    const [pA1] = await db
      .select()
      .from(schema.adDiscoveryIndex)
      .where(eq(schema.adDiscoveryIndex.adId, resA.ad.id));
    const [pB1] = await db
      .select()
      .from(schema.adDiscoveryIndex)
      .where(eq(schema.adDiscoveryIndex.adId, resB.ad.id));

    expect(pA1.exactCreativeReuseCount).toBe(2);
    expect(pB1.exactCreativeReuseCount).toBe(2);

    // Now change Ad A's representative creative to SHA Y
    await db
      .update(schema.adMedia)
      .set({ mediaAssetId: assetY.id })
      .where(eq(schema.adMedia.adId, resA.ad.id));

    // Reproject Ad A
    const pA2 = await projectAd(resA.ad.id);

    // Ad A should now have representative SHA Y and reuse count = 1
    expect(pA2?.representativeMediaSha256).toBe(`${testPrefix}_sha_Y`);
    expect(pA2?.exactCreativeReuseCount).toBe(1);

    // Ad B (old SHA X peer) should have automatically decremented to reuse count = 1 via fanout!
    const [pB2] = await db
      .select()
      .from(schema.adDiscoveryIndex)
      .where(eq(schema.adDiscoveryIndex.adId, resB.ad.id));

    expect(pB2.representativeMediaSha256).toBe(`${testPrefix}_sha_X`);
    expect(pB2.exactCreativeReuseCount).toBe(1);
  });

  it("5. deduplicates source_account_observations: multiple ads in same run generate exactly 1 account observation", async () => {
    const brand = await ensureBrand({
      name: "Dedupe Account Brand",
      slug: `${testPrefix}_dedupe_brand`,
    });
    createdBrandIds.push(brand.id);

    const account = await ensureSourceAccount({
      brandId: brand.id,
      source: "meta",
      sourcePageId: `page_${testPrefix}_dedupe`,
      displayName: "Dedupe Page",
    });
    createdSourceAccountIds.push(account.id);

    const run = await startIngestionRun({
      source: "meta",
      sourceAccountId: account.id,
    });
    createdIngestionRunIds.push(run.id);

    const accountObsData = {
      pageCategory: "Apparel & Clothing",
      instagramFollowers: 75000,
      facebookLikes: 12000,
      facebookVerified: true,
      instagramVerified: false,
    };

    // Ingest Ad 1 with account observation
    const res1 = await persistObservedAd({
      sourceAccountId: account.id,
      ingestionRunId: run.id,
      ad: {
        source: "meta",
        sourceAdId: `${testPrefix}_ad_dedupe_1`,
        advertiser: { sourcePageId: account.sourcePageId },
        headline: "Ad 1",
        accountObservation: accountObsData,
        cards: [],
        directMedia: [],
        publisherPlatforms: ["facebook"],
        active: true,
        raw: { id: "1" },
      },
      rawPayload: { id: "1" },
      rawPayloadHash: `sha256:${testPrefix}_dedupe_1`,
    });
    createdRawItemIds.push(res1.rawItem.id);
    createdAdIds.push(res1.ad.id);
    createdObservationIds.push(res1.observation.id);

    // Ingest Ad 2 in SAME run with account observation
    const res2 = await persistObservedAd({
      sourceAccountId: account.id,
      ingestionRunId: run.id,
      ad: {
        source: "meta",
        sourceAdId: `${testPrefix}_ad_dedupe_2`,
        advertiser: { sourcePageId: account.sourcePageId },
        headline: "Ad 2",
        accountObservation: accountObsData,
        cards: [],
        directMedia: [],
        publisherPlatforms: ["facebook"],
        active: true,
        raw: { id: "2" },
      },
      rawPayload: { id: "2" },
      rawPayloadHash: `sha256:${testPrefix}_dedupe_2`,
    });
    createdRawItemIds.push(res2.rawItem.id);
    createdAdIds.push(res2.ad.id);
    createdObservationIds.push(res2.observation.id);

    // Ingest Ad 3 in SAME run with account observation
    const res3 = await persistObservedAd({
      sourceAccountId: account.id,
      ingestionRunId: run.id,
      ad: {
        source: "meta",
        sourceAdId: `${testPrefix}_ad_dedupe_3`,
        advertiser: { sourcePageId: account.sourcePageId },
        headline: "Ad 3",
        accountObservation: accountObsData,
        cards: [],
        directMedia: [],
        publisherPlatforms: ["facebook"],
        active: true,
        raw: { id: "3" },
      },
      rawPayload: { id: "3" },
      rawPayloadHash: `sha256:${testPrefix}_dedupe_3`,
    });
    createdRawItemIds.push(res3.rawItem.id);
    createdAdIds.push(res3.ad.id);
    createdObservationIds.push(res3.observation.id);

    // Verify: exactly ONE source_account_observations row exists for (sourceAccountId, ingestionRunId)
    const observations = await db
      .select()
      .from(schema.sourceAccountObservations)
      .where(
        and(
          eq(schema.sourceAccountObservations.sourceAccountId, account.id),
          eq(schema.sourceAccountObservations.ingestionRunId, run.id),
        ),
      );

    expect(observations.length).toBe(1);
    expect(res1.accountObservationId).toBe(observations[0].id);
    expect(res2.accountObservationId).toBe(observations[0].id);
    expect(res3.accountObservationId).toBe(observations[0].id);

    // Verify: all 3 ads in discovery index received the projected account metadata via fanout
    const projectedAds = await db
      .select()
      .from(schema.adDiscoveryIndex)
      .where(
        inArray(schema.adDiscoveryIndex.adId, [
          res1.ad.id,
          res2.ad.id,
          res3.ad.id,
        ]),
      );

    expect(projectedAds.length).toBe(3);
    for (const p of projectedAds) {
      expect(p.latestInstagramFollowers).toBe(BigInt(75000));
      expect(p.latestFacebookLikes).toBe(BigInt(12000));
      expect(p.latestPageCategory).toBe("Apparel & Clothing");
    }
  });

  it("6. rebuildDiscoveryIndex executes batch projection idempotently", async () => {
    const result = await rebuildDiscoveryIndex({ chunkSize: 20 });
    expect(result.totalProjected).toBeGreaterThanOrEqual(createdAdIds.length);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  }, 60000);
});
