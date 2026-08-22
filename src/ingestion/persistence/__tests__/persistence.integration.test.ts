import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { env } from "@/env/server";
import { verifyDatabaseTargetSafety } from "@/db/target-safety";
import type { SourceAd } from "@/ingestion/types";
import {
  AdSourceAccountConflictError,
  AdvertiserSourceAccountMismatchError,
  DuplicateAdObservationError,
  DuplicateCardPositionError,
  DuplicateMediaRelationshipError,
  ensureBrand,
  ensureSourceAccount,
  ensureStoredMediaAsset,
  finishIngestionRun,
  IngestionRunStateError,
  MediaAssetConflictError,
  persistObservedAd,
  reconcileAdCards,
  reconcileAdMedia,
  reconcileCardMedia,
  saveRawIngestionItem,
  SourceAccountOwnershipConflictError,
  startIngestionRun,
  type StoredMediaRef,
} from "../index";

describe("Database Integration: Step 4C1 - 4C4 Persistence Foundation", () => {
  const runId = Math.random().toString(36).substring(2, 9);
  const testPrefix = `test_4c4_${Date.now()}_${runId}`;

  function testSha(seed: string): string {
    return createHash("sha256").update(`${testPrefix}:${seed}`).digest("hex");
  }

  const createdBrandIds: string[] = [];
  const createdSourceAccountIds: string[] = [];
  const createdIngestionRunIds: string[] = [];
  const createdRawItemIds: string[] = [];
  const createdAdIds: string[] = [];
  const createdCardIds: string[] = [];
  const createdObservationIds: string[] = [];
  const createdMediaAssetIds: string[] = [];

  beforeAll(() => {
    // 1. Mandatory Safety Check: verify host and expected project ref before any writes
    const target = verifyDatabaseTargetSafety(
      env.DATABASE_URL,
      env.SUPABASE_PROJECT_REF,
    );
    expect(target.matchesExpected).toBe(true);
  });

  afterAll(async () => {
    // Cleanup in strict reverse dependency order using explicit IDs only
    // 00. ad_discovery_index
    if (createdAdIds.length > 0) {
      await db
        .delete(schema.adDiscoveryIndex)
        .where(inArray(schema.adDiscoveryIndex.adId, createdAdIds));
    }

    // 0a. ad_transparency_observations
    if (createdObservationIds.length > 0) {
      await db
        .delete(schema.adTransparencyObservations)
        .where(inArray(schema.adTransparencyObservations.adObservationId, createdObservationIds));
    }

    // 0b. source_account_observations
    if (createdSourceAccountIds.length > 0) {
      await db
        .delete(schema.sourceAccountObservations)
        .where(inArray(schema.sourceAccountObservations.sourceAccountId, createdSourceAccountIds));
    }

    // 1. ad_observations
    if (createdAdIds.length > 0) {
      await db
        .delete(schema.adObservations)
        .where(inArray(schema.adObservations.adId, createdAdIds));
    }
    if (createdObservationIds.length > 0) {
      await db
        .delete(schema.adObservations)
        .where(inArray(schema.adObservations.id, createdObservationIds));
    }

    // 2. card_media
    if (createdCardIds.length > 0) {
      await db
        .delete(schema.cardMedia)
        .where(inArray(schema.cardMedia.adCardId, createdCardIds));
    }

    // 3. ad_media
    if (createdAdIds.length > 0) {
      await db
        .delete(schema.adMedia)
        .where(inArray(schema.adMedia.adId, createdAdIds));
    }

    // 4. ad_cards
    if (createdAdIds.length > 0) {
      await db
        .delete(schema.adCards)
        .where(inArray(schema.adCards.adId, createdAdIds));
    }
    if (createdCardIds.length > 0) {
      await db
        .delete(schema.adCards)
        .where(inArray(schema.adCards.id, createdCardIds));
    }

    // 5. media_assets
    if (createdMediaAssetIds.length > 0) {
      await db
        .delete(schema.mediaAssets)
        .where(inArray(schema.mediaAssets.id, createdMediaAssetIds));
    }

    // 6. raw_ingestion_items
    if (createdRawItemIds.length > 0) {
      await db
        .delete(schema.rawIngestionItems)
        .where(inArray(schema.rawIngestionItems.id, createdRawItemIds));
    }

    // 7. ads
    if (createdAdIds.length > 0) {
      await db
        .delete(schema.ads)
        .where(inArray(schema.ads.id, createdAdIds));
    }

    // 8. ingestion_runs
    if (createdIngestionRunIds.length > 0) {
      await db
        .delete(schema.ingestionRuns)
        .where(inArray(schema.ingestionRuns.id, createdIngestionRunIds));
    }

    // 9. source_accounts
    if (createdSourceAccountIds.length > 0) {
      await db
        .delete(schema.sourceAccounts)
        .where(inArray(schema.sourceAccounts.id, createdSourceAccountIds));
    }

    // 10. brands
    if (createdBrandIds.length > 0) {
      await db
        .delete(schema.brands)
        .where(inArray(schema.brands.id, createdBrandIds));
    }

    // Verify cleanup: assert 0 test rows remaining
    const remainingObs = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.adObservations)
      .where(
        inArray(
          schema.adObservations.id,
          createdObservationIds.length
            ? createdObservationIds
            : ["00000000-0000-0000-0000-000000000000"],
        ),
      );

    const remainingCards = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.adCards)
      .where(
        inArray(
          schema.adCards.id,
          createdCardIds.length
            ? createdCardIds
            : ["00000000-0000-0000-0000-000000000000"],
        ),
      );

    const remainingMediaAssets = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.mediaAssets)
      .where(
        inArray(
          schema.mediaAssets.id,
          createdMediaAssetIds.length
            ? createdMediaAssetIds
            : ["00000000-0000-0000-0000-000000000000"],
        ),
      );

    const remainingAds = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.ads)
      .where(
        inArray(
          schema.ads.id,
          createdAdIds.length
            ? createdAdIds
            : ["00000000-0000-0000-0000-000000000000"],
        ),
      );

    const remainingBrands = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.brands)
      .where(
        inArray(
          schema.brands.id,
          createdBrandIds.length
            ? createdBrandIds
            : ["00000000-0000-0000-0000-000000000000"],
        ),
      );

    expect(remainingObs[0].count).toBe(0);
    expect(remainingCards[0].count).toBe(0);
    expect(remainingMediaAssets[0].count).toBe(0);
    expect(remainingAds[0].count).toBe(0);
    expect(remainingBrands[0].count).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Step 4C1 Foundation Tests
  // ---------------------------------------------------------------------------

  it("1. ensureBrand creates a new brand", async () => {
    const slug = `${testPrefix}_brand_a`;
    const brand = await ensureBrand({
      name: "Test Brand A",
      slug,
      websiteUrl: "https://brand-a.example.test",
      category: "D2C Skincare",
    });

    createdBrandIds.push(brand.id);
    expect(brand.id).toBeDefined();
    expect(brand.slug).toBe(slug);
    expect(brand.name).toBe("Test Brand A");
  });

  it("2. repeated ensureBrand with same slug returns same row without updating", async () => {
    const slug = `${testPrefix}_brand_a`;
    const brandRepeat = await ensureBrand({
      name: "Test Brand A (New Name Ignored)",
      slug,
      websiteUrl: "https://ignored.example.test",
    });

    expect(brandRepeat.id).toBe(createdBrandIds[0]);
    expect(brandRepeat.name).toBe("Test Brand A");
  });

  it("3. ensureSourceAccount creates linked account", async () => {
    const pageId = `page_${testPrefix}_01`;
    const sourceAccount = await ensureSourceAccount({
      brandId: createdBrandIds[0],
      source: "meta",
      sourcePageId: pageId,
      displayName: "Brand A Official",
    });

    createdSourceAccountIds.push(sourceAccount.id);
    expect(sourceAccount.id).toBeDefined();
    expect(sourceAccount.brandId).toBe(createdBrandIds[0]);
    expect(sourceAccount.sourcePageId).toBe(pageId);
    expect(sourceAccount.displayName).toBe("Brand A Official");
  });

  it("4. repeated ensureSourceAccount returns same account", async () => {
    const pageId = `page_${testPrefix}_01`;
    const sourceAccountRepeat = await ensureSourceAccount({
      brandId: createdBrandIds[0],
      source: "meta",
      sourcePageId: pageId,
      displayName: "Brand A New Name Ignored",
    });

    expect(sourceAccountRepeat.id).toBe(createdSourceAccountIds[0]);
    expect(sourceAccountRepeat.displayName).toBe("Brand A Official");
  });

  it("5. cross-brand source account conflict throws SourceAccountOwnershipConflictError", async () => {
    const brandB = await ensureBrand({
      name: "Test Brand B",
      slug: `${testPrefix}_brand_b`,
    });
    createdBrandIds.push(brandB.id);

    const pageId = `page_${testPrefix}_01`;

    await expect(
      ensureSourceAccount({
        brandId: brandB.id,
        source: "meta",
        sourcePageId: pageId,
      }),
    ).rejects.toThrow(SourceAccountOwnershipConflictError);
  });

  it("6. startIngestionRun creates RUNNING row", async () => {
    const run = await startIngestionRun({
      source: "meta",
      sourceAccountId: createdSourceAccountIds[0],
      metadata: { env: "test" },
    });

    createdIngestionRunIds.push(run.id);
    expect(run.id).toBeDefined();
    expect(run.status).toBe("RUNNING");
    expect(run.sourceAccountId).toBe(createdSourceAccountIds[0]);
    expect(run.startedAt).toBeDefined();
    expect(run.finishedAt).toBeNull();
  });

  it("7. saveRawIngestionItem creates append-only raw row", async () => {
    const raw = await saveRawIngestionItem({
      ingestionRunId: createdIngestionRunIds[0],
      sourceItemId: "item_001",
      payload: { title: "Raw Payload 1" },
      payloadHash: "sha256:test_hash_1",
    });

    createdRawItemIds.push(raw.id);
    expect(raw.id).toBeDefined();
    expect(raw.ingestionRunId).toBe(createdIngestionRunIds[0]);
    expect(raw.payloadHash).toBe("sha256:test_hash_1");
  });

  it("8. two identical raw payload hashes can coexist append-only within the run", async () => {
    const rawDuplicate = await saveRawIngestionItem({
      ingestionRunId: createdIngestionRunIds[0],
      sourceItemId: "item_002",
      payload: { title: "Raw Payload 1" },
      payloadHash: "sha256:test_hash_1",
    });

    createdRawItemIds.push(rawDuplicate.id);
    expect(rawDuplicate.id).toBeDefined();
    expect(rawDuplicate.id).not.toBe(createdRawItemIds[0]);
    expect(rawDuplicate.payloadHash).toBe("sha256:test_hash_1");
  });

  it("9. finishIngestionRun finalizes RUNNING row", async () => {
    const finished = await finishIngestionRun({
      ingestionRunId: createdIngestionRunIds[0],
      status: "SUCCEEDED",
      sourceItemsCount: 2,
      newAdsCount: 2,
      updatedAdsCount: 0,
      mediaDownloadedCount: 4,
      mediaDuplicateCount: 1,
      mediaFailedCount: 0,
      bytesDownloaded: BigInt(1048576),
      uniqueBytesStored: BigInt(524288),
    });

    expect(finished.status).toBe("SUCCEEDED");
    expect(finished.finishedAt).toBeDefined();
    expect(finished.sourceItemsCount).toBe(2);
    expect(finished.bytesDownloaded).toBe(BigInt(1048576));
  });

  it("10. second finalization attempt throws IngestionRunStateError", async () => {
    await expect(
      finishIngestionRun({
        ingestionRunId: createdIngestionRunIds[0],
        status: "FAILED",
        sourceItemsCount: 0,
        newAdsCount: 0,
        updatedAdsCount: 0,
        mediaDownloadedCount: 0,
        mediaDuplicateCount: 0,
        mediaFailedCount: 0,
        bytesDownloaded: BigInt(0),
        uniqueBytesStored: BigInt(0),
      }),
    ).rejects.toThrow(IngestionRunStateError);
  });

  // ---------------------------------------------------------------------------
  // Step 4C2 Ad & Observation Persistence Tests
  // ---------------------------------------------------------------------------

  let adTestRun1Id: string;
  let firstObservedAdId: string;
  let firstSeenAtTimestamp: Date;

  const testSourceAdId = `archive_${testPrefix}_999`;
  const pageId1 = `page_${testPrefix}_01`;

  it("11. persistObservedAd for new SourceAd persists raw item, ad (created), and observation", async () => {
    const run = await startIngestionRun({
      source: "meta",
      sourceAccountId: createdSourceAccountIds[0],
      metadata: { env: "test_ad_run_1" },
    });
    createdIngestionRunIds.push(run.id);
    adTestRun1Id = run.id;

    const sourceAd: SourceAd = {
      source: "meta",
      sourceAdId: testSourceAdId,
      sourceCollationId: "collation_100",
      sourceCollationCount: 2,
      advertiser: {
        sourcePageId: pageId1,
        name: "Brand A Official",
      },
      publisher: {
        sourcePageId: `creator_${testPrefix}_222`,
        name: "Creator Influencer",
        url: "https://facebook.com/creator",
      },
      brandedContent: {
        sourcePageId: `sponsor_${testPrefix}_333`,
        name: "Co-Sponsor",
      },
      displayFormat: "video",
      primaryText: "First primary text",
      headline: "Original Headline",
      description: "Original Description",
      ctaText: "Shop Now",
      ctaType: "SHOP_NOW",
      destinationUrl: "https://example.com/item1",
      publisherPlatforms: ["facebook", "instagram"],
      platformStartAt: new Date("2026-01-01T00:00:00Z"),
      sourceReportedEndAt: new Date("2026-01-15T00:00:00Z"),
      active: true,
      adLibraryUrl: `https://facebook.com/ads/library/?id=${testSourceAdId}`,
      cards: [],
      directMedia: [],
      raw: { original_item: "raw_data_v1" },
    };

    const result = await persistObservedAd({
      sourceAccountId: createdSourceAccountIds[0],
      ingestionRunId: run.id,
      ad: sourceAd,
      rawPayload: sourceAd.raw,
      rawPayloadHash: "sha256:raw_hash_ad_v1",
      snapshotHash: "sha256:snapshot_hash_v1",
      observationMetadata: { crawlQuality: "high" },
    });

    createdRawItemIds.push(result.rawItem.id);
    createdAdIds.push(result.ad.id);
    createdObservationIds.push(result.observation.id);

    firstObservedAdId = result.ad.id;
    firstSeenAtTimestamp = result.ad.firstSeenAt;

    expect(result.adOutcome).toBe("created");
    expect(result.ad.source).toBe("meta");
    expect(result.ad.sourceAdId).toBe(testSourceAdId);
    expect(result.ad.sourceAccountId).toBe(createdSourceAccountIds[0]);
    expect(result.ad.headline).toBe("Original Headline");
    expect(result.ad.publisherPageId).toBe(`creator_${testPrefix}_222`);
    expect(result.ad.brandedContentPageId).toBe(`sponsor_${testPrefix}_333`);
    expect(result.ad.isActiveObserved).toBe(true);
    expect(result.ad.firstSeenAt).toBeDefined();
    expect(result.ad.lastSeenAt).toBeDefined();

    expect(result.observation.adId).toBe(result.ad.id);
    expect(result.observation.ingestionRunId).toBe(run.id);
    expect(result.observation.observedActive).toBe(true);
    expect(result.observation.snapshotHash).toBe("sha256:snapshot_hash_v1");
  });

  it("12. second ingestion run for same external ad reuses row (updated), preserves first_seen_at, updates mutable fields", async () => {
    const run2 = await startIngestionRun({
      source: "meta",
      sourceAccountId: createdSourceAccountIds[0],
      metadata: { env: "test_ad_run_2" },
    });
    createdIngestionRunIds.push(run2.id);

    const updatedSourceAd: SourceAd = {
      source: "meta",
      sourceAdId: testSourceAdId,
      sourceCollationId: "collation_100",
      sourceCollationCount: 5,
      advertiser: {
        sourcePageId: pageId1,
        name: "Brand A Official",
      },
      publisher: {
        sourcePageId: `creator_${testPrefix}_222`,
        name: "Creator Influencer",
      },
      displayFormat: "video",
      primaryText: "Updated primary text copy",
      headline: "Updated Headline",
      description: "Updated Description",
      ctaText: "Learn More",
      ctaType: "LEARN_MORE",
      destinationUrl: "https://example.com/item1_updated",
      publisherPlatforms: ["facebook", "instagram", "threads"],
      platformStartAt: new Date("2026-01-01T00:00:00Z"),
      sourceReportedEndAt: new Date("2026-01-20T00:00:00Z"),
      active: true,
      adLibraryUrl: `https://facebook.com/ads/library/?id=${testSourceAdId}`,
      cards: [],
      directMedia: [],
      raw: { original_item: "raw_data_v2" },
    };

    const result = await persistObservedAd({
      sourceAccountId: createdSourceAccountIds[0],
      ingestionRunId: run2.id,
      ad: updatedSourceAd,
      rawPayload: updatedSourceAd.raw,
      rawPayloadHash: "sha256:raw_hash_ad_v2",
      snapshotHash: "sha256:snapshot_hash_v2",
    });

    createdRawItemIds.push(result.rawItem.id);
    createdObservationIds.push(result.observation.id);

    expect(result.adOutcome).toBe("updated");
    expect(result.ad.id).toBe(firstObservedAdId);

    // Invariant: first_seen_at must NEVER change
    expect(new Date(result.ad.firstSeenAt).getTime()).toBe(
      new Date(firstSeenAtTimestamp).getTime(),
    );

    // Invariant: last_seen_at is updated
    expect(new Date(result.ad.lastSeenAt).getTime()).toBeGreaterThanOrEqual(
      new Date(firstSeenAtTimestamp).getTime(),
    );

    // Mutable snapshot updates
    expect(result.ad.headline).toBe("Updated Headline");
    expect(result.ad.ctaText).toBe("Learn More");
    expect(result.ad.sourceCollationCount).toBe(5);
    expect(result.ad.rawLastPayload).toEqual({
      original_item: "raw_data_v2",
    });

    // Distinct observation for run 2
    expect(result.observation.ingestionRunId).toBe(run2.id);
    expect(result.observation.adId).toBe(firstObservedAdId);
  });

  it("13. SourceAd.advertiser mismatch with source account throws and rolls back atomic transaction", async () => {
    const mismatchAd: SourceAd = {
      source: "meta",
      sourceAdId: `archive_${testPrefix}_mismatch`,
      advertiser: {
        sourcePageId: "wrong_page_999",
      },
      publisherPlatforms: [],
      cards: [],
      directMedia: [],
      raw: { mismatch: true },
    };

    const rawHash = "sha256:mismatch_test_raw_hash";

    await expect(
      persistObservedAd({
        sourceAccountId: createdSourceAccountIds[0],
        ingestionRunId: adTestRun1Id,
        ad: mismatchAd,
        rawPayload: mismatchAd.raw,
        rawPayloadHash: rawHash,
      }),
    ).rejects.toThrow(AdvertiserSourceAccountMismatchError);

    // Verify transaction rollback: no raw item was persisted
    const rawCheck = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.rawIngestionItems)
      .where(eq(schema.rawIngestionItems.payloadHash, rawHash));
    expect(rawCheck[0].count).toBe(0);

    // Verify no ad was persisted
    const adCheck = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.ads)
      .where(
        and(
          eq(schema.ads.source, "meta"),
          eq(schema.ads.sourceAdId, `archive_${testPrefix}_mismatch`),
        ),
      );
    expect(adCheck[0].count).toBe(0);
  });

  it("14. attempting to reparent existing ad to different source_account_id throws AdSourceAccountConflictError", async () => {
    const pageId2 = `page_${testPrefix}_02`;
    const sourceAccount2 = await ensureSourceAccount({
      brandId: createdBrandIds[0],
      source: "meta",
      sourcePageId: pageId2,
      displayName: "Brand A Alternate Page",
    });
    createdSourceAccountIds.push(sourceAccount2.id);

    const conflictingAd: SourceAd = {
      source: "meta",
      sourceAdId: testSourceAdId,
      advertiser: {
        sourcePageId: pageId2,
      },
      publisherPlatforms: [],
      cards: [],
      directMedia: [],
      raw: { attempt: "reparent" },
    };

    await expect(
      persistObservedAd({
        sourceAccountId: sourceAccount2.id,
        ingestionRunId: adTestRun1Id,
        ad: conflictingAd,
        rawPayload: conflictingAd.raw,
        rawPayloadHash: "sha256:reparent_raw_hash",
      }),
    ).rejects.toThrow(AdSourceAccountConflictError);
  });

  it("15. duplicate observation within same ingestion run throws DuplicateAdObservationError and rolls back", async () => {
    const duplicateObservationAd: SourceAd = {
      source: "meta",
      sourceAdId: testSourceAdId,
      advertiser: {
        sourcePageId: pageId1,
      },
      publisherPlatforms: [],
      cards: [],
      directMedia: [],
      raw: { duplicate: "attempt" },
    };

    const duplicateRawHash = "sha256:duplicate_attempt_raw_hash";

    await expect(
      persistObservedAd({
        sourceAccountId: createdSourceAccountIds[0],
        ingestionRunId: adTestRun1Id,
        ad: duplicateObservationAd,
        rawPayload: duplicateObservationAd.raw,
        rawPayloadHash: duplicateRawHash,
      }),
    ).rejects.toThrow(DuplicateAdObservationError);

    // Verify rollback: raw item for the duplicate attempt was not persisted
    const rawCheck = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.rawIngestionItems)
      .where(eq(schema.rawIngestionItems.payloadHash, duplicateRawHash));
    expect(rawCheck[0].count).toBe(0);
  });

  it("16. null active state persists as null in both ad and observation", async () => {
    const nullActiveAdId = `archive_${testPrefix}_null_active`;
    const nullActiveSourceAd: SourceAd = {
      source: "meta",
      sourceAdId: nullActiveAdId,
      advertiser: {
        sourcePageId: pageId1,
      },
      active: null,
      publisherPlatforms: [],
      cards: [],
      directMedia: [],
      raw: { active: null },
    };

    const run3 = await startIngestionRun({
      source: "meta",
      sourceAccountId: createdSourceAccountIds[0],
      metadata: { env: "test_ad_run_3" },
    });
    createdIngestionRunIds.push(run3.id);

    const result = await persistObservedAd({
      sourceAccountId: createdSourceAccountIds[0],
      ingestionRunId: run3.id,
      ad: nullActiveSourceAd,
      rawPayload: nullActiveSourceAd.raw,
      rawPayloadHash: "sha256:null_active_raw_hash",
    });

    createdRawItemIds.push(result.rawItem.id);
    createdAdIds.push(result.ad.id);
    createdObservationIds.push(result.observation.id);

    expect(result.ad.isActiveObserved).toBeNull();
    expect(result.observation.observedActive).toBeNull();
  });

  it("17. verifies zero card rows for non-card ads", async () => {
    const cards = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.adCards)
      .where(inArray(schema.adCards.adId, [firstObservedAdId]));

    expect(cards[0].count).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Step 4C3 Card Persistence & Reconciliation Tests
  // ---------------------------------------------------------------------------

  const dcoAdId = `archive_${testPrefix}_dco_carousel`;
  let dcoDbAdId: string;
  let dcoRun1Id: string;

  it("18. new DCO ad with 3 cards persists cards at positions 0, 1, 2", async () => {
    const run = await startIngestionRun({
      source: "meta",
      sourceAccountId: createdSourceAccountIds[0],
      metadata: { env: "test_cards_run_1" },
    });
    createdIngestionRunIds.push(run.id);
    dcoRun1Id = run.id;

    const dcoAd: SourceAd = {
      source: "meta",
      sourceAdId: dcoAdId,
      advertiser: {
        sourcePageId: pageId1,
      },
      displayFormat: "carousel",
      publisherPlatforms: ["facebook", "instagram"],
      active: true,
      cards: [
        {
          position: 0,
          title: "Card 0 Title",
          body: "Card 0 Body",
          description: "Card 0 Description",
          ctaText: "Shop Now",
          ctaType: "SHOP_NOW",
          destinationUrl: "https://example.com/item0",
          media: [{ type: "image", sourceUrl: "https://img.test/0.jpg" }],
          raw: { card_num: 0 },
        },
        {
          position: 1,
          title: "Card 1 Title",
          body: "Card 1 Body",
          description: "Card 1 Description",
          ctaText: "Order Now",
          ctaType: "ORDER_NOW",
          destinationUrl: "https://example.com/item1",
          media: [{ type: "image", sourceUrl: "https://img.test/1.jpg" }],
          raw: { card_num: 1 },
        },
        {
          position: 2,
          title: "Card 2 Title",
          body: "Card 2 Body",
          description: "Card 2 Description",
          ctaText: "Learn More",
          ctaType: "LEARN_MORE",
          destinationUrl: "https://example.com/item2",
          media: [{ type: "image", sourceUrl: "https://img.test/2.jpg" }],
          raw: { card_num: 2 },
        },
      ],
      directMedia: [],
      raw: { type: "dco_parent" },
    };

    const result = await persistObservedAd({
      sourceAccountId: createdSourceAccountIds[0],
      ingestionRunId: run.id,
      ad: dcoAd,
      rawPayload: dcoAd.raw,
      rawPayloadHash: "sha256:dco_cards_raw_1",
    });

    createdRawItemIds.push(result.rawItem.id);
    createdAdIds.push(result.ad.id);
    createdObservationIds.push(result.observation.id);
    dcoDbAdId = result.ad.id;

    for (const card of result.cards) {
      createdCardIds.push(card.id);
    }

    expect(result.adOutcome).toBe("created");
    expect(result.cards).toHaveLength(3);

    // Verify in database
    const dbCards = await db
      .select()
      .from(schema.adCards)
      .where(eq(schema.adCards.adId, dcoDbAdId));

    expect(dbCards).toHaveLength(3);
    const sorted = dbCards.sort((a, b) => a.position - b.position);

    expect(sorted[0].position).toBe(0);
    expect(sorted[0].title).toBe("Card 0 Title");
    expect(sorted[0].destinationUrl).toBe("https://example.com/item0");
    expect(sorted[0].rawPayload).toEqual({ card_num: 0 });

    expect(sorted[1].position).toBe(1);
    expect(sorted[1].title).toBe("Card 1 Title");

    expect(sorted[2].position).toBe(2);
    expect(sorted[2].title).toBe("Card 2 Title");
  });

  it("19. reobserving same ad in new run with changed copy updates mutable fields and replaces nulls", async () => {
    const run2 = await startIngestionRun({
      source: "meta",
      sourceAccountId: createdSourceAccountIds[0],
      metadata: { env: "test_cards_run_2" },
    });
    createdIngestionRunIds.push(run2.id);

    const updatedDcoAd: SourceAd = {
      source: "meta",
      sourceAdId: dcoAdId,
      advertiser: {
        sourcePageId: pageId1,
      },
      displayFormat: "carousel",
      publisherPlatforms: ["facebook", "instagram"],
      active: true,
      cards: [
        {
          position: 0,
          title: "Card 0 Updated Title",
          body: "Card 0 Updated Body",
          description: null, // Replaces previous non-null description with null
          ctaText: "Shop Today",
          destinationUrl: "https://example.com/item0_updated",
          media: [],
          raw: { card_num: 0, updated: true },
        },
        {
          position: 1,
          title: "Card 1 Updated Title",
          body: "Card 1 Body",
          description: "Card 1 Description",
          ctaText: "Buy Now",
          destinationUrl: "https://example.com/item1",
          media: [],
          raw: { card_num: 1 },
        },
        {
          position: 2,
          title: "Card 2 Updated Title",
          body: "Card 2 Updated Body",
          description: "Card 2 Description",
          ctaText: "Sign Up",
          destinationUrl: "https://example.com/item2",
          media: [],
          raw: { card_num: 2 },
        },
      ],
      directMedia: [],
      raw: { type: "dco_parent_v2" },
    };

    const result = await persistObservedAd({
      sourceAccountId: createdSourceAccountIds[0],
      ingestionRunId: run2.id,
      ad: updatedDcoAd,
      rawPayload: updatedDcoAd.raw,
      rawPayloadHash: "sha256:dco_cards_raw_2",
    });

    createdRawItemIds.push(result.rawItem.id);
    createdObservationIds.push(result.observation.id);

    expect(result.adOutcome).toBe("updated");
    expect(result.cards).toHaveLength(3);

    const card0 = result.cards.find((c) => c.position === 0);
    expect(card0?.title).toBe("Card 0 Updated Title");
    expect(card0?.description).toBeNull(); // Invariant: null overwrote old string
    expect(card0?.ctaText).toBe("Shop Today");
    expect(card0?.destinationUrl).toBe("https://example.com/item0_updated");
    expect(card0?.rawPayload).toEqual({ card_num: 0, updated: true });
  });

  it("20. reobserving 3 cards -> 2 cards deletes stale position 2", async () => {
    const run3 = await startIngestionRun({
      source: "meta",
      sourceAccountId: createdSourceAccountIds[0],
      metadata: { env: "test_cards_run_3" },
    });
    createdIngestionRunIds.push(run3.id);

    const twoCardsAd: SourceAd = {
      source: "meta",
      sourceAdId: dcoAdId,
      advertiser: {
        sourcePageId: pageId1,
      },
      cards: [
        {
          position: 0,
          title: "Card 0 Kept",
          media: [],
          raw: {},
        },
        {
          position: 1,
          title: "Card 1 Kept",
          media: [],
          raw: {},
        },
      ],
      publisherPlatforms: [],
      directMedia: [],
      raw: {},
    };

    const result = await persistObservedAd({
      sourceAccountId: createdSourceAccountIds[0],
      ingestionRunId: run3.id,
      ad: twoCardsAd,
      rawPayload: twoCardsAd.raw,
      rawPayloadHash: "sha256:dco_cards_raw_3",
    });

    createdRawItemIds.push(result.rawItem.id);
    createdObservationIds.push(result.observation.id);

    expect(result.cards).toHaveLength(2);

    const dbCards = await db
      .select()
      .from(schema.adCards)
      .where(eq(schema.adCards.adId, dcoDbAdId));

    expect(dbCards).toHaveLength(2);
    const positions = dbCards.map((c) => c.position).sort();
    expect(positions).toEqual([0, 1]); // Stale position 2 is deleted
  });

  it("21. reobserving 2 cards -> 0 cards deletes all card rows for that ad", async () => {
    const run4 = await startIngestionRun({
      source: "meta",
      sourceAccountId: createdSourceAccountIds[0],
      metadata: { env: "test_cards_run_4" },
    });
    createdIngestionRunIds.push(run4.id);

    const zeroCardsAd: SourceAd = {
      source: "meta",
      sourceAdId: dcoAdId,
      advertiser: {
        sourcePageId: pageId1,
      },
      cards: [], // Empty snapshot
      publisherPlatforms: [],
      directMedia: [],
      raw: {},
    };

    const result = await persistObservedAd({
      sourceAccountId: createdSourceAccountIds[0],
      ingestionRunId: run4.id,
      ad: zeroCardsAd,
      rawPayload: zeroCardsAd.raw,
      rawPayloadHash: "sha256:dco_cards_raw_4",
    });

    createdRawItemIds.push(result.rawItem.id);
    createdObservationIds.push(result.observation.id);

    expect(result.cards).toHaveLength(0);

    const dbCards = await db
      .select()
      .from(schema.adCards)
      .where(eq(schema.adCards.adId, dcoDbAdId));

    expect(dbCards).toHaveLength(0);
  });

  it("22. reobserving 0 -> multiple cards creates new cards correctly", async () => {
    const run5 = await startIngestionRun({
      source: "meta",
      sourceAccountId: createdSourceAccountIds[0],
      metadata: { env: "test_cards_run_5" },
    });
    createdIngestionRunIds.push(run5.id);

    const repopulatedCardsAd: SourceAd = {
      source: "meta",
      sourceAdId: dcoAdId,
      advertiser: {
        sourcePageId: pageId1,
      },
      cards: [
        {
          position: 0,
          title: "New Card 0",
          media: [],
          raw: { num: 0 },
        },
        {
          position: 1,
          title: "New Card 1",
          media: [],
          raw: { num: 1 },
        },
      ],
      publisherPlatforms: [],
      directMedia: [],
      raw: {},
    };

    const result = await persistObservedAd({
      sourceAccountId: createdSourceAccountIds[0],
      ingestionRunId: run5.id,
      ad: repopulatedCardsAd,
      rawPayload: repopulatedCardsAd.raw,
      rawPayloadHash: "sha256:dco_cards_raw_5",
    });

    createdRawItemIds.push(result.rawItem.id);
    createdObservationIds.push(result.observation.id);
    for (const c of result.cards) {
      createdCardIds.push(c.id);
    }

    expect(result.cards).toHaveLength(2);

    const dbCards = await db
      .select()
      .from(schema.adCards)
      .where(eq(schema.adCards.adId, dcoDbAdId));

    expect(dbCards).toHaveLength(2);
  });

  it("23. card reordering performs position-based snapshot replacement", async () => {
    const run6 = await startIngestionRun({
      source: "meta",
      sourceAccountId: createdSourceAccountIds[0],
      metadata: { env: "test_cards_run_6" },
    });
    createdIngestionRunIds.push(run6.id);

    // Swap content: position 0 has B's content, position 1 has A's content
    const reorderedAd: SourceAd = {
      source: "meta",
      sourceAdId: dcoAdId,
      advertiser: {
        sourcePageId: pageId1,
      },
      cards: [
        {
          position: 0,
          title: "Swapped Card 1 Content at 0",
          media: [],
          raw: { original: 1 },
        },
        {
          position: 1,
          title: "Swapped Card 0 Content at 1",
          media: [],
          raw: { original: 0 },
        },
      ],
      publisherPlatforms: [],
      directMedia: [],
      raw: {},
    };

    const result = await persistObservedAd({
      sourceAccountId: createdSourceAccountIds[0],
      ingestionRunId: run6.id,
      ad: reorderedAd,
      rawPayload: reorderedAd.raw,
      rawPayloadHash: "sha256:dco_cards_raw_6",
    });

    createdRawItemIds.push(result.rawItem.id);
    createdObservationIds.push(result.observation.id);

    const card0 = result.cards.find((c) => c.position === 0);
    const card1 = result.cards.find((c) => c.position === 1);

    expect(card0?.title).toBe("Swapped Card 1 Content at 0");
    expect(card1?.title).toBe("Swapped Card 0 Content at 1");
  });

  it("24. duplicate incoming positions throws DuplicateCardPositionError and rolls back atomic transaction", async () => {
    const run7 = await startIngestionRun({
      source: "meta",
      sourceAccountId: createdSourceAccountIds[0],
      metadata: { env: "test_cards_run_7" },
    });
    createdIngestionRunIds.push(run7.id);

    const duplicatePositionsAd: SourceAd = {
      source: "meta",
      sourceAdId: `archive_${testPrefix}_dup_pos`,
      advertiser: {
        sourcePageId: pageId1,
      },
      cards: [
        {
          position: 0,
          title: "First Card at 0",
          media: [],
          raw: {},
        },
        {
          position: 0, // Duplicate position 0
          title: "Second Card also at 0",
          media: [],
          raw: {},
        },
      ],
      publisherPlatforms: [],
      directMedia: [],
      raw: { fail: true },
    };

    const failRawHash = "sha256:duplicate_pos_fail_raw";

    await expect(
      persistObservedAd({
        sourceAccountId: createdSourceAccountIds[0],
        ingestionRunId: run7.id,
        ad: duplicatePositionsAd,
        rawPayload: duplicatePositionsAd.raw,
        rawPayloadHash: failRawHash,
      }),
    ).rejects.toThrow(DuplicateCardPositionError);

    // Verify rollback: raw item was not persisted
    const rawCheck = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.rawIngestionItems)
      .where(eq(schema.rawIngestionItems.payloadHash, failRawHash));
    expect(rawCheck[0].count).toBe(0);

    // Verify no ad was created
    const adCheck = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.ads)
      .where(
        and(
          eq(schema.ads.source, "meta"),
          eq(schema.ads.sourceAdId, `archive_${testPrefix}_dup_pos`),
        ),
      );
    expect(adCheck[0].count).toBe(0);
  });

  it("25. duplicate observation in same run rolls back card mutations and preserves previous card state", async () => {
    // Current state of dcoDbAdId has 2 cards from Test 23
    const duplicateAttemptAd: SourceAd = {
      source: "meta",
      sourceAdId: dcoAdId,
      advertiser: {
        sourcePageId: pageId1,
      },
      cards: [
        {
          position: 0,
          title: "THIS TITLE SHOULD ROLL BACK",
          media: [],
          raw: {},
        },
        {
          position: 1,
          title: "THIS SHOULD ALSO ROLL BACK",
          media: [],
          raw: {},
        },
        {
          position: 2,
          title: "THIS NEW CARD 2 SHOULD NOT EXIST",
          media: [],
          raw: {},
        },
      ],
      publisherPlatforms: [],
      directMedia: [],
      raw: { duplicate: "attempt_with_cards" },
    };

    const duplicateRawHash = "sha256:duplicate_cards_attempt_raw";

    // Ad dcoDbAdId was already observed in run 1 (Test 18)
    await expect(
      persistObservedAd({
        sourceAccountId: createdSourceAccountIds[0],
        ingestionRunId: dcoRun1Id,
        ad: duplicateAttemptAd,
        rawPayload: duplicateAttemptAd.raw,
        rawPayloadHash: duplicateRawHash,
      }),
    ).rejects.toThrow(DuplicateAdObservationError);

    // Verify card changes rolled back: position 0 title is still the one from Test 23
    const dbCards = await db
      .select()
      .from(schema.adCards)
      .where(eq(schema.adCards.adId, dcoDbAdId));

    expect(dbCards).toHaveLength(2);
    const card0 = dbCards.find((c) => c.position === 0);
    expect(card0?.title).toBe("Swapped Card 1 Content at 0"); // Preserved!
  });

  it("26. card reconciliation for one ad does not affect cards of another ad", async () => {
    // Create Ad Y with 2 cards
    const adYSourceId = `archive_${testPrefix}_ad_y`;
    const runY = await startIngestionRun({
      source: "meta",
      sourceAccountId: createdSourceAccountIds[0],
      metadata: { env: "test_cards_run_y" },
    });
    createdIngestionRunIds.push(runY.id);

    const adY: SourceAd = {
      source: "meta",
      sourceAdId: adYSourceId,
      advertiser: {
        sourcePageId: pageId1,
      },
      cards: [
        { position: 0, title: "Ad Y Card 0", media: [], raw: {} },
        { position: 1, title: "Ad Y Card 1", media: [], raw: {} },
      ],
      publisherPlatforms: [],
      directMedia: [],
      raw: {},
    };

    const resultY = await persistObservedAd({
      sourceAccountId: createdSourceAccountIds[0],
      ingestionRunId: runY.id,
      ad: adY,
      rawPayload: adY.raw,
      rawPayloadHash: "sha256:ad_y_raw_hash",
    });

    createdRawItemIds.push(resultY.rawItem.id);
    createdAdIds.push(resultY.ad.id);
    createdObservationIds.push(resultY.observation.id);
    for (const c of resultY.cards) {
      createdCardIds.push(c.id);
    }

    // Now clear cards on dcoDbAdId using reconcileAdCards directly
    await reconcileAdCards({
      adId: dcoDbAdId,
      cards: [],
    });

    // Verify dcoDbAdId has 0 cards
    const dcoCards = await db
      .select()
      .from(schema.adCards)
      .where(eq(schema.adCards.adId, dcoDbAdId));
    expect(dcoCards).toHaveLength(0);

    // Verify Ad Y still has 2 cards untouched
    const adYCards = await db
      .select()
      .from(schema.adCards)
      .where(eq(schema.adCards.adId, resultY.ad.id));
    expect(adYCards).toHaveLength(2);
    expect(adYCards[0].title).toBe("Ad Y Card 0");
  });

  // ---------------------------------------------------------------------------
  // Step 4C4 Stored Media Persistence & Reconciliation Tests
  // ---------------------------------------------------------------------------

  const shaImg1 = testSha("img1");
  const shaVideo1 = testSha("video1");
  const shaPreview1 = testSha("preview1");
  const shaShared = testSha("shared");

  let createdAssetImg1Id: string;

  it("27. new stored media asset creates row with status STORED and lowercase SHA", async () => {
    const asset = await ensureStoredMediaAsset({
      mediaType: "IMAGE",
      sourceUrl: "https://meta.cdn/orig_image_1.jpg",
      sha256: shaImg1.toUpperCase(), // Uppercase input
      mimeType: "image/jpeg",
      byteSize: BigInt(204800),
      storageProvider: "r2",
      storageKey: "media/images/a1a1.jpg",
    });

    createdMediaAssetIds.push(asset.id);
    createdAssetImg1Id = asset.id;

    expect(asset.id).toBeDefined();
    expect(asset.sha256).toBe(shaImg1); // Canonicalized to lowercase
    expect(asset.downloadStatus).toBe("STORED");
    expect(asset.downloadError).toBeNull();
    expect(asset.storageProvider).toBe("r2");
    expect(asset.storageKey).toBe("media/images/a1a1.jpg");
    expect(asset.byteSize).toBe(BigInt(204800));
  });

  it("28. repeated ensureStoredMediaAsset with same SHA-256 returns same row without duplicates", async () => {
    const repeatAsset = await ensureStoredMediaAsset({
      mediaType: "IMAGE",
      sourceUrl: "https://meta.cdn/orig_image_1.jpg",
      sha256: shaImg1,
      mimeType: "image/jpeg",
      byteSize: BigInt(204800),
      storageProvider: "r2",
      storageKey: "media/images/a1a1.jpg",
    });

    expect(repeatAsset.id).toBe(createdAssetImg1Id);
  });

  it("29. same SHA-256 from different sourceUrl preserves original source_url", async () => {
    const newUrlAsset = await ensureStoredMediaAsset({
      mediaType: "IMAGE",
      sourceUrl: "https://meta.cdn/ephemeral_second_url.jpg",
      sha256: shaImg1,
      mimeType: "image/jpeg",
      byteSize: BigInt(204800),
      storageProvider: "r2",
      storageKey: "media/images/a1a1.jpg",
    });

    expect(newUrlAsset.id).toBe(createdAssetImg1Id);
    expect(newUrlAsset.sourceUrl).toBe("https://meta.cdn/orig_image_1.jpg"); // First observed preserved!
  });

  it("30. same SHA-256 with conflicting byteSize throws MediaAssetConflictError", async () => {
    await expect(
      ensureStoredMediaAsset({
        mediaType: "IMAGE",
        sha256: shaImg1,
        byteSize: BigInt(999999), // Conflicting byteSize
        storageProvider: "r2",
        storageKey: "media/images/a1a1.jpg",
      }),
    ).rejects.toThrow(MediaAssetConflictError);
  });

  it("31. same SHA-256 with conflicting storageKey or provider throws MediaAssetConflictError", async () => {
    await expect(
      ensureStoredMediaAsset({
        mediaType: "IMAGE",
        sha256: shaImg1,
        byteSize: BigInt(204800),
        storageProvider: "s3", // Conflicting provider
        storageKey: "media/images/a1a1.jpg",
      }),
    ).rejects.toThrow(MediaAssetConflictError);

    await expect(
      ensureStoredMediaAsset({
        mediaType: "IMAGE",
        sha256: shaImg1,
        byteSize: BigInt(204800),
        storageProvider: "r2",
        storageKey: "media/images/CONFLICT_KEY.jpg", // Conflicting key
      }),
    ).rejects.toThrow(MediaAssetConflictError);
  });

  it("32. reconcileAdMedia creates relationships, removes stale ones, and retains media_assets rows", async () => {
    const videoRef: StoredMediaRef = {
      media: {
        mediaType: "VIDEO",
        sourceUrl: "https://meta.cdn/v1.mp4",
        sha256: shaVideo1,
        mimeType: "video/mp4",
        byteSize: BigInt(1048576),
        storageProvider: "r2",
        storageKey: "media/videos/b2b2.mp4",
      },
      position: 0,
      role: "primary",
    };

    const previewRef: StoredMediaRef = {
      media: {
        mediaType: "IMAGE",
        sourceUrl: "https://meta.cdn/p1.jpg",
        sha256: shaPreview1,
        mimeType: "image/jpeg",
        byteSize: BigInt(51200),
        storageProvider: "r2",
        storageKey: "media/previews/c3c3.jpg",
      },
      position: 1,
      role: "preview",
    };

    // Reconcile with 2 media items (video + preview)
    const adMediaRes = await reconcileAdMedia({
      adId: firstObservedAdId,
      media: [videoRef, previewRef],
    });

    for (const rel of adMediaRes.relationships) {
      createdMediaAssetIds.push(rel.mediaAssetId);
    }

    expect(adMediaRes.relationships).toHaveLength(2);

    // Verify DB relationships
    const dbRel = await db
      .select()
      .from(schema.adMedia)
      .where(eq(schema.adMedia.adId, firstObservedAdId));
    expect(dbRel).toHaveLength(2);

    // Reconcile again: keep ONLY the primary video (stale preview relationship removed)
    const adMediaRes2 = await reconcileAdMedia({
      adId: firstObservedAdId,
      media: [videoRef],
    });

    expect(adMediaRes2.relationships).toHaveLength(1);
    expect(adMediaRes2.deletedCount).toBe(1);

    // Verify stale relationship deleted
    const dbRel2 = await db
      .select()
      .from(schema.adMedia)
      .where(eq(schema.adMedia.adId, firstObservedAdId));
    expect(dbRel2).toHaveLength(1);
    expect(dbRel2[0].role).toBe("primary");

    // Invariant: preview physical asset row MUST still exist in media_assets!
    const previewAssetCheck = await db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.sha256, shaPreview1));
    expect(previewAssetCheck).toHaveLength(1);
  });

  it("33. reconcileCardMedia creates relationships, removes stale on empty array, and retains media_assets", async () => {
    const cardMediaRef: StoredMediaRef = {
      media: {
        mediaType: "IMAGE",
        sourceUrl: "https://meta.cdn/card_img.jpg",
        sha256: shaImg1,
        byteSize: BigInt(204800),
        storageProvider: "r2",
        storageKey: "media/images/a1a1.jpg",
      },
      position: 0,
      role: "primary",
    };

    const cardRes = await reconcileAdCards({
      adId: dcoDbAdId,
      cards: [
        {
          position: 0,
          title: "Test Card for Media",
          media: [],
          raw: {},
        },
      ],
    });
    const cardId = cardRes.cards[0].id;
    createdCardIds.push(cardId);

    const cardMediaRes = await reconcileCardMedia({
      adCardId: cardId,
      media: [cardMediaRef],
    });

    expect(cardMediaRes.relationships).toHaveLength(1);
    expect(cardMediaRes.relationships[0].adCardId).toBe(cardId);
    expect(cardMediaRes.relationships[0].mediaAssetId).toBe(createdAssetImg1Id);

    // Clear card media
    const cardMediaRes2 = await reconcileCardMedia({
      adCardId: cardId,
      media: [],
    });

    expect(cardMediaRes2.relationships).toHaveLength(0);
    expect(cardMediaRes2.deletedCount).toBe(1);

    // Verify card_media empty for this card
    const dbCardMedia = await db
      .select()
      .from(schema.cardMedia)
      .where(eq(schema.cardMedia.adCardId, cardId));
    expect(dbCardMedia).toHaveLength(0);

    // Invariant: image asset still exists in media_assets!
    const imgAssetCheck = await db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.id, createdAssetImg1Id));
    expect(imgAssetCheck).toHaveLength(1);
  });

  it("34. shared exact media asset attached to multiple ads produces 1 media_assets row", async () => {
    const sharedMediaRef: StoredMediaRef = {
      media: {
        mediaType: "IMAGE",
        sourceUrl: "https://meta.cdn/shared_creative.jpg",
        sha256: shaShared,
        mimeType: "image/jpeg",
        byteSize: BigInt(150000),
        storageProvider: "r2",
        storageKey: "media/images/d4d4.jpg",
      },
      position: 0,
      role: "primary",
    };

    // Attach to Ad 1 (firstObservedAdId)
    const rel1 = await reconcileAdMedia({
      adId: firstObservedAdId,
      media: [sharedMediaRef],
    });
    createdMediaAssetIds.push(rel1.relationships[0].mediaAssetId);

    // Attach to Ad 2 (dcoDbAdId)
    const rel2 = await reconcileAdMedia({
      adId: dcoDbAdId,
      media: [sharedMediaRef],
    });

    // Exact same media_asset_id shared across both ads
    expect(rel1.relationships[0].mediaAssetId).toBe(
      rel2.relationships[0].mediaAssetId,
    );

    // Exactly 1 physical media_assets row for shaShared
    const physicalRows = await db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.sha256, shaShared));
    expect(physicalRows).toHaveLength(1);
  });

  it("35. relationship reconciliation for one parent does not alter relationships of another parent", async () => {
    // Clear media for Ad 1
    await reconcileAdMedia({
      adId: firstObservedAdId,
      media: [],
    });

    // Verify Ad 1 has 0 media relationships
    const ad1Media = await db
      .select()
      .from(schema.adMedia)
      .where(eq(schema.adMedia.adId, firstObservedAdId));
    expect(ad1Media).toHaveLength(0);

    // Verify Ad 2 still has its shared media relationship untouched!
    const ad2Media = await db
      .select()
      .from(schema.adMedia)
      .where(eq(schema.adMedia.adId, dcoDbAdId));
    expect(ad2Media).toHaveLength(1);
    expect(ad2Media[0].role).toBe("primary");
  });

  // ---------------------------------------------------------------------------
  // Step 4C4.1 Relationship Identity & Metadata Semantics Tests
  // ---------------------------------------------------------------------------

  it("36. same SHA + same position with different role in incoming batch is rejected as duplicate", async () => {
    const duplicateShaRef1: StoredMediaRef = {
      media: {
        mediaType: "IMAGE",
        sha256: shaImg1,
        byteSize: BigInt(204800),
        storageProvider: "r2",
        storageKey: "media/images/a1a1.jpg",
      },
      position: 0,
      role: "primary",
    };

    const duplicateShaRef2: StoredMediaRef = {
      media: {
        mediaType: "IMAGE",
        sha256: shaImg1,
        byteSize: BigInt(204800),
        storageProvider: "r2",
        storageKey: "media/images/a1a1.jpg",
      },
      position: 0, // Same position, different role!
      role: "preview",
    };

    await expect(
      reconcileAdMedia({
        adId: firstObservedAdId,
        media: [duplicateShaRef1, duplicateShaRef2],
      }),
    ).rejects.toThrow(DuplicateMediaRelationshipError);
  });

  it("37. different SHA + same position in incoming batch is allowed", async () => {
    const refA: StoredMediaRef = {
      media: {
        mediaType: "VIDEO",
        sha256: shaVideo1,
        byteSize: BigInt(1048576),
        storageProvider: "r2",
        storageKey: "media/videos/b2b2.mp4",
      },
      position: 0,
      role: "primary",
    };

    const refB: StoredMediaRef = {
      media: {
        mediaType: "IMAGE",
        sha256: shaPreview1,
        byteSize: BigInt(51200),
        storageProvider: "r2",
        storageKey: "media/previews/c3c3.jpg",
      },
      position: 0, // Different SHA, same position 0
      role: "preview",
    };

    const res = await reconcileAdMedia({
      adId: firstObservedAdId,
      media: [refA, refB],
    });

    expect(res.relationships).toHaveLength(2);
    expect(res.relationships[0].position).toBe(0);
    expect(res.relationships[1].position).toBe(0);
    expect(res.relationships[0].mediaAssetId).not.toBe(
      res.relationships[1].mediaAssetId,
    );
  });

  it("38. reconciling same relationship identity with changed role updates role in database", async () => {
    const videoRefOriginal: StoredMediaRef = {
      media: {
        mediaType: "VIDEO",
        sha256: shaVideo1,
        byteSize: BigInt(1048576),
        storageProvider: "r2",
        storageKey: "media/videos/b2b2.mp4",
      },
      position: 0,
      role: "primary",
    };

    await reconcileAdMedia({
      adId: firstObservedAdId,
      media: [videoRefOriginal],
    });

    // Reconcile again with same SHA + position 0, but role changed to "hero_video"
    const videoRefUpdatedRole: StoredMediaRef = {
      media: {
        mediaType: "VIDEO",
        sha256: shaVideo1,
        byteSize: BigInt(1048576),
        storageProvider: "r2",
        storageKey: "media/videos/b2b2.mp4",
      },
      position: 0,
      role: "hero_video",
    };

    const res = await reconcileAdMedia({
      adId: firstObservedAdId,
      media: [videoRefUpdatedRole],
    });

    expect(res.relationships).toHaveLength(1);
    expect(res.relationships[0].role).toBe("hero_video");

    const dbRow = await db
      .select()
      .from(schema.adMedia)
      .where(
        and(
          eq(schema.adMedia.adId, firstObservedAdId),
          eq(schema.adMedia.position, 0),
        ),
      );
    expect(dbRow).toHaveLength(1);
    expect(dbRow[0].role).toBe("hero_video");
  });

  it("39. UNKNOWN media type enriches to known type, and known type is not downgraded to UNKNOWN", async () => {
    const shaEnrichType = testSha("enrich_type");

    // 1. Create with UNKNOWN
    const assetUnknown = await ensureStoredMediaAsset({
      mediaType: "UNKNOWN",
      sha256: shaEnrichType,
      byteSize: BigInt(300000),
      storageProvider: "r2",
      storageKey: "media/unknown/e5e5.bin",
    });
    createdMediaAssetIds.push(assetUnknown.id);
    expect(assetUnknown.mediaType).toBe("UNKNOWN");

    // 2. Ensure again with known type "VIDEO" -> enriches to VIDEO
    const assetEnriched = await ensureStoredMediaAsset({
      mediaType: "VIDEO",
      sha256: shaEnrichType,
      byteSize: BigInt(300000),
      storageProvider: "r2",
      storageKey: "media/unknown/e5e5.bin",
    });
    expect(assetEnriched.id).toBe(assetUnknown.id);
    expect(assetEnriched.mediaType).toBe("VIDEO");

    // 3. Ensure again with "UNKNOWN" -> preserves known type "VIDEO" (no downgrade)
    const assetPreserved = await ensureStoredMediaAsset({
      mediaType: "UNKNOWN",
      sha256: shaEnrichType,
      byteSize: BigInt(300000),
      storageProvider: "r2",
      storageKey: "media/unknown/e5e5.bin",
    });
    expect(assetPreserved.id).toBe(assetUnknown.id);
    expect(assetPreserved.mediaType).toBe("VIDEO");
  });

  it("40. conflicting known media types fail with MediaAssetConflictError", async () => {
    const shaConflictType = testSha("conflict_type");

    // 1. Create with IMAGE
    const asset = await ensureStoredMediaAsset({
      mediaType: "IMAGE",
      sha256: shaConflictType,
      byteSize: BigInt(400000),
      storageProvider: "r2",
      storageKey: "media/images/f6f6.jpg",
    });
    createdMediaAssetIds.push(asset.id);

    // 2. Conflict with VIDEO
    await expect(
      ensureStoredMediaAsset({
        mediaType: "VIDEO", // Conflicting known type!
        sha256: shaConflictType,
        byteSize: BigInt(400000),
        storageProvider: "r2",
        storageKey: "media/images/f6f6.jpg",
      }),
    ).rejects.toThrow(MediaAssetConflictError);
  });

  it("41. null MIME enriches to known MIME, known MIME is preserved on null, and conflicting MIME preserves first canonical without failure", async () => {
    const shaMimeTest = testSha("mime_test");

    // 1. Create with null MIME
    const assetNullMime = await ensureStoredMediaAsset({
      mediaType: "IMAGE",
      sha256: shaMimeTest,
      byteSize: BigInt(50000),
      storageProvider: "r2",
      storageKey: "media/images/0707.img",
      mimeType: null,
    });
    createdMediaAssetIds.push(assetNullMime.id);
    expect(assetNullMime.mimeType).toBeNull();

    // 2. Enrich with "image/webp"
    const assetEnrichedMime = await ensureStoredMediaAsset({
      mediaType: "IMAGE",
      sha256: shaMimeTest,
      byteSize: BigInt(50000),
      storageProvider: "r2",
      storageKey: "media/images/0707.img",
      mimeType: "image/webp",
    });
    expect(assetEnrichedMime.id).toBe(assetNullMime.id);
    expect(assetEnrichedMime.mimeType).toBe("image/webp");

    // 3. Ensure with null MIME -> preserves existing "image/webp"
    const assetPreservedMime = await ensureStoredMediaAsset({
      mediaType: "IMAGE",
      sha256: shaMimeTest,
      byteSize: BigInt(50000),
      storageProvider: "r2",
      storageKey: "media/images/0707.img",
      mimeType: null,
    });
    expect(assetPreservedMime.id).toBe(assetNullMime.id);
    expect(assetPreservedMime.mimeType).toBe("image/webp");

    // 4. Ensure with different non-null MIME "image/png" -> preserves "image/webp" without failure
    const assetConflictingMime = await ensureStoredMediaAsset({
      mediaType: "IMAGE",
      sha256: shaMimeTest,
      byteSize: BigInt(50000),
      storageProvider: "r2",
      storageKey: "media/images/0707.img",
      mimeType: "image/png", // Different MIME
    });
    expect(assetConflictingMime.id).toBe(assetNullMime.id);
    expect(assetConflictingMime.mimeType).toBe("image/webp"); // First canonical preserved!
  });

  it("42. Indian/non-regulated ad: core ad ingests, observation created, zero transparency rows exist, no null placeholder rows", async () => {
    const run = await startIngestionRun({
      source: "meta",
      sourceAccountId: createdSourceAccountIds[0],
      metadata: { collection_country_code: "IN" },
    });
    createdIngestionRunIds.push(run.id);

    const indianAd: SourceAd = {
      source: "meta",
      sourceAdId: "meta_ad_indian_absence_test_1",
      advertiser: {
        sourcePageId: `page_${testPrefix}_01`,
        name: "The Souled Store",
      },
      transparencyObservations: [], // No transparency disclosures in non-regulated Indian market
      cards: [],
      directMedia: [],
      publisherPlatforms: ["facebook", "instagram"],
      active: true,
      raw: { id: "meta_ad_indian_absence_test_1", market: "IN" },
    };

    const result = await persistObservedAd({
      sourceAccountId: createdSourceAccountIds[0],
      ingestionRunId: run.id,
      ad: indianAd,
      rawPayload: indianAd.raw,
      rawPayloadHash: "sha256:indian_ad_raw_1",
    });

    createdRawItemIds.push(result.rawItem.id);
    createdAdIds.push(result.ad.id);
    createdObservationIds.push(result.observation.id);

    expect(result.adOutcome).toBe("created");
    expect(result.observation.id).toBeDefined();
    expect(result.transparencyObservationCount).toBe(0);

    // Verify in database: zero transparency observation rows exist
    const transparencyRows = await db
      .select()
      .from(schema.adTransparencyObservations)
      .where(eq(schema.adTransparencyObservations.adObservationId, result.observation.id));

    expect(transparencyRows).toHaveLength(0);
  });

  it("43. Partial regional transparency with absent total_reach persists row with NULL total_reach (never coerced to 0)", async () => {
    const run = await startIngestionRun({
      source: "meta",
      sourceAccountId: createdSourceAccountIds[0],
      metadata: { collection_country_code: "EU" },
    });
    createdIngestionRunIds.push(run.id);

    const partialEuAd: SourceAd = {
      source: "meta",
      sourceAdId: "meta_ad_partial_transparency_test_1",
      advertiser: {
        sourcePageId: `page_${testPrefix}_01`,
        name: "The Souled Store",
      },
      transparencyObservations: [
        {
          region: "EU",
          totalReach: null, // Absent total reach
          targetAgeMin: 18,
          targetAgeMax: 65,
          targetGender: "All",
          targetCountries: ["ES"],
          reachedCountries: ["ES"],
          reachBreakdown: null,
          providerPayload: { targets_eu: true },
        },
      ],
      cards: [],
      directMedia: [],
      publisherPlatforms: ["facebook"],
      active: true,
      raw: { id: "meta_ad_partial_transparency_test_1" },
    };

    const result = await persistObservedAd({
      sourceAccountId: createdSourceAccountIds[0],
      ingestionRunId: run.id,
      ad: partialEuAd,
      rawPayload: partialEuAd.raw,
      rawPayloadHash: "sha256:partial_transparency_raw_1",
    });

    createdRawItemIds.push(result.rawItem.id);
    createdAdIds.push(result.ad.id);
    createdObservationIds.push(result.observation.id);

    expect(result.transparencyObservationCount).toBe(1);

    // Verify in database: exactly 1 row exists with strictly NULL total_reach
    const transparencyRows = await db
      .select()
      .from(schema.adTransparencyObservations)
      .where(eq(schema.adTransparencyObservations.adObservationId, result.observation.id));

    expect(transparencyRows).toHaveLength(1);
    const row = transparencyRows[0];
    expect(row.region).toBe("EU");
    expect(row.totalReach).toBeNull(); // Strictly NULL, NEVER coerced to 0!
    expect(row.targetAgeMin).toBe(18);
    expect(row.targetAgeMax).toBe(65);
    expect(row.targetCountries).toEqual(["ES"]);
    expect(row.reachedCountries).toEqual(["ES"]);
  });
});
