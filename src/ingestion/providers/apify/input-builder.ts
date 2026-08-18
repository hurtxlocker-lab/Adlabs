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
  /** Operator's requested local limit (1..10). */
  limit: number;
  /** Optional override for detailed scraping (defaults to true for rich enrichment). */
  scrapeAdDetails?: boolean;
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
    "scrapePageAds.activeStatus": "all",
    "scrapePageAds.sortBy": "impressions_desc",
    "scrapePageAds.countryCode": "ALL",
    "scrapePageAds.period": "",
    scrapeAdDetails: params.scrapeAdDetails ?? true,
  };
}
