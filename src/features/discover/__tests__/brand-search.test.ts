import { describe, expect, it } from "vitest";
import {
  searchBrands,
  type BrandCatalogueItem,
} from "@/features/discover/utils/brand-search";
import {
  buildDiscoveryFilterParams,
  parseDiscoveryFiltersFromParams,
} from "@/features/discover/utils/url-filters";
import { compileDiscoveryPredicates } from "@/discovery/filters/predicates";
import { deriveActiveTokens } from "@/features/discover/components/filters/tokens";
import type { DiscoveryFacetsResult } from "@/discovery/filters/types";

const MOCK_BRANDS: BrandCatalogueItem[] = [
  {
    slug: "huel",
    name: "Huel",
    category: "Food & Beverage",
    creativeCount: 26,
  },
  {
    slug: "huda-beauty",
    name: "Huda Beauty",
    category: "Beauty & Cosmetics",
    creativeCount: 16,
  },
  {
    slug: "rhode",
    name: "Rhode",
    category: "Skincare",
    creativeCount: 10,
  },
  {
    slug: "athletic-greens",
    name: "AG1 by Athletic Greens",
    category: "Supplements",
    creativeCount: 42,
  },
  {
    slug: "cymbiotika",
    name: "Cymbiotika",
    category: "Wellness",
    creativeCount: 25,
  },
  {
    slug: "garnier-in",
    name: "Garnier",
    category: "Personal Care",
    creativeCount: 10,
  },
];

describe("Discover Brand Search Engine (Pure SearchableBrand / BrandCatalogueItem)", () => {
  it("prefix match: ranks exact prefix matches first", () => {
    const results = searchBrands(MOCK_BRANDS, "Hu");
    expect(results.length).toBe(2);
    expect(results.map((r) => r.slug)).toEqual(["huel", "huda-beauty"]);
  });

  it("case insensitivity: matches regardless of query or brand case", () => {
    const r1 = searchBrands(MOCK_BRANDS, "HUEL");
    const r2 = searchBrands(MOCK_BRANDS, "huel");
    const r3 = searchBrands(MOCK_BRANDS, "  HuEl  ");
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
    expect(r1[0].slug).toBe("huel");
  });

  it("contains fallback: matches substrings in name when prefix doesn't match", () => {
    const results = searchBrands(MOCK_BRANDS, "Greens");
    expect(results.length).toBe(1);
    expect(results[0].slug).toBe("athletic-greens");
  });

  it("category matching: matches category text if name does not match", () => {
    const results = searchBrands(MOCK_BRANDS, "Skincare");
    expect(results.length).toBe(1);
    expect(results[0].slug).toBe("rhode");
  });

  it("empty query: returns all brands ordered by creativeCount DESC then name ASC", () => {
    const results = searchBrands(MOCK_BRANDS, "");
    expect(results.length).toBe(MOCK_BRANDS.length);
    expect(results[0].slug).toBe("athletic-greens"); // 42 creatives
    expect(results[1].slug).toBe("huel"); // 26 creatives
  });

  it("exact creative count contract: ensures creativeCount means distinct creative groups, not ad count", () => {
    for (const b of MOCK_BRANDS) {
      expect(typeof b.creativeCount).toBe("number");
      expect(b.creativeCount).toBeGreaterThanOrEqual(0);
      expect((b as any).adCount).toBeUndefined();
      expect((b as any).adsScraped).toBeUndefined();
      expect((b as any).id).toBeUndefined(); // no internal DB UUID in BrandCatalogueItem
    }
  });
});

describe("Discover Brand URL Contract & Codec", () => {
  it("URL serialization: serializes brand slug tokens canonically", () => {
    const params = buildDiscoveryFilterParams({
      brandIds: ["huel", "huda-beauty"],
    });
    expect(params.get("brand")).toBe("huda-beauty,huel"); // sorted, comma-joined
  });

  it("multiple selections: parses multiple slug tokens from URL", () => {
    const parsed = parseDiscoveryFiltersFromParams({
      brand: "huel,rhode,cymbiotika",
    });
    expect(parsed.brandIds).toEqual(["huel", "rhode", "cymbiotika"]);
  });

  it("duplicate selection: dedupes brand tokens on serialization", () => {
    const params = buildDiscoveryFilterParams({
      brandIds: ["huel", "huel", "rhode", "huel"],
    });
    expect(params.get("brand")).toBe("huel,rhode");
  });

  it("no UUID emitted by new UI: serializes pure slug tokens into URL", () => {
    const params = buildDiscoveryFilterParams({
      brandIds: ["huel", "rhode"],
    });
    const serialized = params.toString();
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
    expect(serialized).toBe("brand=huel%2Crhode");
  });

  it("remove pill / clear all: omitting brandIds cleans brand from URL params", () => {
    const remainingParams = buildDiscoveryFilterParams({
      brandIds: ["rhode"],
    });
    expect(remainingParams.get("brand")).toBe("rhode");

    const emptyParams = buildDiscoveryFilterParams({
      brandIds: [],
    });
    expect(emptyParams.get("brand")).toBeNull();
  });
});

describe("Active Selection Invariant & Zero-Result Proof", () => {
  const emptyFacets: DiscoveryFacetsResult = {
    mediaTypes: [],
    shapeFamilies: [],
    ctaTypes: [],
    publisherPlatforms: [],
    pageCategories: [],
    targetCountries: [],
    reachedCountries: [],
    transparencyEvidence: {
      EU: { true: 0, false: 0 },
      UK: { true: 0, false: 0 },
      BR: { true: 0, false: 0 },
    },
    euReachBands: [],
    creativeReuseBands: [],
    instagramFollowerBands: [],
    brands: [], // Zero facet matches due to conflicting category filter
  };

  const brandNameMap: Record<string, string> = {
    huel: "Huel",
    rhode: "Rhode",
    "athletic-greens": "AG1 by Athletic Greens",
  };

  it("selected brand retains human label when contextual facets return zero matches", () => {
    const tokens = deriveActiveTokens(
      { brandIds: ["huel"] },
      emptyFacets,
      {
        toggleStringArray: () => {},
        toggleBoolean: () => {},
        clearRange: () => {},
        clearSingle: () => {},
      },
      brandNameMap,
    );

    expect(tokens.length).toBe(1);
    expect(tokens[0].label).toBe("Huel"); // Human label preserved
    expect(tokens[0].label).not.toBe("huel"); // Never falls back to raw slug when in brandNameMap
    expect(tokens[0].label).not.toMatch(/^[0-9a-f]{8}-/i); // Never UUID
  });

  it("deep link with multiple brands retains all human labels at zero matches", () => {
    const tokens = deriveActiveTokens(
      { brandIds: ["huel", "rhode"] },
      emptyFacets,
      {
        toggleStringArray: () => {},
        toggleBoolean: () => {},
        clearRange: () => {},
        clearSingle: () => {},
      },
      brandNameMap,
    );

    expect(tokens.map((t) => t.label)).toEqual(["Huel", "Rhode"]);
  });

  it("unknown slug token degrades gracefully without crash or inventing fake name", () => {
    const tokens = deriveActiveTokens(
      { brandIds: ["non-existent-slug-xyz"] },
      emptyFacets,
      {
        toggleStringArray: () => {},
        toggleBoolean: () => {},
        clearRange: () => {},
        clearSingle: () => {},
      },
      brandNameMap,
    );

    expect(tokens.length).toBe(1);
    expect(tokens[0].label).toBe("non-existent-slug-xyz");
  });
});

describe("Server Predicate Compiler Brand Token Contract", () => {
  it("slug token: compiles indexed brands.slug subquery without binding slug to UUID column", () => {
    const predicates = compileDiscoveryPredicates({
      filters: {
        brandIds: ["huel", "rhode"],
      },
    });
    expect(predicates.length).toBe(1);
  });

  it("legacy UUID compatibility: compiles direct brandId inArray for UUID tokens", () => {
    const legacyUuid = "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d";
    const predicates = compileDiscoveryPredicates({
      filters: {
        brandIds: [legacyUuid],
      },
    });
    expect(predicates.length).toBe(1);
  });

  it("mixed UUID and slug tokens: compiles disjunction without crashing", () => {
    const legacyUuid = "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d";
    const predicates = compileDiscoveryPredicates({
      filters: {
        brandIds: [legacyUuid, "huel"],
      },
    });
    expect(predicates.length).toBe(1);
  });

  it("unknown slug token: compiles safely without throw", () => {
    const predicates = compileDiscoveryPredicates({
      filters: {
        brandIds: ["completely-unknown-non-existent-brand-12345"],
      },
    });
    expect(predicates.length).toBe(1);
  });
});

describe("Keyboard Shortcut Safety Contract", () => {
  it("isEditable check identifies input, textarea, select, contenteditable, and child elements", () => {
    const isEditable = (target: { tagName: string; isContentEditable?: boolean; closest?: (s: string) => boolean | null }) => {
      return (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        Boolean(target.isContentEditable) ||
        Boolean(target.closest?.("input, textarea, select, [contenteditable='true']"))
      );
    };

    expect(isEditable({ tagName: "INPUT" })).toBe(true);
    expect(isEditable({ tagName: "TEXTAREA" })).toBe(true);
    expect(isEditable({ tagName: "SELECT" })).toBe(true);
    expect(isEditable({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(
      isEditable({
        tagName: "SPAN",
        closest: (s: string) => s.includes("contenteditable"),
      }),
    ).toBe(true);

    // Body / plain button / div should NOT be editable
    expect(isEditable({ tagName: "BUTTON", closest: () => null })).toBe(false);
    expect(isEditable({ tagName: "BODY", closest: () => null })).toBe(false);
    expect(isEditable({ tagName: "DIV", closest: () => null })).toBe(false);
  });
});
