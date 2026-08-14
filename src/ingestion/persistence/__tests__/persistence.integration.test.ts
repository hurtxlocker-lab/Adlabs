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
  ensureBrand,
  ensureSourceAccount,
  finishIngestionRun,
  IngestionRunStateError,
  persistObservedAd,
  saveRawIngestionItem,
  SourceAccountOwnershipConflictError,
  startIngestionRun,
} from "../index";

describe("Database Integration: Step 4C1 & 4C2 Persistence Foundation", () => {
  const runId = Math.random().toString(36).substring(2, 9);
  const testPrefix = `test_4c2_${Date.now()}_${runId}`;

  const createdBrandIds: string[] = [];
  const createdSourceAccountIds: string[] = [];
  const createdIngestionRunIds: string[] = [];
  const createdRawItemIds: string[] = [];
  const createdAdIds: string[] = [];
  const createdObservationIds: string[] = [];

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
    if (createdObservationIds.length > 0) {
      await db
        .delete(schema.adObservations)
        .where(inArray(schema.adObservations.id, createdObservationIds));
    }

    if (createdRawItemIds.length > 0) {
      await db
        .delete(schema.rawIngestionItems)
        .where(inArray(schema.rawIngestionItems.id, createdRawItemIds));
    }

    if (createdAdIds.length > 0) {
      await db
        .delete(schema.ads)
        .where(inArray(schema.ads.id, createdAdIds));
    }

    if (createdIngestionRunIds.length > 0) {
      await db
        .delete(schema.ingestionRuns)
        .where(inArray(schema.ingestionRuns.id, createdIngestionRunIds));
    }

    if (createdSourceAccountIds.length > 0) {
      await db
        .delete(schema.sourceAccounts)
        .where(inArray(schema.sourceAccounts.id, createdSourceAccountIds));
    }

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

    const remainingRaw = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.rawIngestionItems)
      .where(
        inArray(
          schema.rawIngestionItems.id,
          createdRawItemIds.length
            ? createdRawItemIds
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
    expect(remainingAds[0].count).toBe(0);
    expect(remainingRaw[0].count).toBe(0);
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
    // Start second ingestion run
    const run2 = await startIngestionRun({
      source: "meta",
      sourceAccountId: createdSourceAccountIds[0],
      metadata: { env: "test_ad_run_2" },
    });
    createdIngestionRunIds.push(run2.id);

    const updatedSourceAd: SourceAd = {
      source: "meta",
      sourceAdId: testSourceAdId, // Same external ad archive ID
      sourceCollationId: "collation_100",
      sourceCollationCount: 5, // Mutable update
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
        sourcePageId: "wrong_page_999", // Does NOT match sourceAccount.sourcePageId
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
    // Create a 2nd source account for Brand A
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
      sourceAdId: testSourceAdId, // Existing ad owned by sourceAccount 1
      advertiser: {
        sourcePageId: pageId2, // Matches sourceAccount 2
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
        ingestionRunId: adTestRun1Id, // Already observed in adTestRun1Id (Test 11)
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
      active: null, // Explicitly null
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

  it("17. verifies zero card and media rows were created during ad persistence", async () => {
    const cards = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.adCards)
      .where(inArray(schema.adCards.adId, createdAdIds));

    const adMediaRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.adMedia)
      .where(inArray(schema.adMedia.adId, createdAdIds));

    expect(cards[0].count).toBe(0);
    expect(adMediaRows[0].count).toBe(0);
  });
});
