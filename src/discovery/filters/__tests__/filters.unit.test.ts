import { describe, expect, it } from "vitest";
import { normalizeDiscoveryFilters } from "../normalize";
import { compileDiscoveryPredicates } from "../predicates";
import { getDiscoverySortClauses } from "../sort";
import {
  decodeDiscoveryCursor,
  encodeDiscoveryCursor,
  DiscoveryCursorError,
} from "../cursor";
import { discoveryFilterInputSchema } from "../contract";

describe("Discovery Filters — Unit Tests", () => {
  describe("Zod Contract & Normalization", () => {
    it("normalizes empty arrays and whitespace strings to undefined", () => {
      const normalized = normalizeDiscoveryFilters({
        brandIds: [],
        mediaTypes: ["  ", ""],
        targetCountries: [],
        ctaTypes: [],
      });

      expect(normalized.brandIds).toBeUndefined();
      expect(normalized.mediaTypes).toBeUndefined();
      expect(normalized.targetCountries).toBeUndefined();
      expect(normalized.ctaTypes).toBeUndefined();
    });

    it("canonicalizes country codes to uppercase, deduped, sorted 2-letter strings", () => {
      const normalized = normalizeDiscoveryFilters({
        targetCountries: ["es", "FR", "es", "de"],
        reachedCountries: ["gb", "GB", "it"],
      });

      expect(normalized.targetCountries).toEqual(["DE", "ES", "FR"]);
      expect(normalized.reachedCountries).toEqual(["GB", "IT"]);
    });

    it("rejects invalid country codes that are not 2 letters", () => {
      expect(() =>
        discoveryFilterInputSchema.parse({
          targetCountries: ["SPAIN"],
        }),
      ).toThrow();
    });

    it("rejects contradictory min > max ranges", () => {
      // Duration
      expect(() =>
        discoveryFilterInputSchema.parse({
          videoDurationMinMs: 5000,
          videoDurationMaxMs: 2000,
        }),
      ).toThrow(/videoDurationMinMs/);

      // Copy length chars
      expect(() =>
        discoveryFilterInputSchema.parse({
          copyLengthMinChars: 100,
          copyLengthMaxChars: 50,
        }),
      ).toThrow(/copyLengthMinChars/);

      // Copy length words
      expect(() =>
        discoveryFilterInputSchema.parse({
          copyLengthMinWords: 20,
          copyLengthMaxWords: 10,
        }),
      ).toThrow(/copyLengthMinWords/);

      // Creative reuse
      expect(() =>
        discoveryFilterInputSchema.parse({
          exactCreativeReuseMin: 5,
          exactCreativeReuseMax: 2,
        }),
      ).toThrow(/exactCreativeReuseMin/);

      // Reach
      expect(() =>
        discoveryFilterInputSchema.parse({
          euReachMin: 100000,
          euReachMax: 50000,
        }),
      ).toThrow(/euReachMin/);

      // Age
      expect(() =>
        discoveryFilterInputSchema.parse({
          euTargetAgeMin: 45,
          euTargetAgeMax: 25,
        }),
      ).toThrow(/euTargetAgeMin/);
    });

    it("rejects negative metrics", () => {
      expect(() =>
        discoveryFilterInputSchema.parse({
          runningMinDays: -1,
        }),
      ).toThrow();

      expect(() =>
        discoveryFilterInputSchema.parse({
          videoDurationMinMs: -500,
        }),
      ).toThrow();

      expect(() =>
        discoveryFilterInputSchema.parse({
          exactCreativeReuseMin: 0, // minimum is 1
        }),
      ).toThrow();
    });

    it("enforces 0..120 age bounds", () => {
      expect(() =>
        discoveryFilterInputSchema.parse({
          euTargetAgeMin: -5,
        }),
      ).toThrow();

      expect(() =>
        discoveryFilterInputSchema.parse({
          euTargetAgeMax: 125,
        }),
      ).toThrow();
    });
  });

  describe("Cursor Encoding & Validation", () => {
    it("encodes and decodes valid cursor payload", () => {
      const payload = {
        v: 1 as const,
        sort: "RECENTLY_SEEN" as const,
        values: ["2026-08-19T00:00:00.000Z", "ad-123"],
      };

      const encoded = encodeDiscoveryCursor(payload);
      expect(typeof encoded).toBe("string");

      const decoded = decodeDiscoveryCursor(encoded, "RECENTLY_SEEN");
      expect(decoded).toEqual(payload);
    });

    it("rejects cursor when embedded sort does not match requested sort", () => {
      const payload = {
        v: 1 as const,
        sort: "EU_REACH_DESC" as const,
        values: ["100000", "2026-08-19T00:00:00.000Z", "ad-123"],
      };

      const encoded = encodeDiscoveryCursor(payload);

      expect(() => decodeDiscoveryCursor(encoded, "RECENTLY_SEEN")).toThrow(
        DiscoveryCursorError,
      );
    });

    it("rejects corrupted cursor string", () => {
      expect(() => decodeDiscoveryCursor("not-a-valid-cursor-base64", "RECENTLY_SEEN")).toThrow(
        DiscoveryCursorError,
      );
    });
  });

  describe("Predicate Compilation & Determinism", () => {
    const fixedNow = new Date("2026-08-19T12:00:00.000Z");

    it("compiles running days against injected deterministic now", () => {
      const filters = normalizeDiscoveryFilters({
        runningMinDays: 30,
        runningMaxDays: 60,
      });

      const preds = compileDiscoveryPredicates({
        filters,
        now: fixedNow,
      });

      expect(preds.length).toBe(2);
    });

    it("compiles age overlap condition for requested interval", () => {
      const filters = normalizeDiscoveryFilters({
        euTargetAgeMin: 25,
        euTargetAgeMax: 34,
      });

      const preds = compileDiscoveryPredicates({
        filters,
      });

      expect(preds.length).toBe(1);
    });

    it("excludes specified filter groups for disjunctive faceting", () => {
      const filters = normalizeDiscoveryFilters({
        mediaTypes: ["VIDEO"],
        shapeFamilies: ["portrait"],
        targetCountries: ["ES"],
        euReachMin: 50000,
      });

      // All filters compiled
      const allPreds = compileDiscoveryPredicates({ filters });
      expect(allPreds.length).toBe(4);

      // Excluding SHAPE group
      const shapeExcludedPreds = compileDiscoveryPredicates({
        filters,
        excludeGroups: ["SHAPE"],
      });
      expect(shapeExcludedPreds.length).toBe(3);

      // Excluding both SHAPE and MEDIA_TYPE
      const multiExcludedPreds = compileDiscoveryPredicates({
        filters,
        excludeGroups: ["SHAPE", "MEDIA_TYPE"],
      });
      expect(multiExcludedPreds.length).toBe(2);
    });

    it("provides deterministic sort clauses with tie breakers", () => {
      const recentSeenClauses = getDiscoverySortClauses("RECENTLY_SEEN");
      expect(recentSeenClauses.length).toBe(2);

      const reachClauses = getDiscoverySortClauses("EU_REACH_DESC");
      expect(reachClauses.length).toBe(3);
    });
  });
});
