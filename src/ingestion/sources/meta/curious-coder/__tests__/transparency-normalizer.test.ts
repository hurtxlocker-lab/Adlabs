import { describe, expect, it } from "vitest";
import { normalizeCuriousCoderAd } from "../normalizer";
import type { CuriousCoderItem } from "../schema";

describe("Transparency & Account Observation Normalization", () => {
  const baseItem: CuriousCoderItem = {
    ad_archive_id: "1234567890",
    page_id: "987654321",
    page_name: "Test Brand",
    page_profile_uri: "https://www.facebook.com/testbrand",
    is_active: true,
    start_date: 1786863600,
    start_date_formatted: "2026-08-16 07:00:00",
    snapshot: {
      body: { text: "Discover our new collection." },
      title: "Special Offer",
      cta_text: "Shop Now",
      cta_type: "SHOP_NOW",
      link_url: "https://testbrand.com/offer",
      cards: [],
      images: [],
      videos: [],
    },
  };

  it("Fixture A: normalizes Shokz-like EU transparency with total reach and age/gender breakdowns", () => {
    const shokzItem: CuriousCoderItem = {
      ...baseItem,
      transparency_by_location: {
        eu_transparency: {
          targets_eu: true,
          location_audience: [
            { name: "France", num_obfuscated: 0, type: "countries", excluded: false },
          ],
          gender_audience: "All",
          age_audience: { min: 25, max: 40 },
          eu_total_reach: 82531,
          age_country_gender_reach_breakdown: [
            {
              country: "FR",
              age_gender_breakdowns: [
                { age_range: "25-34", male: 33118, female: 3042, unknown: 353 },
                { age_range: "35-44", male: 41819, female: 3619, unknown: 580 },
              ],
            },
          ],
        },
      } as unknown as Record<string, unknown>,
    };

    const normalized = normalizeCuriousCoderAd(shokzItem);

    expect(normalized.transparencyObservations).toHaveLength(1);
    const euObs = normalized.transparencyObservations![0];
    expect(euObs.region).toBe("EU");
    expect(euObs.totalReach).toBe(BigInt(82531));
    expect(euObs.targetAgeMin).toBe(25);
    expect(euObs.targetAgeMax).toBe(40);
    expect(euObs.targetGender).toBe("All");
    expect(euObs.targetCountries).toEqual(["FR"]);
    expect(euObs.reachedCountries).toEqual(["FR"]);
    expect(euObs.reachBreakdown).toBeDefined();
    expect(euObs.providerPayload).toBeDefined();
  });

  it("Fixture B: handles Nida-like collection mismatch (collection CO, reached ES) without leaking collection country", () => {
    const nidaItem: CuriousCoderItem = {
      ...baseItem,
      transparency_by_location: {
        eu_transparency: {
          targets_eu: true,
          location_audience: [
            { name: "Spain", num_obfuscated: 0, type: "countries", excluded: false },
            { name: "Balearic Islands, Spain", num_obfuscated: 0, type: "regions", excluded: true },
          ],
          gender_audience: "All",
          age_audience: { min: 18, max: 65 },
          eu_total_reach: 86294,
          age_country_gender_reach_breakdown: [
            {
              country: "ES",
              age_gender_breakdowns: [
                { age_range: "25-34", male: 200, female: 300, unknown: 5 },
              ],
            },
          ],
        },
      } as unknown as Record<string, unknown>,
    };

    const normalized = normalizeCuriousCoderAd(nidaItem);

    expect(normalized.transparencyObservations).toHaveLength(1);
    const euObs = normalized.transparencyObservations![0];
    expect(euObs.targetCountries).toEqual(["ES"]);
    expect(euObs.reachedCountries).toEqual(["ES"]);
    expect(euObs.targetCountries).not.toContain("CO");
    expect(euObs.reachedCountries).not.toContain("CO");
    expect(euObs.totalReach).toBe(BigInt(86294));
  });

  it("Fixture C: normalizes multi-country transparency with deduplicated and sorted countries", () => {
    const multiCountryItem: CuriousCoderItem = {
      ...baseItem,
      transparency_by_location: {
        eu_transparency: {
          targets_eu: true,
          location_audience: [
            { name: "France", excluded: false },
            { name: "Germany", excluded: false },
            { name: "Spain", excluded: false },
          ],
          gender_audience: "All",
          age_audience: { min: 18, max: 65 },
          eu_total_reach: 150000,
          age_country_gender_reach_breakdown: [
            { country: "ES", age_gender_breakdowns: [] },
            { country: "FR", age_gender_breakdowns: [] },
            { country: "DE", age_gender_breakdowns: [] },
          ],
        },
      } as unknown as Record<string, unknown>,
    };

    const normalized = normalizeCuriousCoderAd(multiCountryItem);
    const euObs = normalized.transparencyObservations![0];
    expect(euObs.targetCountries).toEqual(["DE", "ES", "FR"]);
    expect(euObs.reachedCountries).toEqual(["DE", "ES", "FR"]);
  });

  it("Fixture D: produces empty transparencyObservations array when transparency is null or absent", () => {
    const nullItem: CuriousCoderItem = {
      ...baseItem,
      transparency_by_location: null,
    };

    const normalized = normalizeCuriousCoderAd(nullItem);
    expect(normalized.transparencyObservations).toEqual([]);
  });

  it("Fixture E: normalizes advertiser enrichment (likes, followers, verification, category, about)", () => {
    const enrichedItem: CuriousCoderItem = {
      ...baseItem,
      advertiser: {
        ad_library_page_info: {
          page_info: {
            page_id: "987654321",
            page_name: "Test Brand",
            page_category: "Shopping & retail",
            likes: 64352,
            ig_username: "testbrand.official",
            ig_followers: 331165,
            page_verification: "BLUE_VERIFIED",
            ig_verification: true,
            page_is_deleted: false,
            page_is_restricted: false,
            profile_photo: "https://cdn.example.com/profile.jpg",
            page_cover_photo: "https://cdn.example.com/cover.jpg",
          },
          page_spend: {
            is_political_page: false,
            current_week: null,
          },
        },
        page: {
          about: {
            text: "Premium skincare handcrafted in Korea.",
          },
        },
      } as unknown as Record<string, unknown>,
    };

    const normalized = normalizeCuriousCoderAd(enrichedItem);

    expect(normalized.accountObservation).toBeDefined();
    const acct = normalized.accountObservation!;
    expect(acct.pageCategory).toBe("Shopping & retail");
    expect(acct.facebookLikes).toBe(BigInt(64352));
    expect(acct.instagramUsername).toBe("testbrand.official");
    expect(acct.instagramFollowers).toBe(BigInt(331165));
    expect(acct.facebookVerified).toBe(true);
    expect(acct.instagramVerified).toBe(true);
    expect(acct.pageIsDeleted).toBe(false);
    expect(acct.pageIsRestricted).toBe(false);
    expect(acct.aboutText).toBe("Premium skincare handcrafted in Korea.");
    expect(acct.profileImageUrl).toBe("https://cdn.example.com/profile.jpg");
    expect(acct.coverImageUrl).toBe("https://cdn.example.com/cover.jpg");
  });

  it("degrades gracefully without failing core normalization if optional enrichment is malformed", () => {
    const malformedEnrichmentItem: CuriousCoderItem = {
      ...baseItem,
      advertiser: "malformed_string_instead_of_object" as unknown as Record<string, unknown>,
      transparency_by_location: 12345 as unknown as Record<string, unknown>,
    };

    const normalized = normalizeCuriousCoderAd(malformedEnrichmentItem);
    expect(normalized.sourceAdId).toBe("1234567890");
    expect(normalized.advertiser.sourcePageId).toBe("987654321");
    expect(normalized.accountObservation).toBeNull();
    expect(normalized.transparencyObservations).toEqual([]);
  });
});
