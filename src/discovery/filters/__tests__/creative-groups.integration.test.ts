import { describe, expect, it } from "vitest";
import { queryDiscoveryCreatives, queryDiscoveryFacets } from "../index";

describe("Phase 4F — Exact Creative Grouping & Diversity Integration Tests", () => {
  it("groups ads by exact (brand_id, representative_media_sha256) before pagination", async () => {
    const result = await queryDiscoveryCreatives({ pageSize: 50 });

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.totalCreativesCount).toBeGreaterThan(0);
    expect(result.totalCanonicalAdsCount).toBeGreaterThanOrEqual(result.totalCreativesCount);

    // Verify all returned items have valid group identity and representative ad
    for (const item of result.items) {
      expect(item.groupKey).toBeDefined();
      expect(item.brandId).toBeDefined();
      expect(item.brandName).toBeDefined();
      expect(item.representativeAdId).toBeDefined();
      expect(item.siblingAdIds.length).toBeGreaterThanOrEqual(1);
      expect(item.exactReuseCount).toBe(item.siblingAdIds.length);
    }
  });

  it("produces brand-diverse explore ordering in default mode", async () => {
    const result = await queryDiscoveryCreatives({ sort: "EXPLORE", pageSize: 20 });
    const first10Brands = result.items.slice(0, 10).map((x) => x.brandId);
    const uniqueBrands = new Set(first10Brands);

    // In explore mode, distinct brands should dominate the first 10 results
    expect(uniqueBrands.size).toBe(first10Brands.length);
  });

  it("preserves strict analytical ordering when RECENTLY_SEEN is selected", async () => {
    const result = await queryDiscoveryCreatives({ sort: "RECENTLY_SEEN", pageSize: 20 });

    for (let i = 1; i < result.items.length; i++) {
      const prev = result.items[i - 1].maxLastSeenAt.getTime();
      const curr = result.items[i].maxLastSeenAt.getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  it("computes grouped facet counts reflecting distinct creative groups", async () => {
    const facets = await queryDiscoveryFacets({ filters: {} });

    expect(facets.mediaTypes.length).toBeGreaterThan(0);
    const totalMediaCreatives = facets.mediaTypes.reduce((acc, x) => acc + x.count, 0);

    // Grouped facet counts should represent creative groups
    expect(totalMediaCreatives).toBeGreaterThan(0);
  });
});
