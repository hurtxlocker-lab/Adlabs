import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { env } from "@/env/server";
import { verifyDatabaseTargetSafety } from "@/db/target-safety";
import {
  ensureBrand,
  ensureSourceAccount,
  persistObservedAd,
  startIngestionRun,
  type StoredMediaInput,
} from "@/ingestion/persistence";
import type { SourceAd } from "@/ingestion/types";
import { AdNotFoundError, PreparedCardNotFoundError } from "../errors";
import { persistPreparedAdMedia } from "../persist-ad-media";
import type { PreparedAdMedia } from "../types";

function createStoredMedia(
  sha: string,
  mediaType: "IMAGE" | "VIDEO" | "UNKNOWN" = "IMAGE",
): StoredMediaInput {
  return {
    mediaType,
    sourceUrl: `https://example.com/media_${sha.slice(0, 8)}.jpg`,
    sha256: sha,
    mimeType: mediaType === "VIDEO" ? "video/mp4" : "image/jpeg",
    byteSize: BigInt(2048),
    storageProvider: "cloudflare_r2",
    storageKey: `media/sha256/${sha}`,
  };
}

describe("Database Integration: Step 4D3 Media Orchestration Persistence", () => {
  const runTimestamp = Date.now();
  const brandSlug = `test-brand-orch-${runTimestamp}`;
  const sourcePageId = `page_orch_${runTimestamp}`;
  let brandId: string;
  let sourceAccountId: string;
  let ingestionRunId: string;

  const testAdIds: string[] = [];
  const testShas: string[] = [];

  beforeAll(async () => {
    verifyDatabaseTargetSafety(env.DATABASE_URL, env.SUPABASE_PROJECT_REF);

    const brand = await ensureBrand({
      name: "Orchestration Test Brand",
      slug: brandSlug,
    });
    brandId = brand.id;

    const sourceAccount = await ensureSourceAccount({
      brandId,
      source: "meta",
      sourcePageId,
    });
    sourceAccountId = sourceAccount.id;

    const run = await startIngestionRun({
      source: "meta",
      sourceAccountId,
    });
    ingestionRunId = run.id;
  });

  afterAll(async () => {
    // Thorough cleanup of all test entities
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

    if (ingestionRunId) {
      await db
        .delete(schema.rawIngestionItems)
        .where(eq(schema.rawIngestionItems.ingestionRunId, ingestionRunId));
    }

    if (testShas.length > 0) {
      await db
        .delete(schema.mediaAssets)
        .where(inArray(schema.mediaAssets.sha256, testShas));
    }

    if (ingestionRunId) {
      await db
        .delete(schema.ingestionRuns)
        .where(eq(schema.ingestionRuns.id, ingestionRunId));
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

  async function createTestAd(sourceAdId: string, cardCount = 2) {
    const sourceAd: SourceAd = {
      source: "meta",
      sourceAdId,
      advertiser: {
        sourcePageId,
      },
      publisherPlatforms: ["facebook"],
      cards: Array.from({ length: cardCount }, (_, i) => ({
        position: i,
        title: `Card Title ${i}`,
        media: [],
        raw: {},
      })),
      directMedia: [],
      raw: {},
    };

    const persisted = await persistObservedAd({
      sourceAccountId,
      ingestionRunId,
      ad: sourceAd,
      rawPayload: { id: sourceAdId },
      rawPayloadHash: `hash_${sourceAdId}_${Date.now()}`,
    });
    testAdIds.push(persisted.ad.id);
    return persisted.ad.id;
  }

  it("1. persists direct ad media and card media by card position", async () => {
    const adId = await createTestAd("orch_ad_1", 2);
    const sha1 = "a111111111111111111111111111111111111111111111111111111111111111";
    const sha2 = "a222222222222222222222222222222222222222222222222222222222222222";
    const sha3 = "a333333333333333333333333333333333333333333333333333333333333333";
    testShas.push(sha1, sha2, sha3);

    const prepared: PreparedAdMedia = {
      directMedia: [
        {
          media: createStoredMedia(sha1, "IMAGE"),
          position: 0,
          role: "primary",
        },
      ],
      cardMedia: [
        {
          cardPosition: 0,
          media: [
            {
              media: createStoredMedia(sha2, "IMAGE"),
              position: 0,
              role: "card_primary",
            },
          ],
        },
        {
          cardPosition: 1,
          media: [
            {
              media: createStoredMedia(sha3, "VIDEO"),
              position: 0,
              role: "card_video",
            },
          ],
        },
      ],
    };

    const result = await persistPreparedAdMedia({ adId, prepared });

    expect(result.directMediaCount).toBe(1);
    expect(result.cardMediaCount).toBe(2);

    // Verify direct ad media in DB
    const directRows = await db
      .select()
      .from(schema.adMedia)
      .where(eq(schema.adMedia.adId, adId));
    expect(directRows).toHaveLength(1);
    expect(directRows[0].position).toBe(0);
    expect(directRows[0].role).toBe("primary");

    // Verify card media in DB
    const cards = await db
      .select()
      .from(schema.adCards)
      .where(eq(schema.adCards.adId, adId))
      .orderBy(schema.adCards.position);
    expect(cards).toHaveLength(2);

    const card0Media = await db
      .select()
      .from(schema.cardMedia)
      .where(eq(schema.cardMedia.adCardId, cards[0].id));
    expect(card0Media).toHaveLength(1);
    expect(card0Media[0].role).toBe("card_primary");

    const card1Media = await db
      .select()
      .from(schema.cardMedia)
      .where(eq(schema.cardMedia.adCardId, cards[1].id));
    expect(card1Media).toHaveLength(1);
    expect(card1Media[0].role).toBe("card_video");
  });

  it("2. shared exact SHA across ad and card reuses single media_assets row", async () => {
    const adId = await createTestAd("orch_ad_2", 1);
    const sharedSha = "b111111111111111111111111111111111111111111111111111111111111111";
    testShas.push(sharedSha);

    const prepared: PreparedAdMedia = {
      directMedia: [
        {
          media: createStoredMedia(sharedSha, "IMAGE"),
          position: 0,
          role: "primary",
        },
      ],
      cardMedia: [
        {
          cardPosition: 0,
          media: [
            {
              media: createStoredMedia(sharedSha, "IMAGE"),
              position: 0,
              role: "card_preview",
            },
          ],
        },
      ],
    };

    await persistPreparedAdMedia({ adId, prepared });

    // Verify exactly 1 media_assets row exists for this SHA
    const assetRows = await db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.sha256, sharedSha));
    expect(assetRows).toHaveLength(1);

    // Verify both ad_media and card_media reference the same media_asset_id
    const directRows = await db
      .select()
      .from(schema.adMedia)
      .where(eq(schema.adMedia.adId, adId));
    expect(directRows[0].mediaAssetId).toBe(assetRows[0].id);

    const cards = await db
      .select()
      .from(schema.adCards)
      .where(eq(schema.adCards.adId, adId));
    const cardRows = await db
      .select()
      .from(schema.cardMedia)
      .where(eq(schema.cardMedia.adCardId, cards[0].id));
    expect(cardRows[0].mediaAssetId).toBe(assetRows[0].id);
  });

  it("3. is idempotent and updates mutable role on rerun", async () => {
    const adId = await createTestAd("orch_ad_3", 1);
    const sha = "c111111111111111111111111111111111111111111111111111111111111111";
    testShas.push(sha);

    const preparedInitial: PreparedAdMedia = {
      directMedia: [
        {
          media: createStoredMedia(sha, "IMAGE"),
          position: 0,
          role: "role_v1",
        },
      ],
      cardMedia: [],
    };

    await persistPreparedAdMedia({ adId, prepared: preparedInitial });

    let directRows = await db
      .select()
      .from(schema.adMedia)
      .where(eq(schema.adMedia.adId, adId));
    expect(directRows).toHaveLength(1);
    expect(directRows[0].role).toBe("role_v1");

    // Rerun with updated role
    const preparedUpdated: PreparedAdMedia = {
      directMedia: [
        {
          media: createStoredMedia(sha, "IMAGE"),
          position: 0,
          role: "role_v2",
        },
      ],
      cardMedia: [],
    };

    await persistPreparedAdMedia({ adId, prepared: preparedUpdated });

    directRows = await db
      .select()
      .from(schema.adMedia)
      .where(eq(schema.adMedia.adId, adId));
    expect(directRows).toHaveLength(1);
    expect(directRows[0].role).toBe("role_v2");
  });

  it("4. removes stale direct media and stale card media when empty or omitted", async () => {
    const adId = await createTestAd("orch_ad_4", 2);
    const sha1 = "d111111111111111111111111111111111111111111111111111111111111111";
    const sha2 = "d222222222222222222222222222222222222222222222222222222222222222";
    testShas.push(sha1, sha2);

    // Initial state: direct media present, card 0 and card 1 have media
    await persistPreparedAdMedia({
      adId,
      prepared: {
        directMedia: [
          { media: createStoredMedia(sha1), position: 0, role: "primary" },
        ],
        cardMedia: [
          {
            cardPosition: 0,
            media: [
              { media: createStoredMedia(sha2), position: 0, role: "c0" },
            ],
          },
          {
            cardPosition: 1,
            media: [
              { media: createStoredMedia(sha2), position: 0, role: "c1" },
            ],
          },
        ],
      },
    });

    // New snapshot: directMedia is empty, cardMedia only specifies card 0 with empty array (omitting card 1)
    const result = await persistPreparedAdMedia({
      adId,
      prepared: {
        directMedia: [],
        cardMedia: [
          {
            cardPosition: 0,
            media: [],
          },
        ],
      },
    });

    expect(result.deletedDirectMediaCount).toBe(1);
    expect(result.deletedCardMediaCount).toBe(2); // card 0 emptied + card 1 unmentioned emptied

    const directRows = await db
      .select()
      .from(schema.adMedia)
      .where(eq(schema.adMedia.adId, adId));
    expect(directRows).toHaveLength(0);

    const cards = await db
      .select()
      .from(schema.adCards)
      .where(eq(schema.adCards.adId, adId));
    const allCardMedia = await db
      .select()
      .from(schema.cardMedia)
      .where(
        inArray(
          schema.cardMedia.adCardId,
          cards.map((c) => c.id),
        ),
      );
    expect(allCardMedia).toHaveLength(0);
  });

  it("5. throws PreparedCardNotFoundError and rolls back if card position does not exist", async () => {
    const adId = await createTestAd("orch_ad_5", 1); // only card at position 0 exists
    const sha = "e111111111111111111111111111111111111111111111111111111111111111";
    testShas.push(sha);

    const prepared: PreparedAdMedia = {
      directMedia: [
        { media: createStoredMedia(sha), position: 0, role: "primary" },
      ],
      cardMedia: [
        {
          cardPosition: 99, // Does not exist!
          media: [{ media: createStoredMedia(sha), position: 0, role: "c99" }],
        },
      ],
    };

    await expect(
      persistPreparedAdMedia({ adId, prepared }),
    ).rejects.toThrow(PreparedCardNotFoundError);

    // Rollback verification: direct ad media should NOT have been persisted
    const directRows = await db
      .select()
      .from(schema.adMedia)
      .where(eq(schema.adMedia.adId, adId));
    expect(directRows).toHaveLength(0);
  });

  it("6. throws AdNotFoundError if ad does not exist", async () => {
    const nonExistentAdId = "00000000-0000-4000-8000-000000000000";
    await expect(
      persistPreparedAdMedia({
        adId: nonExistentAdId,
        prepared: { directMedia: [], cardMedia: [] },
      }),
    ).rejects.toThrow(AdNotFoundError);
  });

  it("7. verifies complete transaction rollback of media_assets and relationships on failure", async () => {
    const adId = await createTestAd("orch_ad_rollback", 1);
    const rollbackSha = "f111111111111111111111111111111111111111111111111111111111111111";
    testShas.push(rollbackSha);

    const prepared: PreparedAdMedia = {
      directMedia: [
        {
          media: createStoredMedia(rollbackSha),
          position: 0,
          role: "should_rollback",
        },
      ],
      cardMedia: [
        {
          cardPosition: 42, // Non-existent card position to trigger error
          media: [
            {
              media: createStoredMedia(rollbackSha),
              position: 0,
              role: "bad",
            },
          ],
        },
      ],
    };

    await expect(
      persistPreparedAdMedia({ adId, prepared }),
    ).rejects.toThrow(PreparedCardNotFoundError);

    // Verify media_assets row for rollbackSha was rolled back and does not exist
    const assetRows = await db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.sha256, rollbackSha));
    expect(assetRows).toHaveLength(0);

    // Verify ad_media relationship was rolled back
    const adMediaRows = await db
      .select()
      .from(schema.adMedia)
      .where(eq(schema.adMedia.adId, adId));
    expect(adMediaRows).toHaveLength(0);
  });

  it("8. persists same JPEG SHA used across direct ad media and card preview as ONE media_assets row without MediaAssetConflictError", async () => {
    const adId = await createTestAd("orch_ad_preview_shared", 1);
    const sharedSha = "9876543210abcdef9876543210abcdef9876543210abcdef9876543210abcdef";
    testShas.push(sharedSha);

    const prepared: PreparedAdMedia = {
      directMedia: [
        {
          media: createStoredMedia(sharedSha, "IMAGE"),
          position: 0,
          role: "hero",
        },
      ],
      cardMedia: [
        {
          cardPosition: 0,
          media: [
            {
              media: createStoredMedia(sharedSha, "IMAGE"),
              position: 0,
              role: "preview",
            },
          ],
        },
      ],
    };

    const result = await persistPreparedAdMedia({ adId, prepared });
    expect(result.directMediaCount).toBe(1);
    expect(result.cardMediaCount).toBe(1);

    // Verify exactly one media_assets row exists and has mediaType IMAGE
    const assetRows = await db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.sha256, sharedSha));
    expect(assetRows).toHaveLength(1);
    expect(assetRows[0].mediaType).toBe("IMAGE");

    // Verify distinct roles preserved across relationships
    const directRows = await db
      .select()
      .from(schema.adMedia)
      .where(eq(schema.adMedia.adId, adId));
    expect(directRows[0].role).toBe("hero");

    const cards = await db
      .select()
      .from(schema.adCards)
      .where(eq(schema.adCards.adId, adId));
    const cardRows = await db
      .select()
      .from(schema.cardMedia)
      .where(eq(schema.cardMedia.adCardId, cards[0].id));
    expect(cardRows[0].role).toBe("preview");
  });
});
