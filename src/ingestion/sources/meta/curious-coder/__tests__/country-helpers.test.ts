import { describe, expect, it } from "vitest";
import {
  extractReachedCountries,
  extractTargetCountries,
  normalizeCountryCode,
} from "../country-helpers";

describe("Country Helpers & Multi-Country Normalization", () => {
  describe("normalizeCountryCode", () => {
    it("normalizes direct 2-letter ISO codes to uppercase", () => {
      expect(normalizeCountryCode("fr")).toBe("FR");
      expect(normalizeCountryCode("Es")).toBe("ES");
      expect(normalizeCountryCode("GB")).toBe("GB");
    });

    it("normalizes country names to uppercase ISO codes", () => {
      expect(normalizeCountryCode("France")).toBe("FR");
      expect(normalizeCountryCode("Spain")).toBe("ES");
      expect(normalizeCountryCode("United Kingdom")).toBe("GB");
      expect(normalizeCountryCode("Germany")).toBe("DE");
      expect(normalizeCountryCode("Colombia")).toBe("CO");
    });

    it("does not infer country codes from subnational regions or cities by guesswork", () => {
      expect(normalizeCountryCode("Balearic Islands, Spain")).toBeNull();
      expect(normalizeCountryCode("Islas Canarias, Spain")).toBeNull();
      expect(normalizeCountryCode("Paris")).toBeNull();
      expect(normalizeCountryCode("Catalonia")).toBeNull();
      expect(normalizeCountryCode("London")).toBeNull();
    });

    it("returns null for invalid or empty inputs", () => {
      expect(normalizeCountryCode("")).toBeNull();
      expect(normalizeCountryCode(null)).toBeNull();
      expect(normalizeCountryCode(undefined)).toBeNull();
      expect(normalizeCountryCode("Unknown Land")).toBeNull();
    });
  });

  describe("extractTargetCountries", () => {
    it("extracts single target country from location_audience", () => {
      const euObj = {
        location_audience: [
          { name: "France", num_obfuscated: 0, type: "countries", excluded: false },
        ],
      };
      expect(extractTargetCountries(euObj)).toEqual(["FR"]);
    });

    it("ignores excluded locations", () => {
      const euObj = {
        location_audience: [
          { name: "Spain", num_obfuscated: 0, type: "countries", excluded: false },
          { name: "Balearic Islands, Spain", num_obfuscated: 0, type: "regions", excluded: true },
          { name: "Islas Canarias, Spain", num_obfuscated: 0, type: "regions", excluded: true },
        ],
      };
      expect(extractTargetCountries(euObj)).toEqual(["ES"]);
    });

    it("extracts and deduplicates multiple target countries in sorted order", () => {
      const euObj = {
        location_audience: [
          { name: "Spain", excluded: false },
          { name: "Germany", excluded: false },
          { name: "France", excluded: false },
          { name: "Spain", excluded: false },
        ],
      };
      expect(extractTargetCountries(euObj)).toEqual(["DE", "ES", "FR"]);
    });

    it("returns empty array when location_audience is missing or empty", () => {
      expect(extractTargetCountries(null)).toEqual([]);
      expect(extractTargetCountries({})).toEqual([]);
      expect(extractTargetCountries({ location_audience: [] })).toEqual([]);
    });
  });

  describe("extractReachedCountries", () => {
    it("extracts reached country from breakdown", () => {
      const euObj = {
        age_country_gender_reach_breakdown: [
          {
            country: "FR",
            age_gender_breakdowns: [{ age_range: "25-34", male: 100, female: 50 }],
          },
        ],
      };
      expect(extractReachedCountries(euObj)).toEqual(["FR"]);
    });

    it("extracts, deduplicates, and sorts multi-country reached breakdowns", () => {
      const multiCountryObj = {
        age_country_gender_reach_breakdown: [
          { country: "ES", age_gender_breakdowns: [] },
          { country: "FR", age_gender_breakdowns: [] },
          { country: "DE", age_gender_breakdowns: [] },
          { country: "ES", age_gender_breakdowns: [] },
        ],
      };
      expect(extractReachedCountries(multiCountryObj)).toEqual(["DE", "ES", "FR"]);
    });

    it("never infers or leaks collection query country", () => {
      // Scenario: Collection query was country=CO, but ad delivered to ES
      const nidaObj = {
        age_country_gender_reach_breakdown: [
          { country: "ES", age_gender_breakdowns: [] },
        ],
      };
      const reached = extractReachedCountries(nidaObj);
      expect(reached).toEqual(["ES"]);
      expect(reached).not.toContain("CO");
    });
  });
});
