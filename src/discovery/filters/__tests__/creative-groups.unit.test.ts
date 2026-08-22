import { describe, expect, it } from "vitest";
import { getDiscoveryGroupedSortClauses } from "../sort";
import { parseSortFromParams, buildDiscoveryFilterParams } from "@/features/discover/utils/url-filters";
import { formatRegionalReach } from "@/features/discover/components/gallery/evidence-overlay";

describe("Phase 4F — Exact Creative Discover & Explore Unit Tests", () => {
  describe("Sort Clauses & Explore Diversity", () => {
    it("returns brand_round ascending order for EXPLORE sort", () => {
      const clauses = getDiscoveryGroupedSortClauses("EXPLORE");
      const sqlStrings = clauses.map((c) => JSON.stringify(c));
      
      expect(sqlStrings.some((s) => s.includes("brand_round ASC"))).toBe(true);
      expect(sqlStrings.some((s) => s.includes("max_last_seen_at DESC"))).toBe(true);
      expect(sqlStrings.some((s) => s.includes("representative_ad_id ASC"))).toBe(true);
    });

    it("returns strict analytical ordering without brand_round for RECENTLY_SEEN", () => {
      const clauses = getDiscoveryGroupedSortClauses("RECENTLY_SEEN");
      const sqlStrings = clauses.map((c) => JSON.stringify(c));

      expect(sqlStrings.some((s) => s.includes("brand_round"))).toBe(false);
      expect(sqlStrings.some((s) => s.includes("max_last_seen_at DESC"))).toBe(true);
    });

    it("returns strict analytical ordering for EU_REACH_DESC", () => {
      const clauses = getDiscoveryGroupedSortClauses("EU_REACH_DESC");
      const sqlStrings = clauses.map((c) => JSON.stringify(c));

      expect(sqlStrings.some((s) => s.includes("brand_round"))).toBe(false);
      expect(sqlStrings.some((s) => s.includes("latest_eu_total_reach DESC NULLS LAST"))).toBe(true);
    });
  });

  describe("URL Codec with EXPLORE Sort", () => {
    it("parses EXPLORE as valid sort", () => {
      const sort = parseSortFromParams(new URLSearchParams("sort=EXPLORE"));
      expect(sort).toBe("EXPLORE");
    });

    it("defaults to undefined when sort is omitted in search params", () => {
      const sort = parseSortFromParams(new URLSearchParams());
      expect(sort).toBeUndefined();
    });

    it("omits EXPLORE from URL params when serialized (default sort)", () => {
      const params = buildDiscoveryFilterParams({ mediaTypes: ["VIDEO"] }, "EXPLORE");
      expect(params.get("sort")).toBeNull();
      expect(params.get("format")).toBe("VIDEO");
    });

    it("includes non-default analytical sort in URL params", () => {
      const params = buildDiscoveryFilterParams({ mediaTypes: ["VIDEO"] }, "EU_REACH_DESC");
      expect(params.get("sort")).toBe("EU_REACH_DESC");
    });
  });

  describe("Evidence Policy & Formatting (No Sibling MAX/SUM Inference)", () => {
    it("formats regional reach truthfully without aggregating across siblings", () => {
      expect(formatRegionalReach(24800)).toBe("24.8K");
      expect(formatRegionalReach(BigInt(1200000))).toBe("1.2M");
      expect(formatRegionalReach(null)).toBeNull();
      expect(formatRegionalReach(undefined)).toBeNull();
      expect(formatRegionalReach(0)).toBeNull();
    });
  });
});
