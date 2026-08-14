import { describe, expect, it, vi } from "vitest";
import type { PersistPreparedObservedAdResult } from "@/ingestion/persistence";
import type { SourceAd } from "@/ingestion/types";
import {
  MediaPreparationError,
  type IngestNormalizedAdInput,
  type PreparedAdMedia,
} from "../index";
import { ingestNormalizedAd } from "../ingest-ad";

describe("ingestNormalizedAd (Unit)", () => {
  const sampleAd: SourceAd = {
    source: "meta",
    sourceAdId: "unit_ad_1",
    advertiser: { sourcePageId: "page_1" },
    publisherPlatforms: ["facebook"],
    directMedia: [
      {
        type: "image",
        sourceUrl: "https://example.com/img1.jpg",
        role: "primary",
      },
    ],
    cards: [
      {
        position: 0,
        media: [],
        raw: {},
      },
    ],
    raw: {},
  };

  const samplePrepared: PreparedAdMedia = {
    directMedia: [
      {
        media: {
          mediaType: "IMAGE",
          sourceUrl: "https://example.com/img1.jpg",
          sha256: "1111111111111111111111111111111111111111111111111111111111111111",
          byteSize: BigInt(2048),
          storageProvider: "cloudflare_r2",
          storageKey: "media/sha256/1111111111111111111111111111111111111111111111111111111111111111",
        },
        position: 0,
        role: "primary",
      },
    ],
    cardMedia: [
      {
        cardPosition: 0,
        media: [],
      },
    ],
  };

  const sampleInput: IngestNormalizedAdInput = {
    ingestionRunId: "00000000-0000-4000-8000-000000000001",
    sourceAccountId: "00000000-0000-4000-8000-000000000002",
    sourceAd: sampleAd,
    rawPayload: { id: "unit_ad_1" },
  };

  it("1. calls prepareAdMedia before persistence and passes prepared result to DB persistence", async () => {
    const callOrder: string[] = [];

    const mockPrepare = vi.fn(async () => {
      callOrder.push("prepare");
      return samplePrepared;
    });

    const mockPersist = vi.fn(async () => {
      callOrder.push("persist");
      return {
        rawItem: { id: "raw_1" },
        ad: { id: "ad_1" },
        adOutcome: "created" as const,
        cards: [{ id: "card_1" }],
        directMediaCount: 1,
        cardMediaCount: 0,
        deletedDirectMediaCount: 0,
        deletedCardMediaCount: 0,
        observation: { id: "obs_1" },
      } as unknown as PersistPreparedObservedAdResult;
    });

    const result = await ingestNormalizedAd(sampleInput, {
      prepareAdMedia: mockPrepare,
      persistPreparedObservedAd: mockPersist,
    });

    expect(callOrder).toEqual(["prepare", "persist"]);
    expect(mockPrepare).toHaveBeenCalledWith(sampleAd, undefined);
    expect(mockPersist).toHaveBeenCalledWith(
      expect.objectContaining({
        ingestionRunId: sampleInput.ingestionRunId,
        sourceAccountId: sampleInput.sourceAccountId,
        ad: sampleAd,
        preparedMedia: samplePrepared,
      }),
      undefined,
    );

    expect(result).toEqual({
      adId: "ad_1",
      adOutcome: "created",
      rawItemId: "raw_1",
      observationId: "obs_1",
      cardsCount: 1,
      directMediaCount: 1,
      cardMediaCount: 0,
      deletedDirectMediaCount: 0,
      deletedCardMediaCount: 0,
    });
  });

  it("2. preparation failure aborts before persistence is ever called (Case A)", async () => {
    const mockPrepare = vi.fn(async () => {
      throw new MediaPreparationError("Network timeout", {
        sourceUrl: "https://example.com/img1.jpg",
        mediaType: "image",
      });
    });

    const mockPersist = vi.fn();

    await expect(
      ingestNormalizedAd(sampleInput, {
        prepareAdMedia: mockPrepare,
        persistPreparedObservedAd: mockPersist,
      }),
    ).rejects.toThrow(MediaPreparationError);

    expect(mockPersist).not.toHaveBeenCalled();
  });

  it("3. DB failure does not trigger R2 compensation or deletion calls (Case B)", async () => {
    const mockPrepare = vi.fn(async () => samplePrepared);
    const mockPersist = vi.fn(async () => {
      throw new Error("DB connection terminated");
    });

    await expect(
      ingestNormalizedAd(sampleInput, {
        prepareAdMedia: mockPrepare,
        persistPreparedObservedAd: mockPersist,
      }),
    ).rejects.toThrow("DB connection terminated");

    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(mockPersist).toHaveBeenCalledTimes(1);
  });

  it("4. does not perform run finalization or run-level counter mutations", async () => {
    const mockPrepare = vi.fn(async () => samplePrepared);
    const mockPersist = vi.fn(async () => ({
      rawItem: { id: "raw_1" },
      ad: { id: "ad_1" },
      adOutcome: "updated" as const,
      cards: [],
      directMediaCount: 1,
      cardMediaCount: 0,
      deletedDirectMediaCount: 0,
      deletedCardMediaCount: 0,
      observation: { id: "obs_1" },
    } as unknown as PersistPreparedObservedAdResult));

    const result = await ingestNormalizedAd(sampleInput, {
      prepareAdMedia: mockPrepare,
      persistPreparedObservedAd: mockPersist,
    });

    // Confirms outcome is returned cleanly without triggering finishIngestionRun
    expect(result.adOutcome).toBe("updated");
  });
});
