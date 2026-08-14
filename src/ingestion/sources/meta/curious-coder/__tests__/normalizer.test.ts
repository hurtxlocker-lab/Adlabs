import { describe, expect, it } from "vitest";
import { parseCuriousCoderItem } from "../parser";
import { normalizeCuriousCoderAd, parseProviderDate } from "../normalizer";

import videoAdFixture from "../__fixtures__/video-ad.json";
import brandedCreatorFixture from "../__fixtures__/branded-creator-ad.json";
import dcoImageCardsFixture from "../__fixtures__/dco-image-cards-ad.json";
import dcoMixedCardsFixture from "../__fixtures__/dco-mixed-cards-ad.json";

describe("Curious Coder Normalizer", () => {
  describe("A. Normal Video Fixture", () => {
    it("should normalize video ad fixture correctly", () => {
      const parsed = parseCuriousCoderItem(videoAdFixture);
      const normalized = normalizeCuriousCoderAd(parsed.data, parsed.raw);

      // Identity
      expect(normalized.source).toBe("meta");
      expect(normalized.sourceAdId).toBe("10192837465");
      expect(normalized.sourceCollationId).toBe("88991122");
      expect(normalized.sourceCollationCount).toBe(3);

      // Advertiser & Publisher
      expect(normalized.advertiser.sourcePageId).toBe("10982347102");
      expect(normalized.advertiser.name).toBe("Mamaearth India");
      expect(normalized.publisher?.sourcePageId).toBe("10982347102");
      expect(normalized.publisher?.name).toBe("Mamaearth India");
      expect(normalized.brandedContent).toBeNull();

      // Copy & Format
      expect(normalized.displayFormat).toBe("VIDEO");
      expect(normalized.primaryText).toContain("Vitamin C Daily Glow Serum");
      expect(normalized.headline).toBe("Shop Now for 20% Off | Natural & Toxin-Free");
      expect(normalized.description).toBe("Dermatologically tested for all Indian skin types.");
      expect(normalized.ctaText).toBe("Shop Now");
      expect(normalized.ctaType).toBe("SHOP_NOW");
      expect(normalized.destinationUrl).toContain("mamaearth.example.test");

      // Platforms (Preserving original casing)
      expect(normalized.publisherPlatforms).toEqual([
        "facebook",
        "instagram",
        "audience_network",
      ]);

      // Dates & Active
      expect(normalized.platformStartAt).toEqual(new Date(1720000000 * 1000));
      expect(normalized.sourceReportedEndAt).toEqual(new Date(1722000000 * 1000));
      expect(normalized.active).toBe(true);

      // Media: HD preferred over SD + preview preserved
      expect(normalized.directMedia).toHaveLength(2);
      expect(normalized.directMedia[0]).toEqual({
        type: "video",
        sourceUrl: "https://media.example.test/videos/video-001-hd.mp4",
        role: "primary",
      });
      expect(normalized.directMedia[1]).toEqual({
        type: "video_preview",
        sourceUrl: "https://media.example.test/images/video-001-preview.jpg",
        role: "preview",
      });

      // Cards
      expect(normalized.cards).toEqual([]);
      expect(normalized.raw).toBe(videoAdFixture);
    });
  });

  describe("B. Branded Creator Fixture & Identity Separation", () => {
    it("should preserve advertiser, publisher, and branded content sponsor independently", () => {
      const parsed = parseCuriousCoderItem(brandedCreatorFixture);
      const normalized = normalizeCuriousCoderAd(parsed.data, parsed.raw);

      // Advertiser is the tracked brand account
      expect(normalized.advertiser.sourcePageId).toBe("10982347102");
      expect(normalized.advertiser.name).toBe("Mamaearth India");

      // Publisher is the creator / influencer page
      expect(normalized.publisher?.sourcePageId).toBe("50982347199");
      expect(normalized.publisher?.name).toBe("Pooja Beauty Secrets");

      // Branded content sponsor is the brand
      expect(normalized.brandedContent?.sourcePageId).toBe("10982347102");
      expect(normalized.brandedContent?.name).toBe("Mamaearth India");

      // Verified distinct identities (tracked advertiser != creator publisher)
      expect(normalized.advertiser.sourcePageId).not.toBe(normalized.publisher?.sourcePageId);
      expect(normalized.publisher?.sourcePageId).not.toBe(normalized.brandedContent?.sourcePageId);
    });
  });

  describe("C. DCO Image-Card Fixture", () => {
    it("should preserve parent template copy and extract independent child cards", () => {
      const parsed = parseCuriousCoderItem(dcoImageCardsFixture);
      const normalized = normalizeCuriousCoderAd(parsed.data, parsed.raw);

      // Parent copy retains raw template tags without interpolation
      expect(normalized.displayFormat).toBe("DCO");
      expect(normalized.primaryText).toBe(
        "{{product.brand}} Monsoon Skincare Sale. {{product.description}}",
      );
      expect(normalized.headline).toBe("{{product.name}}");

      // No direct media at parent level
      expect(normalized.directMedia).toEqual([]);

      // 3 child cards
      expect(normalized.cards).toHaveLength(3);

      // Card 0
      expect(normalized.cards[0].position).toBe(0);
      expect(normalized.cards[0].title).toBe("Aloe Vera Gel 300ml - ₹299");
      expect(normalized.cards[0].body).toBe(
        "Daily hydration with natural Aloe Vera & Ashwagandha.",
      );
      expect(normalized.cards[0].media).toHaveLength(1);
      expect(normalized.cards[0].media[0]).toEqual({
        type: "image",
        sourceUrl: "https://media.example.test/images/card-01-aloe.jpg",
        role: "primary",
      });

      // Card 1
      expect(normalized.cards[1].position).toBe(1);
      expect(normalized.cards[1].title).toBe("Ubtan Face Wash 100ml - ₹249");
      expect(normalized.cards[1].media[0].sourceUrl).toContain("card-02-ubtan.jpg");

      // Card 2
      expect(normalized.cards[2].position).toBe(2);
      expect(normalized.cards[2].title).toBe("Onion Hair Oil 200ml - ₹399");
      expect(normalized.cards[2].media[0].sourceUrl).toContain("card-03-onion.jpg");
    });
  });

  describe("D. DCO Mixed-Card Fixture", () => {
    it("should normalize video-card and image-card media correctly without cross-card flattening", () => {
      const parsed = parseCuriousCoderItem(dcoMixedCardsFixture);
      const normalized = normalizeCuriousCoderAd(parsed.data, parsed.raw);

      expect(normalized.cards).toHaveLength(2);

      // Card 0 is a video card
      const videoCard = normalized.cards[0];
      expect(videoCard.position).toBe(0);
      expect(videoCard.title).toBe("Rosemary Anti-Hair Fall Range");
      expect(videoCard.media).toHaveLength(2);
      expect(videoCard.media[0]).toEqual({
        type: "video",
        sourceUrl: "https://media.example.test/videos/card-video-01-hd.mp4",
        role: "primary",
      });
      expect(videoCard.media[1]).toEqual({
        type: "video_preview",
        sourceUrl: "https://media.example.test/images/card-video-01-preview.jpg",
        role: "preview",
      });

      // Card 1 is an image card
      const imageCard = normalized.cards[1];
      expect(imageCard.position).toBe(1);
      expect(imageCard.title).toBe("Rice Water Skin Hydration");
      expect(imageCard.media).toHaveLength(1);
      expect(imageCard.media[0]).toEqual({
        type: "image",
        sourceUrl: "https://media.example.test/images/card-image-02.jpg",
        role: "primary",
      });
    });
  });

  describe("E. Identity & Advertiser Validation", () => {
    it("should strictly use ad_archive_id as sourceAdId regardless of ad_id", () => {
      const item = {
        ad_archive_id: "777888999",
        ad_id: "legacy_ignore_me",
        page_id: "10982347102",
      };
      const parsed = parseCuriousCoderItem(item);
      const normalized = normalizeCuriousCoderAd(parsed.data);
      expect(normalized.sourceAdId).toBe("777888999");
      expect(
        (normalized as unknown as Record<string, unknown>).ad_id,
      ).toBeUndefined();
    });

    it("should fail normalization when top-level advertiser page_id is missing or blank", () => {
      const itemWithoutPageId = {
        ad_archive_id: "11223344",
        page_id: undefined,
        snapshot: {
          page_id: "99887766",
        },
      };
      const parsed = parseCuriousCoderItem(itemWithoutPageId);
      // Must throw an error and NOT produce "" or substitute snapshot.page_id
      expect(() => normalizeCuriousCoderAd(parsed.data)).toThrow(
        /top-level advertiser page_id is missing/i,
      );
    });
  });

  describe("F. Dates & Active Semantics", () => {
    it("should parse epoch timestamps and ISO strings accurately", () => {
      expect(parseProviderDate(1720000000)).toEqual(new Date(1720000000000));
      expect(parseProviderDate(1720000000000)).toEqual(new Date(1720000000000));
      expect(parseProviderDate("2024-07-03T09:46:40.000Z")).toEqual(
        new Date("2024-07-03T09:46:40.000Z"),
      );
    });

    it("should fall back to formatted date string when primary date is null", () => {
      expect(parseProviderDate(null, "2024-07-03T09:46:40.000Z")).toEqual(
        new Date("2024-07-03T09:46:40.000Z"),
      );
      expect(parseProviderDate(undefined, "2024-07-03T09:46:40.000Z")).toEqual(
        new Date("2024-07-03T09:46:40.000Z"),
      );
    });

    it("should return null for unparseable dates defensively", () => {
      expect(parseProviderDate("invalid-date-string", "also-invalid")).toBeNull();
      expect(parseProviderDate(null, null)).toBeNull();
    });

    it("should not derive active state from sourceReportedEndAt", () => {
      const activeWithPastEnd = {
        ad_archive_id: "12345",
        page_id: "10982347102",
        end_date: 100000, // old date in the past
        is_active: true,
      };
      const parsed = parseCuriousCoderItem(activeWithPastEnd);
      const normalized = normalizeCuriousCoderAd(parsed.data);
      expect(normalized.active).toBe(true);
      expect(normalized.sourceReportedEndAt).toEqual(new Date(100000 * 1000));
    });
  });

  describe("G. Platform Merge & Exact Casing Preservation", () => {
    it("should merge and deduplicate platforms while strictly preserving original provider casing", () => {
      const item = {
        ad_archive_id: "12345",
        page_id: "10982347102",
        publisher_platform: "INSTAGRAM",
        publisher_platforms: ["FACEBOOK", "INSTAGRAM", "Audience_Network"],
      };
      const parsed = parseCuriousCoderItem(item);
      const normalized = normalizeCuriousCoderAd(parsed.data);
      // Preserves original casing: INSTAGRAM, FACEBOOK, Audience_Network
      expect(normalized.publisherPlatforms).toEqual([
        "INSTAGRAM",
        "FACEBOOK",
        "Audience_Network",
      ]);
    });
  });

  describe("H. Media Deduplication Boundary", () => {
    it("should deduplicate exact candidate matches (type + url + role) within an ad", () => {
      const itemWithDuplicates = {
        ad_archive_id: "12345",
        page_id: "10982347102",
        snapshot: {
          videos: [
            {
              video_hd_url: "https://media.example.test/video-a.mp4",
              video_preview_image_url: "https://media.example.test/preview.jpg",
            },
            {
              video_hd_url: "https://media.example.test/video-a.mp4",
              video_preview_image_url: "https://media.example.test/preview.jpg",
            },
          ],
        },
      };
      const parsed = parseCuriousCoderItem(itemWithDuplicates);
      const normalized = normalizeCuriousCoderAd(parsed.data);
      expect(normalized.directMedia).toHaveLength(2);
      expect(normalized.directMedia[0].sourceUrl).toBe(
        "https://media.example.test/video-a.mp4",
      );
      expect(normalized.directMedia[1].sourceUrl).toBe(
        "https://media.example.test/preview.jpg",
      );
    });

    it("should NOT deduplicate different URLs even if format/role match", () => {
      const itemWithDistinctUrls = {
        ad_archive_id: "12345",
        page_id: "10982347102",
        snapshot: {
          videos: [
            { video_hd_url: "https://media.example.test/video-01.mp4" },
            { video_hd_url: "https://media.example.test/video-02.mp4" },
          ],
        },
      };
      const parsed = parseCuriousCoderItem(itemWithDistinctUrls);
      const normalized = normalizeCuriousCoderAd(parsed.data);
      expect(normalized.directMedia).toHaveLength(2);
      expect(normalized.directMedia[0].sourceUrl).toBe(
        "https://media.example.test/video-01.mp4",
      );
      expect(normalized.directMedia[1].sourceUrl).toBe(
        "https://media.example.test/video-02.mp4",
      );
    });
  });

  describe("I. Function Purity & Immutability", () => {
    it("should not mutate the input parsed object or raw payload", () => {
      const rawInput = JSON.parse(JSON.stringify(videoAdFixture));
      const parsed = parseCuriousCoderItem(rawInput);
      const clonedParsedData = JSON.parse(JSON.stringify(parsed.data));

      const normalized = normalizeCuriousCoderAd(parsed.data, parsed.raw);
      expect(normalized).toBeDefined();

      expect(parsed.data).toEqual(clonedParsedData);
      expect(rawInput).toEqual(videoAdFixture);
    });
  });

  describe("J. Missing Optional Sections", () => {
    it("should return valid empty arrays when optional media and cards are absent", () => {
      const minimalItem = {
        ad_archive_id: "99887766",
        page_id: "10982347102",
      };
      const parsed = parseCuriousCoderItem(minimalItem);
      const normalized = normalizeCuriousCoderAd(parsed.data);

      expect(normalized.cards).toEqual([]);
      expect(normalized.directMedia).toEqual([]);
      expect(normalized.publisher).toBeNull();
      expect(normalized.brandedContent).toBeNull();
      expect(normalized.primaryText).toBeNull();
      expect(normalized.headline).toBeNull();
    });
  });
});
