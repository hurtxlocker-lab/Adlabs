import { describe, expect, it } from "vitest";
import {
  parseDiscoveryFiltersFromParams,
  parseSortFromParams,
  buildDiscoveryFilterParams,
  clearDiscoveryFilterParam,
  clearAllDiscoveryFilterParams,
  euReachBandToFilterRange,
  reuseBandToFilterRange,
  currentEuReachBandKey,
  DISCOVERY_URL_PARAMS,
} from "../utils/url-filters";

// ---------------------------------------------------------------------------
// Helper: build URLSearchParams from plain object
// ---------------------------------------------------------------------------
function sp(obj: Record<string, string>): URLSearchParams {
  return new URLSearchParams(obj);
}

describe("URL Filter Codec — parseDiscoveryFiltersFromParams", () => {
  it("returns empty filter for empty params", () => {
    const f = parseDiscoveryFiltersFromParams(sp({}));
    expect(Object.keys(f)).toHaveLength(0);
  });

  it("parses format (mediaTypes)", () => {
    const f = parseDiscoveryFiltersFromParams(sp({ format: "VIDEO,IMAGE" }));
    expect(f.mediaTypes).toEqual(["VIDEO", "IMAGE"]);
  });

  it("parses format — normalizes to uppercase", () => {
    const f = parseDiscoveryFiltersFromParams(sp({ format: "video" }));
    expect(f.mediaTypes).toEqual(["VIDEO"]);
  });

  it("parses shape (shapeFamilies)", () => {
    const f = parseDiscoveryFiltersFromParams(sp({ shape: "portrait,square" }));
    expect(f.shapeFamilies).toEqual(["portrait", "square"]);
  });

  it("parses reached (reachedCountries) — uppercased", () => {
    const f = parseDiscoveryFiltersFromParams(sp({ reached: "es,FR" }));
    expect(f.reachedCountries).toEqual(["ES", "FR"]);
  });

  it("parses running_min and running_max", () => {
    const f = parseDiscoveryFiltersFromParams(sp({ running_min: "7", running_max: "30" }));
    expect(f.runningMinDays).toBe(7);
    expect(f.runningMaxDays).toBe(30);
  });

  it("parses reuse_min and reuse_max", () => {
    const f = parseDiscoveryFiltersFromParams(sp({ reuse_min: "2", reuse_max: "3" }));
    expect(f.exactCreativeReuseMin).toBe(2);
    expect(f.exactCreativeReuseMax).toBe(3);
  });

  it("parses has_eu=true → hasEuTransparencyEvidence=true", () => {
    const f = parseDiscoveryFiltersFromParams(sp({ has_eu: "true" }));
    expect(f.hasEuTransparencyEvidence).toBe(true);
  });

  it("parses has_uk=true → hasUkTransparencyEvidence=true", () => {
    const f = parseDiscoveryFiltersFromParams(sp({ has_uk: "true" }));
    expect(f.hasUkTransparencyEvidence).toBe(true);
  });

  it("parses eu_reach_min and eu_reach_max", () => {
    const f = parseDiscoveryFiltersFromParams(sp({ eu_reach_min: "10000", eu_reach_max: "50000" }));
    expect(f.euReachMin).toBe(10000);
    expect(f.euReachMax).toBe(50000);
  });

  it("parses active=true", () => {
    const f = parseDiscoveryFiltersFromParams(sp({ active: "true" }));
    expect(f.isActive).toBe(true);
  });

  it("parses active=false", () => {
    const f = parseDiscoveryFiltersFromParams(sp({ active: "false" }));
    expect(f.isActive).toBe(false);
  });

  it("parses brand UUIDs (csv)", () => {
    const id1 = "11111111-1111-1111-1111-111111111111";
    const id2 = "22222222-2222-2222-2222-222222222222";
    const f = parseDiscoveryFiltersFromParams(sp({ brand: `${id1},${id2}` }));
    expect(f.brandIds).toEqual([id1, id2]);
  });

  it("parses sort", () => {
    const sort = parseSortFromParams(sp({ sort: "EU_REACH_DESC" }));
    expect(sort).toBe("EU_REACH_DESC");
  });

  it("returns undefined sort for unknown value", () => {
    const sort = parseSortFromParams(sp({ sort: "BOGUS_SORT" }));
    expect(sort).toBeUndefined();
  });

  it("ignores invalid running_min (non-numeric)", () => {
    const f = parseDiscoveryFiltersFromParams(sp({ running_min: "abc" }));
    expect(f.runningMinDays).toBeUndefined();
  });

  it("ignores negative values for positive-only params", () => {
    const f = parseDiscoveryFiltersFromParams(sp({ eu_reach_min: "-100" }));
    expect(f.euReachMin).toBeUndefined();
  });

  it("parses platform (publisherPlatforms)", () => {
    const f = parseDiscoveryFiltersFromParams(sp({ platform: "FACEBOOK,INSTAGRAM" }));
    expect(f.publisherPlatforms).toEqual(["FACEBOOK", "INSTAGRAM"]);
  });

  it("parses page_category", () => {
    const f = parseDiscoveryFiltersFromParams(sp({ page_category: "Health/beauty,E-commerce" }));
    expect(f.pageCategories).toEqual(["Health/beauty", "E-commerce"]);
  });

  it("parses ig_followers_min", () => {
    const f = parseDiscoveryFiltersFromParams(sp({ ig_followers_min: "50000" }));
    expect(f.instagramFollowersMin).toBe(50000);
  });
});

describe("URL Filter Codec — buildDiscoveryFilterParams", () => {
  it("builds empty params for empty filter", () => {
    const params = buildDiscoveryFilterParams({});
    expect(params.toString()).toBe("");
  });

  it("round-trips format", () => {
    const params = buildDiscoveryFilterParams({ mediaTypes: ["VIDEO"] });
    expect(params.get("format")).toBe("VIDEO");
    const f = parseDiscoveryFiltersFromParams(params);
    expect(f.mediaTypes).toEqual(["VIDEO"]);
  });

  it("dedupes and sorts format array", () => {
    const params = buildDiscoveryFilterParams({ mediaTypes: ["IMAGE", "VIDEO", "IMAGE"] });
    expect(params.get("format")).toBe("IMAGE,VIDEO");
  });

  it("round-trips reached countries (uppercased, sorted)", () => {
    const params = buildDiscoveryFilterParams({ reachedCountries: ["FR", "ES", "ES"] });
    expect(params.get("reached")).toBe("ES,FR");
  });

  it("round-trips boolean active filter", () => {
    const params = buildDiscoveryFilterParams({ isActive: true });
    expect(params.get("active")).toBe("true");
  });

  it("omits RECENTLY_SEEN (default sort)", () => {
    const params = buildDiscoveryFilterParams({}, "RECENTLY_SEEN");
    expect(params.has("sort")).toBe(false);
  });

  it("encodes non-default sort", () => {
    const params = buildDiscoveryFilterParams({}, "EU_REACH_DESC");
    expect(params.get("sort")).toBe("EU_REACH_DESC");
  });

  it("round-trips EU reach range", () => {
    const params = buildDiscoveryFilterParams({ euReachMin: 10000, euReachMax: 50000 });
    expect(params.get("eu_reach_min")).toBe("10000");
    expect(params.get("eu_reach_max")).toBe("50000");
    const f = parseDiscoveryFiltersFromParams(params);
    expect(f.euReachMin).toBe(10000);
    expect(f.euReachMax).toBe(50000);
  });

  it("round-trips brand UUIDs", () => {
    const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const params = buildDiscoveryFilterParams({ brandIds: [id] });
    const f = parseDiscoveryFiltersFromParams(params);
    expect(f.brandIds).toEqual([id]);
  });
});

describe("URL Filter Codec — clear", () => {
  it("clearDiscoveryFilterParam removes individual key", () => {
    const current = sp({ format: "VIDEO", active: "true" });
    const next = clearDiscoveryFilterParam(current, "format");
    expect(next.has("format")).toBe(false);
    expect(next.get("active")).toBe("true");
  });

  it("clearAllDiscoveryFilterParams returns empty params", () => {
    const next = clearAllDiscoveryFilterParams();
    expect(next.toString()).toBe("");
  });
});

describe("Band helper utilities", () => {
  it("euReachBandToFilterRange: 10K_50K → { euReachMin: 10000, euReachMax: 50000 }", () => {
    const range = euReachBandToFilterRange("10K_50K");
    expect(range.euReachMin).toBe(10000);
    expect(range.euReachMax).toBe(50000);
  });

  it("euReachBandToFilterRange: LT_1K → no euReachMin (0 is omitted)", () => {
    const range = euReachBandToFilterRange("LT_1K");
    expect(range.euReachMin).toBeUndefined();
    expect(range.euReachMax).toBe(1000);
  });

  it("euReachBandToFilterRange: 100K_PLUS → euReachMin=100000, no max", () => {
    const range = euReachBandToFilterRange("100K_PLUS");
    expect(range.euReachMin).toBe(100000);
    expect(range.euReachMax).toBeUndefined();
  });

  it("reuseBandToFilterRange: 2_3 → min=2, max=3", () => {
    const range = reuseBandToFilterRange("2_3");
    expect(range.exactCreativeReuseMin).toBe(2);
    expect(range.exactCreativeReuseMax).toBe(3);
  });

  it("currentEuReachBandKey: identifies 10K_50K band from filter", () => {
    const key = currentEuReachBandKey({ euReachMin: 10000, euReachMax: 50000 });
    expect(key).toBe("10K_50K");
  });

  it("currentEuReachBandKey: returns null for non-band range", () => {
    const key = currentEuReachBandKey({ euReachMin: 1234, euReachMax: 5678 });
    expect(key).toBeNull();
  });
});

describe("DISCOVERY_URL_PARAMS — stable contract", () => {
  it("all expected URL params are defined", () => {
    expect(DISCOVERY_URL_PARAMS.brand).toBe("brand");
    expect(DISCOVERY_URL_PARAMS.format).toBe("format");
    expect(DISCOVERY_URL_PARAMS.shape).toBe("shape");
    expect(DISCOVERY_URL_PARAMS.reached).toBe("reached");
    expect(DISCOVERY_URL_PARAMS.hasEu).toBe("has_eu");
    expect(DISCOVERY_URL_PARAMS.hasUk).toBe("has_uk");
    expect(DISCOVERY_URL_PARAMS.euReachMin).toBe("eu_reach_min");
    expect(DISCOVERY_URL_PARAMS.euReachMax).toBe("eu_reach_max");
    expect(DISCOVERY_URL_PARAMS.sort).toBe("sort");
  });
});
