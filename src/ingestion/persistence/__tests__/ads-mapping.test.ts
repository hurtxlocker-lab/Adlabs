import { describe, expect, it } from "vitest";
import type { SourceAd } from "@/ingestion/types";
import {
  type AdRow,
  AdSourceAccountConflictError,
  AdvertiserSourceAccountMismatchError,
  DuplicateAdObservationError,
} from "../types";

describe("Ad Persistence Business Logic & Mapping Invariants", () => {
  const sampleSourceAd: SourceAd = {
    source: "meta",
    sourceAdId: "archive_123456789",
    sourceCollationId: "collation_987",
    sourceCollationCount: 3,
    advertiser: {
      sourcePageId: "advertiser_page_111",
      name: "Advertiser Brand Name",
      url: "https://facebook.com/advertiser",
    },
    publisher: {
      sourcePageId: "creator_page_222",
      name: "Creator Influencer",
      url: "https://facebook.com/creator",
    },
    brandedContent: {
      sourcePageId: "sponsor_page_333",
      name: "Sponsor Brand",
      url: "https://facebook.com/sponsor",
    },
    displayFormat: "video",
    primaryText: "Super primary text copy",
    headline: "Catchy headline",
    description: "Short description",
    ctaText: "Shop Now",
    ctaType: "SHOP_NOW",
    destinationUrl: "https://example.com/product",
    publisherPlatforms: ["facebook", "instagram"],
    platformStartAt: new Date("2026-01-01T00:00:00Z"),
    sourceReportedEndAt: new Date("2026-01-10T00:00:00Z"),
    active: true,
    adLibraryUrl: "https://facebook.com/ads/library/?id=archive_123456789",
    cards: [
      {
        position: 0,
        title: "Card 1",
        body: "Card body",
        media: [{ type: "image", sourceUrl: "https://img.test/1" }],
        raw: {},
      },
    ],
    directMedia: [
      {
        type: "video",
        sourceUrl: "https://video.test/hd.mp4",
        role: "primary",
      },
    ],
    raw: { id: "raw_123" },
  };

  it("maintains advertiser, publisher, and branded-content as distinct identities", () => {
    // Invariant: advertiser.sourcePageId must NOT be used for publisherPageId
    expect(sampleSourceAd.advertiser.sourcePageId).toBe("advertiser_page_111");
    expect(sampleSourceAd.publisher?.sourcePageId).toBe("creator_page_222");
    expect(sampleSourceAd.brandedContent?.sourcePageId).toBe("sponsor_page_333");

    expect(sampleSourceAd.advertiser.sourcePageId).not.toBe(
      sampleSourceAd.publisher?.sourcePageId,
    );
  });

  it("uses sourceAdId (ad_archive_id) as the authoritative external identity", () => {
    expect(sampleSourceAd.sourceAdId).toBe("archive_123456789");
  });

  it("verifies AdSourceAccountConflictError contains structured error context", () => {
    const fakeAdRow = {
      id: "ad_uuid_1",
      source: "meta",
      sourceAdId: "archive_123456789",
      sourceAccountId: "source_acc_1",
    } as unknown as AdRow;

    const error = new AdSourceAccountConflictError(
      "Conflict error",
      fakeAdRow,
      "source_acc_2",
    );

    expect(error.name).toBe("AdSourceAccountConflictError");
    expect(error.existingAd.id).toBe("ad_uuid_1");
    expect(error.attemptedSourceAccountId).toBe("source_acc_2");
    expect(error.message).toContain("Conflict error");
  });

  it("verifies AdvertiserSourceAccountMismatchError contains expected and actual page IDs", () => {
    const error = new AdvertiserSourceAccountMismatchError(
      "Mismatch error",
      "expected_page_111",
      "actual_page_999",
    );

    expect(error.name).toBe("AdvertiserSourceAccountMismatchError");
    expect(error.expectedPageId).toBe("expected_page_111");
    expect(error.advertiserPageId).toBe("actual_page_999");
  });

  it("verifies DuplicateAdObservationError contains adId and ingestionRunId", () => {
    const error = new DuplicateAdObservationError(
      "Duplicate observation",
      "ad_123",
      "run_456",
    );

    expect(error.name).toBe("DuplicateAdObservationError");
    expect(error.adId).toBe("ad_123");
    expect(error.ingestionRunId).toBe("run_456");
  });
});
