import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { env } from "@/env/server";
import { verifyDatabaseTargetSafety } from "@/db/target-safety";
import {
  DuplicateAdObservationError,
  ensureBrand,
  ensureSourceAccount,
  MediaAssetConflictError,
  persistPreparedObservedAd,
  PreparedMediaMismatchError,
  startIngestionRun,
  type PreparedAdMedia,
  type StoredMediaInput,
} from "@/ingestion/persistence";
import type { SourceAd } from "@/ingestion/types";

function createStoredMedia(
  sha: string,
  sourceUrl: string,
  mediaType: "IMAGE" | "VIDEO" | "UNKNOWN" = "IMAGE",
): StoredMediaInput {
  return {
    mediaType,
    sourceUrl,
    sha256: sha,
    mimeType: mediaType === "VIDEO" ? "video/mp4" : "image/jpeg",
    byteSize: BigInt(2048),
    storageProvider: "cloudflare_r2",
    storageKey: `media/sha256/${sha}`,
  };
}

describe("Database Integration: Step 4E Atomic Single-Ad Persistence (persistPreparedObservedAd)", () => {
  const runTimestamp = Date.now();
  const brandSlug = `test-brand-4e-${runTimestamp}`;
  const sourcePageId = `page_4e_${runTimestamp}`;
  let brandId: string;
  let sourceAccountId: string;
  let ingestionRun1Id: string;
  let ingestionRun2Id: string;
  let ingestionRun3Id: string;

  const testAdIds: string[] = [];
  const testShas: string[] = [];

  beforeAll(async () => {
    verifyDatabaseTargetSafety(env.DATABASE_URL, env.SUPABASE_PROJECT_REF);

    const brand = await ensureBrand({
      name: "Atomic Persistence Test Brand",
      slug: brandSlug,
    });
    brandId = brand.id;

    const sourceAccount = await ensureSourceAccount({
      brandId,
      source: "meta",
      sourcePageId,
    });
    sourceAccountId = sourceAccount.id;

    const run1 = await startIngestionRun({
      source: "meta",
      sourceAccountId,
    });
    ingestionRun1Id = run1.id;

    const run2 = await startIngestionRun({
      source: "meta",
      sourceAccountId,
    });
    ingestionRun2Id = run2.id;
  });

  afterAll(async () => {
    if (testAdIds.length > 0) {
      await db.delete(schema.adMedia).where(inArray(schema.adMedia.adId, testAdIds));
      await db
        .delete(schema.cardMedia)
        .where(
          inArray(
            schema.cardMedia.adCardId,
            db
              .select({ id: schema.adCards.id })
              .from(schema.adCards)
              .where(inArray(schema.adCards.adId, testAdIds)),
          ),
        );
      await db.delete(schema.adCards).where(inArray(schema.adCards.adId, testAdIds));
      await db
        .delete(schema.adObservations)
        .where(inArray(schema.adObservations.adId, testAdIds));
      await db.delete(schema.ads).where(inArray(schema.ads.id, testAdIds));
    }

    const runs = [ingestionRun1Id, ingestionRun2Id, ingestionRun3Id].filter(Boolean);
    if (runs.length > 0) {
      await db
        .delete(schema.rawIngestionItems)
        .where(inArray(schema.rawIngestionItems.ingestionRunId, runs));
    }

    if (testShas.length > 0) {
      await db
        .delete(schema.mediaAssets)
        .where(inArray(schema.mediaAssets.sha256, testShas));
    }

    if (runs.length > 0) {
      await db
        .delete(schema.ingestionRuns)
        .where(inArray(schema.ingestionRuns.id, runs));
    }
    if (sourceAccountId) {
      await db
        .delete(schema.sourceAccounts)
        .where(eq(schema.sourceAccounts.id, sourceAccountId));
    }
    if (brandId) {
      await db.delete(schema.brands).where(eq(schema.brands.id, brandId));
    }
  });

  it("1. new complete item: raw + ad + cards + media_assets + relationships + observation all persist in ONE atomic transaction", async () => {
    const sourceAdId = `4e_ad_complete_${Date.now()}`;
    const shaDirect = "1111111111111111111111111111111111111111111111111111111111111111";
    const shaCard0 = "2222222222222222222222222222222222222222222222222222222222222222";
    testShas.push(shaDirect, shaCard0);

    const sourceAd: SourceAd = {
      source: "meta",
      sourceAdId,
      advertiser: { sourcePageId },
      publisherPlatforms: ["facebook", "instagram"],
      directMedia: [
        {
          type: "image",
          sourceUrl: "https://example.com/direct.jpg",
          role: "primary",
        },
      ],
      cards: [
        {
          position: 0,
          title: "Card 0 Title",
          media: [
            {
              type: "image",
              sourceUrl: "https://example.com/card0.jpg",
              role: "card_primary",
            },
          ],
          raw: {},
        },
      ],
      raw: { test: true },
    };

    const preparedMedia: PreparedAdMedia = {
      directMedia: [
        {
          media: createStoredMedia(shaDirect, "https://example.com/direct.jpg", "IMAGE"),
          position: 0,
          role: "primary",
        },
      ],
      cardMedia: [
        {
          cardPosition: 0,
          media: [
            {
              media: createStoredMedia(shaCard0, "https://example.com/card0.jpg", "IMAGE"),
              position: 0,
              role: "card_primary",
            },
          ],
        },
      ],
    };

    const result = await persistPreparedObservedAd({
      ingestionRunId: ingestionRun1Id,
      sourceAccountId,
      ad: sourceAd,
      rawPayload: { original: "payload" },
      rawPayloadHash: `hash_${sourceAdId}`,
      preparedMedia,
    });

    testAdIds.push(result.ad.id);

    expect(result.adOutcome).toBe("created");
    expect(result.rawItem.sourceItemId).toBe(sourceAdId);
    expect(result.cards).toHaveLength(1);
    expect(result.directMediaCount).toBe(1);
    expect(result.cardMediaCount).toBe(1);
    expect(result.observation.adId).toBe(result.ad.id);

    // Verify all 7 entities exist in the database
    const rawRows = await db
      .select()
      .from(schema.rawIngestionItems)
      .where(eq(schema.rawIngestionItems.id, result.rawItem.id));
    expect(rawRows).toHaveLength(1);

    const adRows = await db
      .select()
      .from(schema.ads)
      .where(eq(schema.ads.id, result.ad.id));
    expect(adRows).toHaveLength(1);

    const cardRows = await db
      .select()
      .from(schema.adCards)
      .where(eq(schema.adCards.adId, result.ad.id));
    expect(cardRows).toHaveLength(1);

    const directRelRows = await db
      .select()
      .from(schema.adMedia)
      .where(eq(schema.adMedia.adId, result.ad.id));
    expect(directRelRows).toHaveLength(1);

    const cardRelRows = await db
      .select()
      .from(schema.cardMedia)
      .where(eq(schema.cardMedia.adCardId, cardRows[0].id));
    expect(cardRelRows).toHaveLength(1);

    const assetRows = await db
      .select()
      .from(schema.mediaAssets)
      .where(inArray(schema.mediaAssets.sha256, [shaDirect, shaCard0]));
    expect(assetRows).toHaveLength(2);

    const obsRows = await db
      .select()
      .from(schema.adObservations)
      .where(eq(schema.adObservations.id, result.observation.id));
    expect(obsRows).toHaveLength(1);
  });

  it("2. existing ad rerun in new ingestion run: same ad ID, first_seen unchanged, last_seen advances, new observation", async () => {
    const sourceAdId = `4e_ad_rerun_${Date.now()}`;
    const sha = "3333333333333333333333333333333333333333333333333333333333333333";
    testShas.push(sha);

    const sourceAd: SourceAd = {
      source: "meta",
      sourceAdId,
      advertiser: { sourcePageId },
      publisherPlatforms: ["facebook"],
      directMedia: [{ type: "image", sourceUrl: "https://example.com/r.jpg", role: "p" }],
      cards: [],
      raw: {},
    };

    const preparedMedia: PreparedAdMedia = {
      directMedia: [
        {
          media: createStoredMedia(sha, "https://example.com/r.jpg", "IMAGE"),
          position: 0,
          role: "p",
        },
      ],
      cardMedia: [],
    };

    // Run 1
    const res1 = await persistPreparedObservedAd({
      ingestionRunId: ingestionRun1Id,
      sourceAccountId,
      ad: sourceAd,
      rawPayload: { v: 1 },
      preparedMedia,
    });
    testAdIds.push(res1.ad.id);
    expect(res1.adOutcome).toBe("created");

    // Wait slightly to ensure timestamp advances
    await new Promise((r) => setTimeout(r, 50));

    // Run 2
    const res2 = await persistPreparedObservedAd({
      ingestionRunId: ingestionRun2Id,
      sourceAccountId,
      ad: sourceAd,
      rawPayload: { v: 2 },
      preparedMedia,
    });

    expect(res2.ad.id).toBe(res1.ad.id);
    expect(res2.adOutcome).toBe("updated");
    expect(new Date(res2.ad.firstSeenAt).getTime()).toBe(
      new Date(res1.ad.firstSeenAt).getTime(),
    );
    expect(new Date(res2.ad.lastSeenAt).getTime()).toBeGreaterThanOrEqual(
      new Date(res1.ad.lastSeenAt).getTime(),
    );
    expect(res2.observation.id).not.toBe(res1.observation.id);
    expect(res2.observation.ingestionRunId).toBe(ingestionRun2Id);
  });

  it("3. same SHA across direct and card produces exactly ONE media_assets row", async () => {
    const sourceAdId = `4e_ad_shared_sha_${Date.now()}`;
    const sharedSha = "4444444444444444444444444444444444444444444444444444444444444444";
    testShas.push(sharedSha);

    const sourceAd: SourceAd = {
      source: "meta",
      sourceAdId,
      advertiser: { sourcePageId },
      publisherPlatforms: ["facebook"],
      directMedia: [{ type: "image", sourceUrl: "https://example.com/s.jpg", role: "hero" }],
      cards: [
        {
          position: 0,
          media: [{ type: "video_preview", sourceUrl: "https://example.com/s.jpg", role: "preview" }],
          raw: {},
        },
      ],
      raw: {},
    };

    const preparedMedia: PreparedAdMedia = {
      directMedia: [
        {
          media: createStoredMedia(sharedSha, "https://example.com/s.jpg", "IMAGE"),
          position: 0,
          role: "hero",
        },
      ],
      cardMedia: [
        {
          cardPosition: 0,
          media: [
            {
              media: createStoredMedia(sharedSha, "https://example.com/s.jpg", "IMAGE"),
              position: 0,
              role: "preview",
            },
          ],
        },
      ],
    };

    const res = await persistPreparedObservedAd({
      ingestionRunId: ingestionRun1Id,
      sourceAccountId,
      ad: sourceAd,
      rawPayload: {},
      preparedMedia,
    });
    testAdIds.push(res.ad.id);

    const assetRows = await db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.sha256, sharedSha));
    expect(assetRows).toHaveLength(1);
    expect(assetRows[0].mediaType).toBe("IMAGE");
  });

  it("4. card snapshot update: stale card removed, current card correct, media relationships current", async () => {
    const sourceAdId = `4e_ad_card_snapshot_${Date.now()}`;
    const sha1 = "5555555555555555555555555555555555555555555555555555555555555555";
    const sha2 = "6666666666666666666666666666666666666666666666666666666666666666";
    testShas.push(sha1, sha2);

    // Initial snapshot: 2 cards
    const initialAd: SourceAd = {
      source: "meta",
      sourceAdId,
      advertiser: { sourcePageId },
      publisherPlatforms: ["facebook"],
      directMedia: [],
      cards: [
        { position: 0, media: [{ type: "image", sourceUrl: "https://example.com/c0.jpg", role: "c0" }], raw: {} },
        { position: 1, media: [{ type: "image", sourceUrl: "https://example.com/c1.jpg", role: "c1" }], raw: {} },
      ],
      raw: {},
    };
    const initialPrepared: PreparedAdMedia = {
      directMedia: [],
      cardMedia: [
        { cardPosition: 0, media: [{ media: createStoredMedia(sha1, "https://example.com/c0.jpg"), position: 0, role: "c0" }] },
        { cardPosition: 1, media: [{ media: createStoredMedia(sha2, "https://example.com/c1.jpg"), position: 0, role: "c1" }] },
      ],
    };

    const res1 = await persistPreparedObservedAd({
      ingestionRunId: ingestionRun1Id,
      sourceAccountId,
      ad: initialAd,
      rawPayload: {},
      preparedMedia: initialPrepared,
    });
    testAdIds.push(res1.ad.id);
    expect(res1.cards).toHaveLength(2);

    // Updated snapshot: only 1 card (card position 0)
    const updatedAd: SourceAd = {
      ...initialAd,
      cards: [initialAd.cards[0]],
    };
    const updatedPrepared: PreparedAdMedia = {
      directMedia: [],
      cardMedia: [initialPrepared.cardMedia[0]],
    };

    const res2 = await persistPreparedObservedAd({
      ingestionRunId: ingestionRun2Id,
      sourceAccountId,
      ad: updatedAd,
      rawPayload: {},
      preparedMedia: updatedPrepared,
    });

    expect(res2.cards).toHaveLength(1);
    const dbCards = await db
      .select()
      .from(schema.adCards)
      .where(eq(schema.adCards.adId, res1.ad.id));
    expect(dbCards).toHaveLength(1);
    expect(dbCards[0].position).toBe(0);
  });

  it("5. direct media snapshot update: stale relationship removed", async () => {
    const sourceAdId = `4e_ad_direct_stale_${Date.now()}`;
    const sha = "7777777777777777777777777777777777777777777777777777777777777777";
    testShas.push(sha);

    // Initial: 1 direct media
    const ad1: SourceAd = {
      source: "meta",
      sourceAdId,
      advertiser: { sourcePageId },
      publisherPlatforms: ["facebook"],
      directMedia: [{ type: "image", sourceUrl: "https://example.com/dm.jpg", role: "hero" }],
      cards: [],
      raw: {},
    };
    const prep1: PreparedAdMedia = {
      directMedia: [{ media: createStoredMedia(sha, "https://example.com/dm.jpg"), position: 0, role: "hero" }],
      cardMedia: [],
    };

    const res1 = await persistPreparedObservedAd({
      ingestionRunId: ingestionRun1Id,
      sourceAccountId,
      ad: ad1,
      rawPayload: {},
      preparedMedia: prep1,
    });
    testAdIds.push(res1.ad.id);
    expect(res1.directMediaCount).toBe(1);

    // Update: 0 direct media
    const ad2: SourceAd = { ...ad1, directMedia: [] };
    const prep2: PreparedAdMedia = { directMedia: [], cardMedia: [] };

    const res2 = await persistPreparedObservedAd({
      ingestionRunId: ingestionRun2Id,
      sourceAccountId,
      ad: ad2,
      rawPayload: {},
      preparedMedia: prep2,
    });

    expect(res2.directMediaCount).toBe(0);
    expect(res2.deletedDirectMediaCount).toBe(1);

    const relRows = await db
      .select()
      .from(schema.adMedia)
      .where(eq(schema.adMedia.adId, res1.ad.id));
    expect(relRows).toHaveLength(0);
  });

  it("6. forced media conflict rolls back entire transaction", async () => {
    const sourceAdId = `4e_ad_media_conflict_${Date.now()}`;
    const conflictSha = "8888888888888888888888888888888888888888888888888888888888888888";
    testShas.push(conflictSha);

    // Seed media_assets row with byteSize = 1000
    await db.insert(schema.mediaAssets).values({
      sha256: conflictSha,
      byteSize: BigInt(1000),
      mimeType: "image/jpeg",
      mediaType: "IMAGE",
      storageProvider: "cloudflare_r2",
      storageKey: `media/sha256/${conflictSha}`,
    });

    // Attempt persistPreparedObservedAd with conflicting byteSize = 9999
    const sourceAd: SourceAd = {
      source: "meta",
      sourceAdId,
      advertiser: { sourcePageId },
      publisherPlatforms: ["facebook"],
      directMedia: [{ type: "image", sourceUrl: "https://example.com/c.jpg", role: "p" }],
      cards: [],
      raw: {},
    };
    const preparedMedia: PreparedAdMedia = {
      directMedia: [
        {
          media: {
            ...createStoredMedia(conflictSha, "https://example.com/c.jpg"),
            byteSize: BigInt(9999), // Contradicts existing 1000
          },
          position: 0,
          role: "p",
        },
      ],
      cardMedia: [],
    };

    await expect(
      persistPreparedObservedAd({
        ingestionRunId: ingestionRun1Id,
        sourceAccountId,
        ad: sourceAd,
        rawPayload: { shouldRollback: true },
        preparedMedia,
      }),
    ).rejects.toThrow(MediaAssetConflictError);

    // Verify complete rollback: no raw item, no ad, no observation
    const rawRows = await db
      .select()
      .from(schema.rawIngestionItems)
      .where(eq(schema.rawIngestionItems.sourceItemId, sourceAdId));
    expect(rawRows).toHaveLength(0);

    const adRows = await db
      .select()
      .from(schema.ads)
      .where(eq(schema.ads.sourceAdId, sourceAdId));
    expect(adRows).toHaveLength(0);
  });

  it("7. duplicate observation in same ingestion run rolls back transaction", async () => {
    const sourceAdId = `4e_ad_dup_obs_${Date.now()}`;
    const sha = "9999999999999999999999999999999999999999999999999999999999999999";
    testShas.push(sha);

    const sourceAd: SourceAd = {
      source: "meta",
      sourceAdId,
      advertiser: { sourcePageId },
      publisherPlatforms: ["facebook"],
      directMedia: [{ type: "image", sourceUrl: "https://example.com/d.jpg", role: "p" }],
      cards: [],
      raw: {},
    };
    const preparedMedia: PreparedAdMedia = {
      directMedia: [{ media: createStoredMedia(sha, "https://example.com/d.jpg"), position: 0, role: "p" }],
      cardMedia: [],
    };

    const res = await persistPreparedObservedAd({
      ingestionRunId: ingestionRun1Id,
      sourceAccountId,
      ad: sourceAd,
      rawPayload: {},
      preparedMedia,
    });
    testAdIds.push(res.ad.id);

    // Duplicate in SAME run
    await expect(
      persistPreparedObservedAd({
        ingestionRunId: ingestionRun1Id,
        sourceAccountId,
        ad: sourceAd,
        rawPayload: { duplicate: true },
        preparedMedia,
      }),
    ).rejects.toThrow(DuplicateAdObservationError);
  });

  it("8. invalid prepared/source consistency throws before partial DB state", async () => {
    const sourceAdId = `4e_ad_inconsistent_${Date.now()}`;
    const sourceAd: SourceAd = {
      source: "meta",
      sourceAdId,
      advertiser: { sourcePageId },
      publisherPlatforms: ["facebook"],
      directMedia: [{ type: "image", sourceUrl: "https://example.com/a.jpg", role: "p" }],
      cards: [],
      raw: {},
    };
    const mismatchedPrepared: PreparedAdMedia = {
      directMedia: [], // Mismatched count!
      cardMedia: [],
    };

    await expect(
      persistPreparedObservedAd({
        ingestionRunId: ingestionRun1Id,
        sourceAccountId,
        ad: sourceAd,
        rawPayload: {},
        preparedMedia: mismatchedPrepared,
      }),
    ).rejects.toThrow(PreparedMediaMismatchError);

    // No DB records created
    const adRows = await db
      .select()
      .from(schema.ads)
      .where(eq(schema.ads.sourceAdId, sourceAdId));
    expect(adRows).toHaveLength(0);
  });

  it("9. one ad failure does not roll back outer ingestion_run row", async () => {
    const sourceAdId = `4e_ad_run_survives_${Date.now()}`;
    const sourceAd: SourceAd = {
      source: "meta",
      sourceAdId,
      advertiser: { sourcePageId: "wrong_page_id" }, // Advertiser mismatch error
      publisherPlatforms: ["facebook"],
      directMedia: [],
      cards: [],
      raw: {},
    };

    await expect(
      persistPreparedObservedAd({
        ingestionRunId: ingestionRun1Id,
        sourceAccountId,
        ad: sourceAd,
        rawPayload: {},
        preparedMedia: { directMedia: [], cardMedia: [] },
      }),
    ).rejects.toThrow();

    // Verify outer ingestion_run still exists
    const runRows = await db
      .select()
      .from(schema.ingestionRuns)
      .where(eq(schema.ingestionRuns.id, ingestionRun1Id));
    expect(runRows).toHaveLength(1);
  });

  it("10. CRITICAL ROLLBACK TEST: existing ad remains in exact prior state when re-observation media persistence fails", async () => {
    const sourceAdId = `4e_critical_rollback_${Date.now()}`;
    const initialSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const initialCardSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    testShas.push(initialSha, initialCardSha);

    // Step 1: Initial state established in Run 1
    const initialAd: SourceAd = {
      source: "meta",
      sourceAdId,
      advertiser: { sourcePageId },
      publisherPlatforms: ["facebook"],
      directMedia: [{ type: "image", sourceUrl: "https://example.com/v1_dm.jpg", role: "initial_hero" }],
      cards: [
        {
          position: 0,
          title: "Initial Card 0",
          body: "Initial Card 0 Body",
          media: [{ type: "image", sourceUrl: "https://example.com/v1_c0.jpg", role: "initial_card" }],
          raw: {},
        },
      ],
      raw: { version: 1 },
    };

    const initialPrepared: PreparedAdMedia = {
      directMedia: [
        {
          media: createStoredMedia(initialSha, "https://example.com/v1_dm.jpg"),
          position: 0,
          role: "initial_hero",
        },
      ],
      cardMedia: [
        {
          cardPosition: 0,
          media: [
            {
              media: createStoredMedia(initialCardSha, "https://example.com/v1_c0.jpg"),
              position: 0,
              role: "initial_card",
            },
          ],
        },
      ],
    };

    const initialResult = await persistPreparedObservedAd({
      ingestionRunId: ingestionRun1Id,
      sourceAccountId,
      ad: initialAd,
      rawPayload: { version: 1 },
      rawPayloadHash: `hash_v1_${sourceAdId}`,
      preparedMedia: initialPrepared,
    });
    testAdIds.push(initialResult.ad.id);

    const adId = initialResult.ad.id;
    const initialLastSeen = new Date(initialResult.ad.lastSeenAt).getTime();

    // Step 2: Attempt Run 2 update that changes ad copy, changes cards, but media persistence triggers a conflict
    const conflictSha = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
    testShas.push(conflictSha);

    // Pre-insert conflicting media asset
    await db.insert(schema.mediaAssets).values({
      sha256: conflictSha,
      byteSize: BigInt(500),
      mimeType: "image/jpeg",
      mediaType: "IMAGE",
      storageProvider: "cloudflare_r2",
      storageKey: `media/sha256/${conflictSha}`,
    });

    const modifiedAd: SourceAd = {
      source: "meta",
      sourceAdId,
      advertiser: { sourcePageId },
      publisherPlatforms: ["facebook"],
      directMedia: [{ type: "image", sourceUrl: "https://example.com/v2_dm.jpg", role: "updated_hero" }],
      cards: [
        {
          position: 0,
          title: "MODIFIED Card 0",
          body: "MODIFIED Card 0 Body",
          media: [],
          raw: {},
        },
        {
          position: 1,
          title: "NEW Card 1",
          media: [],
          raw: {},
        },
      ],
      raw: { version: 2 },
    };

    // Prepared media contains conflicting byteSize = 99999 for conflictSha
    const conflictingPrepared: PreparedAdMedia = {
      directMedia: [
        {
          media: {
            ...createStoredMedia(conflictSha, "https://example.com/v2_dm.jpg"),
            byteSize: BigInt(99999), // Triggers MediaAssetConflictError
          },
          position: 0,
          role: "updated_hero",
        },
      ],
      cardMedia: [
        { cardPosition: 0, media: [] },
        { cardPosition: 1, media: [] },
      ],
    };

    // Dedicated Run 3 for re-observation attempt
    const run3 = await startIngestionRun({
      source: "meta",
      sourceAccountId,
    });
    ingestionRun3Id = run3.id;

    await expect(
      persistPreparedObservedAd({
        ingestionRunId: ingestionRun3Id,
        sourceAccountId,
        ad: modifiedAd,
        rawPayload: { version: 2 },
        rawPayloadHash: `hash_v2_${sourceAdId}`,
        preparedMedia: conflictingPrepared,
      }),
    ).rejects.toThrow(MediaAssetConflictError);

    // Step 3: CRITICAL VERIFICATION OF EXACT PRIOR STATE
    // A. No new raw item persisted for Run 3
    const run3RawItems = await db
      .select()
      .from(schema.rawIngestionItems)
      .where(eq(schema.rawIngestionItems.ingestionRunId, ingestionRun3Id));
    expect(run3RawItems).toHaveLength(0);

    // B. Ad record remains untouched: last_seen is still Run 1's time
    const currentAd = await db
      .select()
      .from(schema.ads)
      .where(eq(schema.ads.id, adId));
    expect(currentAd).toHaveLength(1);
    expect(new Date(currentAd[0].lastSeenAt).getTime()).toBe(initialLastSeen);

    // C. Cards remain in initial snapshot (1 card with initial title/body, not 2 cards)
    const currentCards = await db
      .select()
      .from(schema.adCards)
      .where(eq(schema.adCards.adId, adId))
      .orderBy(schema.adCards.position);
    expect(currentCards).toHaveLength(1);
    expect(currentCards[0].title).toBe("Initial Card 0");
    expect(currentCards[0].body).toBe("Initial Card 0 Body");

    // D. Direct media relationship remains initial
    const currentDirectMedia = await db
      .select()
      .from(schema.adMedia)
      .where(eq(schema.adMedia.adId, adId));
    expect(currentDirectMedia).toHaveLength(1);
    expect(currentDirectMedia[0].role).toBe("initial_hero");

    // E. Card media relationship remains initial
    const currentCardMedia = await db
      .select()
      .from(schema.cardMedia)
      .where(eq(schema.cardMedia.adCardId, currentCards[0].id));
    expect(currentCardMedia).toHaveLength(1);
    expect(currentCardMedia[0].role).toBe("initial_card");

    // F. No observation created for Run 3
    const run3Observations = await db
      .select()
      .from(schema.adObservations)
      .where(eq(schema.adObservations.ingestionRunId, ingestionRun3Id));
    expect(run3Observations).toHaveLength(0);
  });
});
