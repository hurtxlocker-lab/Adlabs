/**
 * URL ↔ DiscoveryFilterInput codec for the Discover page.
 *
 * Pure module — no React dependency, no business logic, no SQL.
 *
 * The codec maps human-readable URL parameter names to the existing
 * DiscoveryFilterInput contract. All business validation (type checking,
 * range constraints, country code length, etc.) is delegated to the
 * existing discoveryFilterInputSchema / normalizeDiscoveryFilters path.
 *
 * Serialization is deterministic:
 * - No-op / default values are omitted
 * - Arrays are deduped and stably sorted (uppercase)
 * - Band UI keys map to min/max domain values — never stored as band keys
 * - Browser back/forward reproduces exact filter state
 * - Pagination cursor is NOT encoded (not durable filter state)
 */

import type { DiscoveryFilterInput } from "@/discovery/filters/types";
import type { DiscoverySort } from "@/discovery/filters/types";
import { EU_REACH_BANDS, CREATIVE_REUSE_BANDS } from "@/discovery/filters/bands";

// ---------------------------------------------------------------------------
// URL Parameter Names (human-readable, stable contract)
// ---------------------------------------------------------------------------

export const DISCOVERY_URL_PARAMS = {
  brand: "brand",
  active: "active",
  format: "format",
  shape: "shape",
  runningMin: "running_min",
  runningMax: "running_max",
  reuseMin: "reuse_min",
  reuseMax: "reuse_max",
  reached: "reached",
  hasEu: "has_eu",
  hasUk: "has_uk",
  euReachMin: "eu_reach_min",
  euReachMax: "eu_reach_max",
  platform: "platform",
  pageCategory: "page_category",
  cta: "cta",
  targetCountry: "target_country",
  igFollowersMin: "ig_followers_min",
  igFollowersMax: "ig_followers_max",
  sort: "sort",
} as const;

export type DiscoveryUrlParams = typeof DISCOVERY_URL_PARAMS;

// ---------------------------------------------------------------------------
// EU Reach Band UI keys (V1 UI uses bands, codec maps to min/max)
// ---------------------------------------------------------------------------

export type EuReachBandKey = "LT_1K" | "1K_10K" | "10K_50K" | "50K_100K" | "100K_PLUS";

/** Maps a band key to { euReachMin, euReachMax } domain values. */
function euReachBandToRange(key: string): { euReachMin?: number; euReachMax?: number } | null {
  const band = EU_REACH_BANDS.find((b) => b.key === key);
  if (!band) return null;
  const min = typeof band.min === "bigint" ? Number(band.min) : band.min;
  const max = band.max === null ? undefined : typeof band.max === "bigint" ? Number(band.max) : band.max;
  return { euReachMin: min > 0 ? min : undefined, euReachMax: max };
}

/** Maps min/max domain values back to a band key for URL encoding. */
function euReachRangeToBandKey(min?: number, max?: number): string | null {
  if (min === undefined && max === undefined) return null;
  for (const band of EU_REACH_BANDS) {
    const bMin = typeof band.min === "bigint" ? Number(band.min) : band.min;
    const bMax = band.max === null ? undefined : typeof band.max === "bigint" ? Number(band.max) : band.max;
    const minMatch = (min === undefined && bMin === 0) || min === bMin;
    const maxMatch = max === bMax;
    if (minMatch && maxMatch) return band.key;
  }
  // Not a clean band — encode raw values as two params
  return null;
}

// Creative Reuse Band UI keys → min/max
export type CreativeReuseBandKey = "1" | "2_3" | "4_10" | "11_PLUS";

function reuseBandToRange(key: string): { reuseMin?: number; reuseMax?: number } | null {
  const band = CREATIVE_REUSE_BANDS.find((b) => b.key === key);
  if (!band) return null;
  const min = typeof band.min === "bigint" ? Number(band.min) : Number(band.min);
  const max = band.max === null ? undefined : typeof band.max === "bigint" ? Number(band.max) : Number(band.max) - 1;
  return { reuseMin: min, reuseMax: max };
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

type SearchParamsLike = URLSearchParams | Record<string, string | string[] | undefined>;

function getParam(params: SearchParamsLike, key: string): string | null {
  if (params instanceof URLSearchParams) {
    return params.get(key);
  }
  const val = params[key];
  if (val == null) return null;
  if (Array.isArray(val)) return val[0] ?? null;
  return val;
}

function splitCsv(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseBool(raw: string | null): boolean | undefined {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return undefined;
}

function parsePositiveInt(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Parses URL search parameters into a DiscoveryFilterInput.
 * Invalid / unknown params are silently ignored.
 * Business validation (range contradictions, country code length, etc.)
 * is left to normalizeDiscoveryFilters / discoveryFilterInputSchema.
 */
export function parseDiscoveryFiltersFromParams(
  params: SearchParamsLike,
): DiscoveryFilterInput {
  const filter: DiscoveryFilterInput = {};

  // brand=<uuid,uuid>
  const brandRaw = splitCsv(getParam(params, DISCOVERY_URL_PARAMS.brand));
  if (brandRaw.length > 0) filter.brandIds = brandRaw;

  // active=true|false
  const active = parseBool(getParam(params, DISCOVERY_URL_PARAMS.active));
  if (active !== undefined) filter.isActive = active;

  // format=VIDEO,IMAGE
  const formats = splitCsv(getParam(params, DISCOVERY_URL_PARAMS.format)).map((s) =>
    s.toUpperCase(),
  );
  if (formats.length > 0) filter.mediaTypes = formats;

  // shape=portrait,square,landscape,wide
  const shapes = splitCsv(getParam(params, DISCOVERY_URL_PARAMS.shape)).map((s) =>
    s.toLowerCase(),
  );
  if (shapes.length > 0)
    filter.shapeFamilies = shapes as DiscoveryFilterInput["shapeFamilies"];

  // running_min=<days>, running_max=<days>
  const runMin = parsePositiveInt(getParam(params, DISCOVERY_URL_PARAMS.runningMin));
  if (runMin !== undefined) filter.runningMinDays = runMin;
  const runMax = parsePositiveInt(getParam(params, DISCOVERY_URL_PARAMS.runningMax));
  if (runMax !== undefined) filter.runningMaxDays = runMax;

  // reuse_min=<n>, reuse_max=<n>
  const reuseMin = parsePositiveInt(getParam(params, DISCOVERY_URL_PARAMS.reuseMin));
  if (reuseMin !== undefined) filter.exactCreativeReuseMin = reuseMin;
  const reuseMax = parsePositiveInt(getParam(params, DISCOVERY_URL_PARAMS.reuseMax));
  if (reuseMax !== undefined) filter.exactCreativeReuseMax = reuseMax;

  // reached=ES,FR (ISO codes — upcased, deduped, validated by downstream)
  const reached = splitCsv(getParam(params, DISCOVERY_URL_PARAMS.reached)).map((c) =>
    c.toUpperCase(),
  );
  if (reached.length > 0) filter.reachedCountries = reached;

  // has_eu=true
  const hasEu = parseBool(getParam(params, DISCOVERY_URL_PARAMS.hasEu));
  if (hasEu !== undefined) filter.hasEuTransparencyEvidence = hasEu;

  // has_uk=true
  const hasUk = parseBool(getParam(params, DISCOVERY_URL_PARAMS.hasUk));
  if (hasUk !== undefined) filter.hasUkTransparencyEvidence = hasUk;

  // eu_reach_min / eu_reach_max (raw numbers from band UI mapping)
  const euReachMin = parsePositiveInt(getParam(params, DISCOVERY_URL_PARAMS.euReachMin));
  if (euReachMin !== undefined) filter.euReachMin = euReachMin;
  const euReachMax = parsePositiveInt(getParam(params, DISCOVERY_URL_PARAMS.euReachMax));
  if (euReachMax !== undefined) filter.euReachMax = euReachMax;

  // platform=FACEBOOK,INSTAGRAM
  const platforms = splitCsv(getParam(params, DISCOVERY_URL_PARAMS.platform)).map((s) =>
    s.toUpperCase(),
  );
  if (platforms.length > 0) filter.publisherPlatforms = platforms;

  // page_category=<value,value>
  const categories = splitCsv(getParam(params, DISCOVERY_URL_PARAMS.pageCategory));
  if (categories.length > 0) filter.pageCategories = categories;

  // ig_followers_min / ig_followers_max
  const igMin = parsePositiveInt(getParam(params, DISCOVERY_URL_PARAMS.igFollowersMin));
  if (igMin !== undefined) filter.instagramFollowersMin = igMin;
  const igMax = parsePositiveInt(getParam(params, DISCOVERY_URL_PARAMS.igFollowersMax));
  if (igMax !== undefined) filter.instagramFollowersMax = igMax;

  // cta=<CTA,CTA>
  const ctaTypes = splitCsv(getParam(params, DISCOVERY_URL_PARAMS.cta)).map((s) =>
    s.toUpperCase(),
  );
  if (ctaTypes.length > 0) filter.ctaTypes = ctaTypes;

  // target_country=<ISO,ISO>
  const targetCountries = splitCsv(getParam(params, DISCOVERY_URL_PARAMS.targetCountry)).map(
    (c) => c.toUpperCase(),
  );
  if (targetCountries.length > 0) filter.targetCountries = targetCountries;

  return filter;
}

/**
 * Parses the sort param from URL search params.
 * Returns undefined if absent or invalid (caller uses default).
 */
export function parseSortFromParams(
  params: SearchParamsLike,
): DiscoverySort | undefined {
  const raw = getParam(params, DISCOVERY_URL_PARAMS.sort);
  if (!raw) return undefined;

  const VALID_SORTS: DiscoverySort[] = [
    "RECENTLY_SEEN",
    "OLDEST_SEEN",
    "NEWEST_STARTED",
    "OLDEST_STARTED",
    "EU_REACH_DESC",
    "EU_REACH_ASC",
    "INSTAGRAM_FOLLOWERS_DESC",
    "INSTAGRAM_FOLLOWERS_ASC",
    "CREATIVE_REUSE_DESC",
    "CREATIVE_REUSE_ASC",
  ];

  return (VALID_SORTS as string[]).includes(raw) ? (raw as DiscoverySort) : undefined;
}

// ---------------------------------------------------------------------------
// Build / Serialize
// ---------------------------------------------------------------------------

/**
 * Builds a URLSearchParams from a DiscoveryFilterInput + sort.
 * No-op / default values are omitted. Arrays are deduped and sorted for stable URLs.
 */
export function buildDiscoveryFilterParams(
  filter: DiscoveryFilterInput,
  sort?: DiscoverySort,
): URLSearchParams {
  const params = new URLSearchParams();

  if (filter.brandIds && filter.brandIds.length > 0) {
    params.set(
      DISCOVERY_URL_PARAMS.brand,
      [...new Set(filter.brandIds)].sort().join(","),
    );
  }

  if (filter.isActive !== undefined) {
    params.set(DISCOVERY_URL_PARAMS.active, String(filter.isActive));
  }

  if (filter.mediaTypes && filter.mediaTypes.length > 0) {
    params.set(
      DISCOVERY_URL_PARAMS.format,
      [...new Set(filter.mediaTypes.map((s) => s.toUpperCase()))].sort().join(","),
    );
  }

  if (filter.shapeFamilies && filter.shapeFamilies.length > 0) {
    params.set(
      DISCOVERY_URL_PARAMS.shape,
      [...new Set(filter.shapeFamilies.map((s) => s.toLowerCase()))].sort().join(","),
    );
  }

  if (filter.runningMinDays !== undefined)
    params.set(DISCOVERY_URL_PARAMS.runningMin, String(filter.runningMinDays));
  if (filter.runningMaxDays !== undefined)
    params.set(DISCOVERY_URL_PARAMS.runningMax, String(filter.runningMaxDays));

  if (filter.exactCreativeReuseMin !== undefined)
    params.set(DISCOVERY_URL_PARAMS.reuseMin, String(filter.exactCreativeReuseMin));
  if (filter.exactCreativeReuseMax !== undefined)
    params.set(DISCOVERY_URL_PARAMS.reuseMax, String(filter.exactCreativeReuseMax));

  if (filter.reachedCountries && filter.reachedCountries.length > 0) {
    params.set(
      DISCOVERY_URL_PARAMS.reached,
      [...new Set(filter.reachedCountries.map((c) => c.toUpperCase()))].sort().join(","),
    );
  }

  if (filter.hasEuTransparencyEvidence !== undefined)
    params.set(DISCOVERY_URL_PARAMS.hasEu, String(filter.hasEuTransparencyEvidence));
  if (filter.hasUkTransparencyEvidence !== undefined)
    params.set(DISCOVERY_URL_PARAMS.hasUk, String(filter.hasUkTransparencyEvidence));

  if (filter.euReachMin !== undefined)
    params.set(DISCOVERY_URL_PARAMS.euReachMin, String(filter.euReachMin));
  if (filter.euReachMax !== undefined)
    params.set(DISCOVERY_URL_PARAMS.euReachMax, String(filter.euReachMax));

  if (filter.publisherPlatforms && filter.publisherPlatforms.length > 0) {
    params.set(
      DISCOVERY_URL_PARAMS.platform,
      [...new Set(filter.publisherPlatforms.map((s) => s.toUpperCase()))].sort().join(","),
    );
  }

  if (filter.pageCategories && filter.pageCategories.length > 0) {
    params.set(
      DISCOVERY_URL_PARAMS.pageCategory,
      [...new Set(filter.pageCategories)].sort().join(","),
    );
  }

  if (filter.instagramFollowersMin !== undefined)
    params.set(DISCOVERY_URL_PARAMS.igFollowersMin, String(filter.instagramFollowersMin));
  if (filter.instagramFollowersMax !== undefined)
    params.set(DISCOVERY_URL_PARAMS.igFollowersMax, String(filter.instagramFollowersMax));

  if (filter.ctaTypes && filter.ctaTypes.length > 0) {
    params.set(
      DISCOVERY_URL_PARAMS.cta,
      [...new Set(filter.ctaTypes.map((s) => s.toUpperCase()))].sort().join(","),
    );
  }

  if (filter.targetCountries && filter.targetCountries.length > 0) {
    params.set(
      DISCOVERY_URL_PARAMS.targetCountry,
      [...new Set(filter.targetCountries.map((c) => c.toUpperCase()))].sort().join(","),
    );
  }

  if (sort && sort !== "RECENTLY_SEEN") {
    params.set(DISCOVERY_URL_PARAMS.sort, sort);
  }

  return params;
}

/**
 * Returns a new URLSearchParams with the given key removed.
 * Used by individual filter clear buttons.
 */
export function clearDiscoveryFilterParam(
  current: URLSearchParams,
  key: keyof DiscoveryUrlParams,
): URLSearchParams {
  const next = new URLSearchParams(current.toString());
  next.delete(DISCOVERY_URL_PARAMS[key]);
  return next;
}

/**
 * Returns an empty URLSearchParams, effectively clearing all discovery filters.
 * Used by the "Clear all" control.
 */
export function clearAllDiscoveryFilterParams(): URLSearchParams {
  return new URLSearchParams();
}

// ---------------------------------------------------------------------------
// Band convenience helpers for UI
// ---------------------------------------------------------------------------

/**
 * Converts a EU reach band key to euReachMin/euReachMax domain values
 * suitable for buildDiscoveryFilterParams.
 */
export function euReachBandToFilterRange(
  key: EuReachBandKey,
): { euReachMin?: number; euReachMax?: number } {
  return euReachBandToRange(key) ?? {};
}

/**
 * Converts a creative reuse band key to exactCreativeReuseMin/Max domain values.
 */
export function reuseBandToFilterRange(
  key: CreativeReuseBandKey,
): { exactCreativeReuseMin?: number; exactCreativeReuseMax?: number } {
  const range = reuseBandToRange(key);
  if (!range) return {};
  return {
    exactCreativeReuseMin: range.reuseMin,
    exactCreativeReuseMax: range.reuseMax,
  };
}

/**
 * Attempts to resolve the current eu_reach_min/max back to a band key for UI display.
 * Returns null if the current values don't match a clean band boundary.
 */
export function currentEuReachBandKey(filter: DiscoveryFilterInput): EuReachBandKey | null {
  const min = filter.euReachMin !== undefined ? Number(filter.euReachMin) : undefined;
  const max = filter.euReachMax !== undefined ? Number(filter.euReachMax) : undefined;
  return euReachRangeToBandKey(min, max) as EuReachBandKey | null;
}
