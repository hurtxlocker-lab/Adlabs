import { describe, expect, it } from "vitest";
import {
  parseCuriousCoderItem,
  safeParseCuriousCoderItem,
} from "../parser";

import videoAdFixture from "../__fixtures__/video-ad.json";
import brandedCreatorFixture from "../__fixtures__/branded-creator-ad.json";
import dcoImageCardsFixture from "../__fixtures__/dco-image-cards-ad.json";
import dcoMixedCardsFixture from "../__fixtures__/dco-mixed-cards-ad.json";

describe("Curious Coder Provider Parser", () => {
  it("should parse a normal video ad fixture", () => {
    const result = parseCuriousCoderItem(videoAdFixture);
    expect(result.data.ad_archive_id).toBe("10192837465");
    expect(result.data.ad_id).toBeNull();
    expect(result.data.page_name).toBe("Mamaearth India");
    expect(result.data.snapshot?.display_format).toBe("VIDEO");
    expect(result.data.snapshot?.videos?.[0]?.video_hd_url).toContain("video-001-hd.mp4");
    expect(result.raw).toBe(videoAdFixture);
  });

  it("should parse a branded creator partnership fixture with separate publisher and advertiser", () => {
    const result = parseCuriousCoderItem(brandedCreatorFixture);
    expect(result.data.ad_archive_id).toBe("20283746501");
    // Advertiser is tracked brand
    expect(result.data.page_id).toBe("10982347102");
    // Snapshot page_id is the influencer / creator
    expect(result.data.snapshot?.page_id).toBe("50982347199");
    expect(result.data.snapshot?.page_name).toBe("Pooja Beauty Secrets");
    // Branded content sponsor is the brand
    expect(result.data.snapshot?.branded_content?.page_id).toBe("10982347102");
    expect(result.data.snapshot?.branded_content?.page_name).toBe("Mamaearth India");
  });

  it("should parse a DCO image cards fixture with multiple child cards", () => {
    const result = parseCuriousCoderItem(dcoImageCardsFixture);
    expect(result.data.ad_archive_id).toBe("30394857612");
    expect(result.data.snapshot?.display_format).toBe("DCO");
    expect(result.data.snapshot?.body).toContain("{{product.brand}}");
    expect(result.data.snapshot?.cards).toHaveLength(3);
    expect(result.data.snapshot?.cards?.[0]?.title).toBe("Aloe Vera Gel 300ml - ₹299");
    expect(result.data.snapshot?.cards?.[0]?.original_image_url).toContain("card-01-aloe.jpg");
  });

  it("should parse a DCO mixed cards fixture with video cards", () => {
    const result = parseCuriousCoderItem(dcoMixedCardsFixture);
    expect(result.data.ad_archive_id).toBe("40495867723");
    expect(result.data.snapshot?.cards).toHaveLength(2);
    expect(result.data.snapshot?.cards?.[0]?.video_hd_url).toContain("card-video-01-hd.mp4");
    expect(result.data.snapshot?.cards?.[1]?.original_image_url).toContain("card-image-02.jpg");
  });

  describe("ID Safety & Validation", () => {
    it("should accept valid string ad_archive_id", () => {
      const result = parseCuriousCoderItem({
        ad_archive_id: "10192837465",
      });
      expect(result.data.ad_archive_id).toBe("10192837465");
    });

    it("should fail when ad_archive_id is missing", () => {
      const item = {
        ad_id: "12345",
        page_id: "10982347102",
      };
      expect(() => parseCuriousCoderItem(item)).toThrow(/validation failed/i);
      expect(safeParseCuriousCoderItem(item).success).toBe(false);
    });

    it("should fail when ad_archive_id is blank / whitespace-only", () => {
      const item = {
        ad_archive_id: "   \t\n ",
      };
      expect(() => parseCuriousCoderItem(item)).toThrow(/validation failed/i);
      expect(safeParseCuriousCoderItem(item).success).toBe(false);
    });

    it("should fail when ad_archive_id is an unsafe number", () => {
      // 9007199254740993 is 2^53 + 1 (unsafe in JS Number)
      const unsafeItem = {
        ad_archive_id: 9007199254740993,
      };
      expect(() => parseCuriousCoderItem(unsafeItem)).toThrow(/validation failed/i);
      expect(safeParseCuriousCoderItem(unsafeItem).success).toBe(false);

      const floatItem = {
        ad_archive_id: 12345.67,
      };
      expect(() => parseCuriousCoderItem(floatItem)).toThrow(/validation failed/i);
      expect(safeParseCuriousCoderItem(floatItem).success).toBe(false);
    });

    it("should fail when page_id is an unsafe number", () => {
      const unsafeItem = {
        ad_archive_id: "10192837465",
        page_id: 9007199254740993,
      };
      expect(() => parseCuriousCoderItem(unsafeItem)).toThrow(/validation failed/i);
      expect(safeParseCuriousCoderItem(unsafeItem).success).toBe(false);
    });

    it("should fail when snapshot.page_id is an unsafe number", () => {
      const unsafeItem = {
        ad_archive_id: "10192837465",
        snapshot: {
          page_id: 9007199254740993,
        },
      };
      expect(() => parseCuriousCoderItem(unsafeItem)).toThrow(/validation failed/i);
      expect(safeParseCuriousCoderItem(unsafeItem).success).toBe(false);
    });

    it("should fail when collation_id is an unsafe number", () => {
      const unsafeItem = {
        ad_archive_id: "10192837465",
        collation_id: 9007199254740993,
      };
      expect(() => parseCuriousCoderItem(unsafeItem)).toThrow(/validation failed/i);
      expect(safeParseCuriousCoderItem(unsafeItem).success).toBe(false);
    });

    it("should convert safe integer numbers to strings deterministically", () => {
      const safeNumericItem = {
        ad_archive_id: 1019283746,
        page_id: 987654321,
        collation_id: 55443322,
        snapshot: {
          page_id: 11223344,
          branded_content: {
            page_id: 99887766,
          },
        },
      };
      const result = parseCuriousCoderItem(safeNumericItem);
      expect(result.data.ad_archive_id).toBe("1019283746");
      expect(result.data.page_id).toBe("987654321");
      expect(result.data.collation_id).toBe("55443322");
      expect(result.data.snapshot?.page_id).toBe("11223344");
      expect(result.data.snapshot?.branded_content?.page_id).toBe("99887766");
    });

    it("should succeed when ad_id is null, empty, or omitted", () => {
      const itemWithNull = {
        ad_archive_id: "9988776655",
        ad_id: null,
      };
      const resultNull = parseCuriousCoderItem(itemWithNull);
      expect(resultNull.data.ad_archive_id).toBe("9988776655");
      expect(resultNull.data.ad_id).toBeNull();

      const itemOmitted = {
        ad_archive_id: "9988776655",
      };
      const resultOmitted = parseCuriousCoderItem(itemOmitted);
      expect(resultOmitted.data.ad_archive_id).toBe("9988776655");
      expect(resultOmitted.data.ad_id).toBeUndefined();
    });
  });

  describe("Tolerant Provider Handling", () => {
    it("should succeed and tolerate unrelated unknown provider fields (passthrough)", () => {
      const itemWithNoise = {
        ad_archive_id: "1122334455",
        page_id: "10982347102",
        unknown_future_field: "some_value",
        crawler_debug_info: { memory_mb: 256, proxy: "in_datacenter" },
        snapshot: {
          display_format: "IMAGE",
          unseen_meta_tag: 1234,
        },
      };
      const result = parseCuriousCoderItem(itemWithNoise);
      expect(result.data.ad_archive_id).toBe("1122334455");
      expect(
        (result.data as Record<string, unknown>).unknown_future_field,
      ).toBe("some_value");
      expect(result.raw).toBe(itemWithNoise);
    });

    it("should succeed when optional media arrays are missing or empty", () => {
      const minimalItem = {
        ad_archive_id: "5544332211",
        page_id: "10982347102",
        snapshot: {
          display_format: "TEXT",
          body: "Minimal text ad without media.",
        },
      };
      const result = parseCuriousCoderItem(minimalItem);
      expect(result.data.ad_archive_id).toBe("5544332211");
      expect(result.data.snapshot?.videos).toBeUndefined();
      expect(result.data.snapshot?.images).toBeUndefined();
      expect(result.data.snapshot?.cards).toBeUndefined();
    });

    it("should preserve original raw object without mutation", () => {
      const original = {
        ad_archive_id: "8877665544",
        page_id: "10982347102",
        extra: { nested: true },
      };
      const cloned = JSON.parse(JSON.stringify(original));
      const result = parseCuriousCoderItem(original);
      expect(result.raw).toEqual(cloned);
      expect(result.raw).toBe(original);
    });
  });
});
