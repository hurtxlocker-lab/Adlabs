import { db as defaultDb } from "@/db/client";
import { adDiscoveryIndex } from "@/db/schema";
import type { DbOrTx } from "@/ingestion/persistence/types";
import { and, sql, type SQL } from "drizzle-orm";
import {
  decodeDiscoveryCursor,
  encodeDiscoveryCursor,
  compileCursorPredicate,
  type DiscoveryCursorPayload,
} from "./cursor";
import { computeDiscoveryFacets } from "./facets";
import { normalizeDiscoveryFilters } from "./normalize";
import { compileDiscoveryPredicates } from "./predicates";
import { getDiscoverySortClauses } from "./sort";
import type {
  DiscoveryFacetsResult,
  DiscoverySort,
  QueryDiscoveryAdsOptions,
  QueryDiscoveryAdsResult,
  QueryDiscoveryFacetsOptions,
} from "./types";

interface AdDiscoveryDbRow extends Record<string, unknown> {
  ad_id: string;
  brand_id?: string;
  last_seen_at: Date | string;
  start_date: Date | string | null;
  latest_eu_total_reach: string | number | null;
  latest_instagram_followers: string | number | null;
  exact_creative_reuse_count: number | null;
}

/**
 * Builds the cursor values tuple from an item row given the active sort.
 */
function buildCursorValues(
  row: AdDiscoveryDbRow,
  sort: DiscoverySort,
): Array<string | number | boolean | null> {
  const lastSeenIso =
    row.last_seen_at instanceof Date
      ? row.last_seen_at.toISOString()
      : new Date(row.last_seen_at).toISOString();

  switch (sort) {
    case "RECENTLY_SEEN":
    case "OLDEST_SEEN":
      return [lastSeenIso, row.ad_id];

    case "NEWEST_STARTED":
    case "OLDEST_STARTED": {
      const startIso = row.start_date
        ? row.start_date instanceof Date
          ? row.start_date.toISOString()
          : new Date(row.start_date).toISOString()
        : null;
      return [startIso, lastSeenIso, row.ad_id];
    }

    case "EU_REACH_DESC":
    case "EU_REACH_ASC":
      return [
        row.latest_eu_total_reach != null ? String(row.latest_eu_total_reach) : null,
        lastSeenIso,
        row.ad_id,
      ];

    case "INSTAGRAM_FOLLOWERS_DESC":
    case "INSTAGRAM_FOLLOWERS_ASC":
      return [
        row.latest_instagram_followers != null ? String(row.latest_instagram_followers) : null,
        lastSeenIso,
        row.ad_id,
      ];

    case "CREATIVE_REUSE_DESC":
    case "CREATIVE_REUSE_ASC":
      return [row.exact_creative_reuse_count ?? null, lastSeenIso, row.ad_id];

    default:
      return [lastSeenIso, row.ad_id];
  }
}

/**
 * Executes a deterministic filtered, sorted, paginated query against `ad_discovery_index`.
 */
export async function queryDiscoveryAds(
  options: QueryDiscoveryAdsOptions = {},
  executor?: DbOrTx,
): Promise<QueryDiscoveryAdsResult> {
  const dbClient = executor ?? defaultDb;
  const normalizedFilters = normalizeDiscoveryFilters(options.filters);
  const sort: DiscoverySort = options.sort ?? "RECENTLY_SEEN";
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
  const now = options.now ?? new Date();

  // 1. Compile base filter predicates
  const filterPredicates = compileDiscoveryPredicates({
    filters: normalizedFilters,
    now,
  });
  const baseWhere = filterPredicates.length > 0 ? and(...filterPredicates) : sql`1=1`;

  // 2. Decode cursor if provided
  let cursorPredicate: SQL<unknown> | null = null;
  if (options.cursor) {
    const decoded = decodeDiscoveryCursor(options.cursor, sort);
    cursorPredicate = compileCursorPredicate(decoded);
  }

  // 3. Build sort clauses
  const sortClauses = getDiscoverySortClauses(sort);

  let rawRows: AdDiscoveryDbRow[] = [];

  if (options.limitPerBrand && options.limitPerBrand > 0) {
    const outerSortClauses = getDiscoverySortClauses(sort, true);
    const outerCursorPredicate = options.cursor
      ? compileCursorPredicate(decodeDiscoveryCursor(options.cursor, sort), true)
      : null;

    // Window function partitioned by brand for discovery diversity
    const result = await dbClient.execute<AdDiscoveryDbRow>(sql`
      WITH filtered_ranked AS (
        SELECT
          ${adDiscoveryIndex.adId} as ad_id,
          ${adDiscoveryIndex.brandId} as brand_id,
          ${adDiscoveryIndex.lastSeenAt} as last_seen_at,
          ${adDiscoveryIndex.startDate} as start_date,
          ${adDiscoveryIndex.latestEuTotalReach} as latest_eu_total_reach,
          ${adDiscoveryIndex.latestInstagramFollowers} as latest_instagram_followers,
          ${adDiscoveryIndex.exactCreativeReuseCount} as exact_creative_reuse_count,
          ROW_NUMBER() OVER (
            PARTITION BY ${adDiscoveryIndex.brandId}
            ORDER BY ${sql.join(sortClauses, sql`, `)}
          ) as brand_rank
        FROM ${adDiscoveryIndex}
        WHERE ${baseWhere}
      )
      SELECT
        ad_id,
        brand_id,
        last_seen_at,
        start_date,
        latest_eu_total_reach,
        latest_instagram_followers,
        exact_creative_reuse_count
      FROM filtered_ranked
      WHERE brand_rank <= ${options.limitPerBrand}
        ${outerCursorPredicate ? sql`AND ${outerCursorPredicate}` : sql``}
      ORDER BY ${sql.join(outerSortClauses, sql`, `)}
      LIMIT ${pageSize + 1}
    `);

    rawRows = Array.isArray(result)
      ? (result as AdDiscoveryDbRow[])
      : ((result as { rows?: AdDiscoveryDbRow[] })?.rows ?? []);
  } else {
    // Standard direct query
    const whereConditions: (SQL<unknown> | undefined)[] = [baseWhere];
    if (cursorPredicate) {
      whereConditions.push(cursorPredicate);
    }

    const filteredWhere = whereConditions.filter(
      (c): c is SQL<unknown> => c !== undefined,
    );

    const result = await dbClient.execute<AdDiscoveryDbRow>(sql`
      SELECT
        ${adDiscoveryIndex.adId} as ad_id,
        ${adDiscoveryIndex.brandId} as brand_id,
        ${adDiscoveryIndex.lastSeenAt} as last_seen_at,
        ${adDiscoveryIndex.startDate} as start_date,
        ${adDiscoveryIndex.latestEuTotalReach} as latest_eu_total_reach,
        ${adDiscoveryIndex.latestInstagramFollowers} as latest_instagram_followers,
        ${adDiscoveryIndex.exactCreativeReuseCount} as exact_creative_reuse_count
      FROM ${adDiscoveryIndex}
      WHERE ${and(...filteredWhere)}
      ORDER BY ${sql.join(sortClauses, sql`, `)}
      LIMIT ${pageSize + 1}
    `);

    rawRows = Array.isArray(result)
      ? (result as AdDiscoveryDbRow[])
      : ((result as { rows?: AdDiscoveryDbRow[] })?.rows ?? []);
  }

  const hasMore = rawRows.length > pageSize;
  const items = hasMore ? rawRows.slice(0, pageSize) : rawRows;

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const lastItem = items[items.length - 1];
    const cursorPayload: DiscoveryCursorPayload = {
      v: 1,
      sort,
      values: buildCursorValues(lastItem, sort),
    };
    nextCursor = encodeDiscoveryCursor(cursorPayload);
  }

  return {
    items: items.map((r) => ({ adId: r.ad_id })),
    nextCursor,
  };
}

/**
 * Computes facet aggregations for discovery filters.
 */
export async function queryDiscoveryFacets(
  options: QueryDiscoveryFacetsOptions = {},
  executor?: DbOrTx,
): Promise<DiscoveryFacetsResult> {
  const normalizedFilters = normalizeDiscoveryFilters(options.filters);
  const now = options.now ?? new Date();
  return computeDiscoveryFacets(normalizedFilters, now, executor);
}
