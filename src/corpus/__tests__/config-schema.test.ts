import { describe, expect, it } from "vitest";
import {
  CandidateBatchConfigSchema,
  CandidateBrandSampleSchema,
} from "../config-schema";

describe("Corpus Sampling Config Validation", () => {
  it("validates valid candidate sample config with Meta Ad Library URL", () => {
    const valid = {
      brand: "Dot & Key",
      url: "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=IN&view_all_page_id=123",
      limit: 6,
    };
    const parsed = CandidateBrandSampleSchema.parse(valid);
    expect(parsed.brand).toBe("Dot & Key");
    expect(parsed.limit).toBe(6);
  });

  it("applies default limit of 6 when limit is omitted", () => {
    const valid = {
      brand: "Dot & Key",
      url: "https://www.facebook.com/ads/library/?view_all_page_id=123",
    };
    const parsed = CandidateBrandSampleSchema.parse(valid);
    expect(parsed.limit).toBe(6);
  });

  it("rejects non-Ad-Library Facebook page URLs", () => {
    expect(() =>
      CandidateBrandSampleSchema.parse({
        brand: "Dot & Key",
        url: "https://www.facebook.com/dotandkey",
        limit: 6,
      }),
    ).toThrow(/facebook\.com\/ads\/library\//);
  });

  it("rejects limits outside 1..10", () => {
    expect(() =>
      CandidateBrandSampleSchema.parse({
        brand: "Dot & Key",
        url: "https://www.facebook.com/ads/library/?view_all_page_id=123",
        limit: 0,
      }),
    ).toThrow();

    expect(() =>
      CandidateBrandSampleSchema.parse({
        brand: "Dot & Key",
        url: "https://www.facebook.com/ads/library/?view_all_page_id=123",
        limit: 15,
      }),
    ).toThrow();
  });

  it("rejects invalid URLs or empty brand names", () => {
    expect(() =>
      CandidateBrandSampleSchema.parse({
        brand: "",
        url: "https://www.facebook.com/ads/library/?view_all_page_id=123",
      }),
    ).toThrow();

    expect(() =>
      CandidateBrandSampleSchema.parse({
        brand: "Brand",
        url: "not-a-url",
      }),
    ).toThrow();
  });

  it("validates a batch array with multiple brands", () => {
    const batch = [
      {
        brand: "Brand A",
        url: "https://facebook.com/ads/library/?view_all_page_id=1",
        limit: 5,
      },
      {
        brand: "Brand B",
        url: "https://facebook.com/ads/library/?view_all_page_id=2",
      },
    ];
    const parsed = CandidateBatchConfigSchema.parse(batch);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].limit).toBe(5);
    expect(parsed[1].limit).toBe(6);
  });
});
