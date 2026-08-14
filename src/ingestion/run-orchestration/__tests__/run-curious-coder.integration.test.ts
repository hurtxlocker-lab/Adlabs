import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { env } from "@/env/server";
import { verifyDatabaseTargetSafety } from "@/db/target-safety";
import {
  ingestNormalizedAd,
  type IngestNormalizedAdDependencies,
  type PreparedAdMedia,
} from "@/ingestion/media-orchestration";
import {
  type StoredMediaInput,
} from "@/ingestion/persistence";
import {
  runCuriousCoderIngestion,
  type RunCuriousCoderBrandInput,
  type RunCuriousCoderSourceAccountInput,
} from "../index";

function createStoredMedia(sha: string, sourceUrl: string): StoredMediaInput {
  return {
    mediaType: "IMAGE",
    sourceUrl,
    sha256: sha,
    mimeType: "image/jpeg",
    byteSize: BigInt(1024),
    storageProvider: "cloudflare_r2",
    storageKey: `media/sha256/${sha}`,
  };
}

function computeTestSha(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

describe("Database Integration: Step 4F Ingestion Run & Batch Orchestration", () => {
  const runTimestamp = Date.now();
  const brandSlug = `test-brand-4f-${runTimestamp}`;
  const sourcePageId = `page_4f_${runTimestamp}`;

  const brandInput: RunCuriousCoderBrandInput = {
    name: "Batch Orchestration Test Brand",
    slug: brandSlug,
  };

  const sourceAccountInput: RunCuriousCoderSourceAccountInput = {
    sourcePageId,
    displayName: "Batch Test Page",
  };

  let brandId: string;
  let sourceAccountId: string;
  const createdRunIds: string[] = [];
  const createdAdIds: string[] = [];
  const testShas: string[] = [];

  // Offline mock for prepareAdMedia (Zero network, Zero R2)
  const fakePrepareDependencies: IngestNormalizedAdDependencies = {
    prepareAdMedia: async (ad) => {
      const directMedia = ad.directMedia.map((m, idx) => {
        const sha = computeTestSha(`sha_direct_${ad.sourceAdId}_${idx}`);
        testShas.push(sha);
        return {
          media: createStoredMedia(sha, m.sourceUrl),
          position: idx,
          role: m.role ?? null,
        };
      });

      const cardMedia = ad.cards.map((c) => ({
        cardPosition: c.position,
        media: c.media.map((cm, cidx) => {
          const sha = computeTestSha(
            `sha_card_${ad.sourceAdId}_${c.position}_${cidx}`,
          );
          testShas.push(sha);
          return {
            media: createStoredMedia(sha, cm.sourceUrl),
            position: cidx,
            role: cm.role ?? null,
          };
        }),
      }));

      return { directMedia, cardMedia } as PreparedAdMedia;
    },
  };

  beforeAll(async () => {
    verifyDatabaseTargetSafety(env.DATABASE_URL, env.SUPABASE_PROJECT_REF);
  });

  afterAll(async () => {
    // 1. Delete all ads and child relationships for test source account
    if (sourceAccountId) {
      const brandAds = await db
        .select({ id: schema.ads.id })
        .from(schema.ads)
        .where(eq(schema.ads.sourceAccountId, sourceAccountId));
      const allAdIds = brandAds.map((a) => a.id);

      if (allAdIds.length > 0) {
        await db
          .delete(schema.adMedia)
          .where(inArray(schema.adMedia.adId, allAdIds));
        await db
          .delete(schema.cardMedia)
          .where(
            inArray(
              schema.cardMedia.adCardId,
              db
                .select({ id: schema.adCards.id })
                .from(schema.adCards)
                .where(inArray(schema.adCards.adId, allAdIds)),
            ),
          );
        await db
          .delete(schema.adCards)
          .where(inArray(schema.adCards.adId, allAdIds));
        await db
          .delete(schema.adObservations)
          .where(inArray(schema.adObservations.adId, allAdIds));
        await db.delete(schema.ads).where(inArray(schema.ads.id, allAdIds));
      }
    }

    // 2. Delete raw items, observations, and runs
    if (sourceAccountId) {
      const runs = await db
        .select({ id: schema.ingestionRuns.id })
        .from(schema.ingestionRuns)
        .where(eq(schema.ingestionRuns.sourceAccountId, sourceAccountId));
      const allRunIds = runs.map((r) => r.id);

      if (allRunIds.length > 0) {
        await db
          .delete(schema.rawIngestionItems)
          .where(inArray(schema.rawIngestionItems.ingestionRunId, allRunIds));
        await db
          .delete(schema.adObservations)
          .where(inArray(schema.adObservations.ingestionRunId, allRunIds));
        await db
          .delete(schema.ingestionRuns)
          .where(inArray(schema.ingestionRuns.id, allRunIds));
      }
    }

    // 3. Delete media assets
    if (testShas.length > 0) {
      await db
        .delete(schema.mediaAssets)
        .where(inArray(schema.mediaAssets.sha256, testShas));
    }

    // 4. Delete source accounts and brands
    if (sourceAccountId) {
      await db
        .delete(schema.sourceAccounts)
        .where(eq(schema.sourceAccounts.id, sourceAccountId));
    }
    if (brandId) {
      await db.delete(schema.brands).where(eq(schema.brands.id, brandId));
    }
  });

  function createProviderItem(archiveId: string, pageId = sourcePageId) {
    return {
      ad_archive_id: archiveId,
      page_id: pageId,
      page_name: "Batch Test Page",
      publisher_platform: ["facebook"],
      snapshot: {
        body: { text: `Body for ${archiveId}` },
        title: { text: `Title for ${archiveId}` },
        images: [
          {
            original_image_url: `https://example.com/${archiveId}_hero.jpg`,
          },
        ],
      },
    };
  }

  it("1. batch of 2 new ads: one run, 2 ads, 2 observations, status SUCCEEDED", async () => {
    const id1 = `4f_ad_new_1_${Date.now()}`;
    const id2 = `4f_ad_new_2_${Date.now()}`;
    const items = [createProviderItem(id1), createProviderItem(id2)];

    const result = await runCuriousCoderIngestion(
      {
        brand: brandInput,
        sourceAccount: sourceAccountInput,
        providerItems: items,
      },
      {
        ingestNormalizedAd: (input, deps) =>
          ingestNormalizedAd(input, {
            ...fakePrepareDependencies,
            ...(deps as IngestNormalizedAdDependencies),
          }),
      },
    );

    brandId = result.brandId;
    sourceAccountId = result.sourceAccountId;
    createdRunIds.push(result.ingestionRunId);

    expect(result.status).toBe("SUCCEEDED");
    expect(result.sourceItemsCount).toBe(2);
    expect(result.succeededItemsCount).toBe(2);
    expect(result.failedItemsCount).toBe(0);
    expect(result.createdAdsCount).toBe(2);
    expect(result.updatedAdsCount).toBe(0);

    // Verify DB state
    const dbAds = await db
      .select()
      .from(schema.ads)
      .where(inArray(schema.ads.sourceAdId, [id1, id2]));
    expect(dbAds).toHaveLength(2);
    createdAdIds.push(...dbAds.map((a) => a.id));

    const dbObs = await db
      .select()
      .from(schema.adObservations)
      .where(eq(schema.adObservations.ingestionRunId, result.ingestionRunId));
    expect(dbObs).toHaveLength(2);
  });

  it("2. new + existing ad update: createdAdsCount = 1, updatedAdsCount = 1", async () => {
    const existingId = `4f_ad_update_exist_${Date.now()}`;
    const newId = `4f_ad_update_new_${Date.now()}`;

    // Seed existing ad in Run A
    const seedResult = await runCuriousCoderIngestion(
      {
        brand: brandInput,
        sourceAccount: sourceAccountInput,
        providerItems: [createProviderItem(existingId)],
      },
      {
        ingestNormalizedAd: (input, deps) =>
          ingestNormalizedAd(input, {
            ...fakePrepareDependencies,
            ...(deps as IngestNormalizedAdDependencies),
          }),
      },
    );
    createdRunIds.push(seedResult.ingestionRunId);

    // Run B with 1 existing + 1 new
    const batchResult = await runCuriousCoderIngestion(
      {
        brand: brandInput,
        sourceAccount: sourceAccountInput,
        providerItems: [
          createProviderItem(existingId),
          createProviderItem(newId),
        ],
      },
      {
        ingestNormalizedAd: (input, deps) =>
          ingestNormalizedAd(input, {
            ...fakePrepareDependencies,
            ...(deps as IngestNormalizedAdDependencies),
          }),
      },
    );
    createdRunIds.push(batchResult.ingestionRunId);

    expect(batchResult.status).toBe("SUCCEEDED");
    expect(batchResult.sourceItemsCount).toBe(2);
    expect(batchResult.createdAdsCount).toBe(1);
    expect(batchResult.updatedAdsCount).toBe(1);
    expect(batchResult.succeededItemsCount).toBe(2);

    const newAd = await db
      .select()
      .from(schema.ads)
      .where(eq(schema.ads.sourceAdId, newId));
    expect(newAd).toHaveLength(1);
    createdAdIds.push(newAd[0].id);
  });

  it("3. 1 valid item + 1 parser/normalization failure: valid ad committed, status PARTIAL", async () => {
    const validId = `4f_ad_partial_valid_${Date.now()}`;
    const items = [
      createProviderItem(validId),
      { bad: "unparseable raw item without ad_archive_id" },
    ];

    const result = await runCuriousCoderIngestion(
      {
        brand: brandInput,
        sourceAccount: sourceAccountInput,
        providerItems: items,
      },
      {
        ingestNormalizedAd: (input, deps) =>
          ingestNormalizedAd(input, {
            ...fakePrepareDependencies,
            ...(deps as IngestNormalizedAdDependencies),
          }),
      },
    );
    createdRunIds.push(result.ingestionRunId);

    expect(result.status).toBe("PARTIAL");
    expect(result.sourceItemsCount).toBe(2);
    expect(result.succeededItemsCount).toBe(1);
    expect(result.failedItemsCount).toBe(1);
    expect(result.createdAdsCount).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].stage).toBe("parse");

    const validAd = await db
      .select()
      .from(schema.ads)
      .where(eq(schema.ads.sourceAdId, validId));
    expect(validAd).toHaveLength(1);
    createdAdIds.push(validAd[0].id);
  });

  it("4. all invalid items: no ads, status FAILED", async () => {
    const items = [
      { bad: "item 1" },
      { bad: "item 2" },
    ];

    const result = await runCuriousCoderIngestion(
      {
        brand: brandInput,
        sourceAccount: sourceAccountInput,
        providerItems: items,
      },
      {
        ingestNormalizedAd: (input, deps) =>
          ingestNormalizedAd(input, {
            ...fakePrepareDependencies,
            ...(deps as IngestNormalizedAdDependencies),
          }),
      },
    );
    createdRunIds.push(result.ingestionRunId);

    expect(result.status).toBe("FAILED");
    expect(result.sourceItemsCount).toBe(2);
    expect(result.succeededItemsCount).toBe(0);
    expect(result.failedItemsCount).toBe(2);
  });

  it("5. item failure isolation: later item failure does not roll back earlier valid item", async () => {
    const validId = `4f_ad_isolate_valid_${Date.now()}`;
    const items = [
      createProviderItem(validId),
      createProviderItem(`4f_ad_isolate_mismatch_${Date.now()}`, "page_wrong_999"),
    ];

    const result = await runCuriousCoderIngestion(
      {
        brand: brandInput,
        sourceAccount: sourceAccountInput,
        providerItems: items,
      },
      {
        ingestNormalizedAd: (input, deps) =>
          ingestNormalizedAd(input, {
            ...fakePrepareDependencies,
            ...(deps as IngestNormalizedAdDependencies),
          }),
      },
    );
    createdRunIds.push(result.ingestionRunId);

    expect(result.status).toBe("PARTIAL");
    expect(result.succeededItemsCount).toBe(1);
    expect(result.failedItemsCount).toBe(1);

    // Valid ad is safely committed in DB
    const validAd = await db
      .select()
      .from(schema.ads)
      .where(eq(schema.ads.sourceAdId, validId));
    expect(validAd).toHaveLength(1);
    createdAdIds.push(validAd[0].id);
  });

  it("6. rerun same ads in a NEW ingestion run: reuses ad rows, preserves first_seen_at, advances last_seen_at", async () => {
    const rerunId = `4f_ad_rerun_${Date.now()}`;
    const items = [createProviderItem(rerunId)];

    // Run 1
    const res1 = await runCuriousCoderIngestion(
      {
        brand: brandInput,
        sourceAccount: sourceAccountInput,
        providerItems: items,
      },
      {
        ingestNormalizedAd: (input, deps) =>
          ingestNormalizedAd(input, {
            ...fakePrepareDependencies,
            ...(deps as IngestNormalizedAdDependencies),
          }),
      },
    );
    createdRunIds.push(res1.ingestionRunId);
    expect(res1.createdAdsCount).toBe(1);

    const [ad1] = await db
      .select()
      .from(schema.ads)
      .where(eq(schema.ads.sourceAdId, rerunId));
    createdAdIds.push(ad1.id);

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Run 2
    const res2 = await runCuriousCoderIngestion(
      {
        brand: brandInput,
        sourceAccount: sourceAccountInput,
        providerItems: items,
      },
      {
        ingestNormalizedAd: (input, deps) =>
          ingestNormalizedAd(input, {
            ...fakePrepareDependencies,
            ...(deps as IngestNormalizedAdDependencies),
          }),
      },
    );
    createdRunIds.push(res2.ingestionRunId);

    expect(res2.ingestionRunId).not.toBe(res1.ingestionRunId);
    expect(res2.createdAdsCount).toBe(0);
    expect(res2.updatedAdsCount).toBe(1);

    const [ad2] = await db
      .select()
      .from(schema.ads)
      .where(eq(schema.ads.sourceAdId, rerunId));

    expect(ad2.id).toBe(ad1.id);
    expect(new Date(ad2.firstSeenAt).getTime()).toBe(
      new Date(ad1.firstSeenAt).getTime(),
    );
    expect(new Date(ad2.lastSeenAt).getTime()).toBeGreaterThanOrEqual(
      new Date(ad1.lastSeenAt).getTime(),
    );
  });

  it("7. empty item batch: SUCCEEDED run with 0 items", async () => {
    const result = await runCuriousCoderIngestion(
      {
        brand: brandInput,
        sourceAccount: sourceAccountInput,
        providerItems: [],
      },
      {
        ingestNormalizedAd: (input, deps) =>
          ingestNormalizedAd(input, {
            ...fakePrepareDependencies,
            ...(deps as IngestNormalizedAdDependencies),
          }),
      },
    );
    createdRunIds.push(result.ingestionRunId);

    expect(result.status).toBe("SUCCEEDED");
    expect(result.sourceItemsCount).toBe(0);
    expect(result.succeededItemsCount).toBe(0);
    expect(result.failedItemsCount).toBe(0);
  });

  it("8. persisted run counters verification: ingestion_runs row columns match returned IngestionRunResult", async () => {
    const id = `4f_ad_counters_${Date.now()}`;
    const items = [
      createProviderItem(id),
      { bad: "unparseable" },
    ];

    const result = await runCuriousCoderIngestion(
      {
        brand: brandInput,
        sourceAccount: sourceAccountInput,
        providerItems: items,
      },
      {
        ingestNormalizedAd: (input, deps) =>
          ingestNormalizedAd(input, {
            ...fakePrepareDependencies,
            ...(deps as IngestNormalizedAdDependencies),
          }),
      },
    );
    createdRunIds.push(result.ingestionRunId);

    const [runRow] = await db
      .select()
      .from(schema.ingestionRuns)
      .where(eq(schema.ingestionRuns.id, result.ingestionRunId));

    expect(runRow).toBeDefined();
    expect(runRow.status).toBe(result.status);
    expect(runRow.sourceItemsCount).toBe(result.sourceItemsCount);
    expect(runRow.newAdsCount).toBe(result.createdAdsCount);
    expect(runRow.updatedAdsCount).toBe(result.updatedAdsCount);
    expect(runRow.mediaDownloadedCount).toBe(0);
    expect(runRow.mediaDuplicateCount).toBe(0);
    expect(runRow.mediaFailedCount).toBe(0);
    expect(runRow.errorSummary).toContain("Failed 1 of 2 items");

    const ad = await db
      .select()
      .from(schema.ads)
      .where(eq(schema.ads.sourceAdId, id));
    createdAdIds.push(ad[0].id);
  });
});
