/**
 * src/ingestion/providers/apify/input-builder.ts
 *
 * Canonical input payload constructor for curious_coder/facebook-ads-library-scraper.
 *
 * Invariants:
 *  - `urls` is an array of request objects: `[{ url: string }]`.
 *  - `count` is the provider-side collection ceiling (minimum 10).
 *  - Never emits stale fields (`startUrls`, `resultsLimit`).
 */

/** Minimum provider-side result count requested from the actor. */
export const MIN_PROVIDER_COUNT = 10;

export interface BuildCuriousCoderTaskInputParams {
  /** Valid Meta Ad Library search/view URL. */
  url: string;
  /** Operator's requested local limit (or target count). */
  limit: number;
  /** Country code to scrape for (e.g. "IN", "US", "ALL"). Defaults to "ALL". */
  countryCode?: string;
  /** Optional override for detailed scraping (defaults to true for rich enrichment). */
  scrapeAdDetails?: boolean;
  /** Optional active status filter (defaults to "all"). */
  activeStatus?: string;
  /** Optional sort order (defaults to "impressions_desc"). */
  sortBy?: string;
  /** Optional period (defaults to ""). */
  period?: string;
}

export interface CuriousCoderActorInput {
  urls: Array<{ url: string }>;
  count: number;
  "scrapePageAds.activeStatus"?: string;
  "scrapePageAds.sortBy"?: string;
  "scrapePageAds.countryCode"?: string;
  "scrapePageAds.period"?: string;
  scrapeAdDetails?: boolean;
  [key: string]: unknown;
}

/**
 * Constructs the canonical Apify input payload for the Curious Coder scraper actor.
 */
export function buildCuriousCoderTaskInput(
  params: BuildCuriousCoderTaskInputParams,
): CuriousCoderActorInput {
  const providerCount = Math.max(MIN_PROVIDER_COUNT, params.limit);

  return {
    urls: [{ url: params.url }],
    count: providerCount,
    "scrapePageAds.activeStatus": params.activeStatus ?? "all",
    "scrapePageAds.sortBy": params.sortBy ?? "impressions_desc",
    "scrapePageAds.countryCode": params.countryCode ? params.countryCode.trim().toUpperCase() : "ALL",
    "scrapePageAds.period": params.period ?? "",
    scrapeAdDetails: params.scrapeAdDetails ?? true,
  };
}
