import { describe, expect, it } from "vitest";
import type { SourceAd } from "@/ingestion/types";
import {
  PreparedMediaMismatchError,
  validateSourceAndPreparedMediaConsistency,
  type PreparedAdMedia,
  type StoredMediaInput,
} from "../index";

function createStoredMedia(sha: string): StoredMediaInput {
  return {
    mediaType: "IMAGE",
    sourceUrl: `https://example.com/${sha}.jpg`,
    sha256: sha,
    byteSize: BigInt(1024),
    storageProvider: "cloudflare_r2",
    storageKey: `media/sha256/${sha}`,
  };
}

describe("validateSourceAndPreparedMediaConsistency", () => {
  const baseAd: SourceAd = {
    source: "meta",
    sourceAdId: "ad_123",
    advertiser: { sourcePageId: "page_123" },
    publisherPlatforms: ["facebook"],
    directMedia: [
      {
        type: "image",
        sourceUrl: "https://example.com/direct1.jpg",
        role: "primary",
      },
    ],
    cards: [
      {
        position: 0,
        media: [
          {
            type: "image",
            sourceUrl: "https://example.com/card0_m0.jpg",
            role: "card_primary",
          },
        ],
        raw: {},
      },
      {
        position: 1,
        media: [],
        raw: {},
      },
    ],
    raw: {},
  };

  const validPrepared: PreparedAdMedia = {
    directMedia: [
      {
        media: {
          ...createStoredMedia("1111111111111111111111111111111111111111111111111111111111111111"),
          sourceUrl: "https://example.com/direct1.jpg",
        },
        position: 0,
        role: "primary",
      },
    ],
    cardMedia: [
      {
        cardPosition: 0,
        media: [
          {
            media: {
              ...createStoredMedia("2222222222222222222222222222222222222222222222222222222222222222"),
              sourceUrl: "https://example.com/card0_m0.jpg",
            },
            position: 0,
            role: "card_primary",
          },
        ],
      },
      {
        cardPosition: 1,
        media: [],
      },
    ],
  };

  it("passes when source and prepared media match structurally and semantically", () => {
    expect(() =>
      validateSourceAndPreparedMediaConsistency(baseAd, validPrepared),
    ).not.toThrow();
  });

  it("throws when direct media counts mismatch", () => {
    const invalid: PreparedAdMedia = {
      ...validPrepared,
      directMedia: [],
    };
    expect(() =>
      validateSourceAndPreparedMediaConsistency(baseAd, invalid),
    ).toThrow(PreparedMediaMismatchError);
  });

  it("throws when direct media position mismatches", () => {
    const invalid: PreparedAdMedia = {
      ...validPrepared,
      directMedia: [
        {
          ...validPrepared.directMedia[0],
          position: 1,
        },
      ],
    };
    expect(() =>
      validateSourceAndPreparedMediaConsistency(baseAd, invalid),
    ).toThrow(PreparedMediaMismatchError);
  });

  it("throws when direct media sourceUrl mismatches", () => {
    const invalid: PreparedAdMedia = {
      ...validPrepared,
      directMedia: [
        {
          ...validPrepared.directMedia[0],
          media: {
            ...validPrepared.directMedia[0].media,
            sourceUrl: "https://example.com/different.jpg",
          },
        },
      ],
    };
    expect(() =>
      validateSourceAndPreparedMediaConsistency(baseAd, invalid),
    ).toThrow(PreparedMediaMismatchError);
  });

  it("throws when direct media role mismatches", () => {
    const invalid: PreparedAdMedia = {
      ...validPrepared,
      directMedia: [
        {
          ...validPrepared.directMedia[0],
          role: "secondary",
        },
      ],
    };
    expect(() =>
      validateSourceAndPreparedMediaConsistency(baseAd, invalid),
    ).toThrow(PreparedMediaMismatchError);
  });

  it("throws when card count mismatches", () => {
    const invalid: PreparedAdMedia = {
      ...validPrepared,
      cardMedia: [validPrepared.cardMedia[0]],
    };
    expect(() =>
      validateSourceAndPreparedMediaConsistency(baseAd, invalid),
    ).toThrow(PreparedMediaMismatchError);
  });

  it("throws when card position mismatches", () => {
    const invalid: PreparedAdMedia = {
      ...validPrepared,
      cardMedia: [
        { ...validPrepared.cardMedia[0], cardPosition: 99 },
        validPrepared.cardMedia[1],
      ],
    };
    expect(() =>
      validateSourceAndPreparedMediaConsistency(baseAd, invalid),
    ).toThrow(PreparedMediaMismatchError);
  });

  it("throws when card media array count mismatches", () => {
    const invalid: PreparedAdMedia = {
      ...validPrepared,
      cardMedia: [
        {
          ...validPrepared.cardMedia[0],
          media: [],
        },
        validPrepared.cardMedia[1],
      ],
    };
    expect(() =>
      validateSourceAndPreparedMediaConsistency(baseAd, invalid),
    ).toThrow(PreparedMediaMismatchError);
  });

  it("throws when card media sourceUrl mismatches and redacts URLs in message", () => {
    const secretUrl = "https://example.com/card0.jpg?token=secret123";
    const invalid: PreparedAdMedia = {
      ...validPrepared,
      cardMedia: [
        {
          ...validPrepared.cardMedia[0],
          media: [
            {
              ...validPrepared.cardMedia[0].media[0],
              media: {
                ...validPrepared.cardMedia[0].media[0].media,
                sourceUrl: secretUrl,
              },
            },
          ],
        },
        validPrepared.cardMedia[1],
      ],
    };

    let caughtError: unknown;
    try {
      validateSourceAndPreparedMediaConsistency(baseAd, invalid);
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError).toBeInstanceOf(PreparedMediaMismatchError);
    const err = caughtError as PreparedMediaMismatchError;
    expect(err.message).not.toContain("secret123");
    expect(err.sourceAdId).toBe("ad_123");
    expect(err.cardPosition).toBe(0);
    expect(err.mediaPosition).toBe(0);
  });
});
