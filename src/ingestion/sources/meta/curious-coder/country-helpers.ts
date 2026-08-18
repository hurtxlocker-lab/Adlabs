/**
 * Canonical ISO 3166-1 alpha-2 mapping for common country names returned by Meta Ad Library transparency.
 */
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  france: "FR",
  spain: "ES",
  "united kingdom": "GB",
  uk: "GB",
  germany: "DE",
  italy: "IT",
  portugal: "PT",
  netherlands: "NL",
  belgium: "BE",
  austria: "AT",
  poland: "PL",
  sweden: "SE",
  denmark: "DK",
  finland: "FI",
  norway: "NO",
  ireland: "IE",
  greece: "GR",
  romania: "RO",
  czechia: "CZ",
  "czech republic": "CZ",
  hungary: "HU",
  bulgaria: "BG",
  croatia: "HR",
  slovakia: "SK",
  slovenia: "SI",
  lithuania: "LT",
  latvia: "LV",
  estonia: "EE",
  cyprus: "CY",
  luxembourg: "LU",
  malta: "MT",
  "united states": "US",
  usa: "US",
  colombia: "CO",
  brazil: "BR",
  india: "IN",
};

/**
 * Normalizes a country name or code string to a canonical 2-letter uppercase ISO code if recognizable,
 * or uppercase trimmed code if 2-letter format.
 *
 * Rules:
 *  - Matches ONLY whole country names or direct 2-letter ISO codes.
 *  - NEVER infers country codes from arbitrary subnational regions or cities by guesswork.
 */
export function normalizeCountryCode(nameOrCode: string | null | undefined): string | null {
  if (!nameOrCode || typeof nameOrCode !== "string") return null;
  const trimmed = nameOrCode.trim();
  if (trimmed.length === 0) return null;

  // If already a 2-letter code
  if (trimmed.length === 2 && /^[a-zA-Z]{2}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  const lower = trimmed.toLowerCase();
  if (COUNTRY_NAME_TO_CODE[lower]) {
    return COUNTRY_NAME_TO_CODE[lower];
  }

  return null;
}

/**
 * Pure helper to extract deduplicated, canonical, sorted target country codes from transparency location_audience.
 *
 * Rules:
 *  - Excludes locations marked with `excluded: true`.
 *  - Extracts ONLY confidently resolved country-level targets (type === "countries" or exact country names).
 *  - Subnational regions, cities, and exclusions (e.g. Paris, Catalonia, Balearic Islands) are NOT guessed as countries;
 *    they remain safely preserved in provider_payload / raw items.
 *  - Deduplicated and deterministically sorted (e.g. ["DE", "ES", "FR"]).
 *  - NEVER infers from collection query context.
 */
export function extractTargetCountries(transparencyObj: unknown): string[] {
  if (!transparencyObj || typeof transparencyObj !== "object") {
    return [];
  }

  const locAudience = (transparencyObj as { location_audience?: unknown }).location_audience;
  if (!Array.isArray(locAudience) || locAudience.length === 0) {
    return [];
  }

  const codes = new Set<string>();

  for (const loc of locAudience) {
    if (!loc || typeof loc !== "object") continue;
    // Skip excluded audience areas
    if (loc.excluded === true) continue;

    const locType = typeof loc.type === "string" ? loc.type.toLowerCase() : "";
    // If explicitly marked as region, city, or custom subnational area, do not convert to country code
    if (locType === "regions" || locType === "city" || locType === "custom_location" || locType === "electoral_districts") {
      continue;
    }

    const locName = loc.name;
    const normalized = normalizeCountryCode(locName);
    if (normalized) {
      codes.add(normalized);
    } else if (loc.country_code && typeof loc.country_code === "string") {
      const code = normalizeCountryCode(loc.country_code);
      if (code) codes.add(code);
    }
  }

  return Array.from(codes).sort();
}

/**
 * Pure helper to extract deduplicated, canonical, sorted reached country codes from transparency breakdowns.
 *
 * Rules:
 *  - Reads `age_country_gender_reach_breakdown` array.
 *  - Normalizes `breakdown.country` to 2-letter uppercase ISO code.
 *  - Deduplicated and deterministically sorted.
 *  - NEVER copies collection country into reached country.
 */
export function extractReachedCountries(transparencyObj: unknown): string[] {
  if (!transparencyObj || typeof transparencyObj !== "object") {
    return [];
  }

  const breakdown = (
    transparencyObj as { age_country_gender_reach_breakdown?: unknown }
  ).age_country_gender_reach_breakdown;

  if (!Array.isArray(breakdown) || breakdown.length === 0) {
    return [];
  }

  const codes = new Set<string>();

  for (const entry of breakdown) {
    if (!entry || typeof entry !== "object") continue;
    const country = (entry as { country?: unknown }).country;
    if (typeof country === "string") {
      const normalized = normalizeCountryCode(country);
      if (normalized) {
        codes.add(normalized);
      }
    }
  }

  return Array.from(codes).sort();
}
