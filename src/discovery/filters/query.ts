import { db as defaultDb } from "@/db/client";
import { adDiscoveryIndex, brands } from "@/db/schema";
import type { DbOrTx } from "@/ingestion/persistence/types";
import { and, sql, type SQL } from "drizzle-orm";
import {
  decodeDiscoveryCursor,
  encodeDiscoveryCursor,
  compileCursorPredicate,
} from "./cursor";
import { computeDiscoveryFacets } from "./facets";
import { normalizeDiscoveryFilters } from "./normalize";
import { compileDiscoveryPredicates } from "./predicates";
import { getDiscoverySortClauses, getDiscoveryGroupedSortClauses } from "./sort";
import type {
  DiscoveryCreativeGroupItem,
  DiscoveryFacetsResult,
  DiscoverySort,
  NormalizedDiscoveryFilters,
  QueryDiscoveryAdsOptions,
  QueryDiscoveryAdsResult,
  QueryDiscoveryCreativesOptions,
  QueryDiscoveryCreativesResult,
  QueryDiscoveryFacetsOptions,
} from "./types";

interface CreativeGroupDbRow extends Record<string, unknown> {
  group_key: string;
  brand_id: string;
  brand_name: string;
  brand_slug: string;
  representative_ad_id: string;
  representative_media_sha256: string | null;
  representative_media_type: string | null;
  representative_shape_family: string | null;
  representative_aspect_ratio: string | number | null;
  video_duration_ms: number | null;
  exact_reuse_count: number;
  sibling_ad_ids: string[];
  has_eu_transparency_evidence: boolean | null;
  latest_eu_total_reach: string | number | null;
  has_uk_transparency_evidence: boolean | null;
  latest_uk_total_reach: string | number | null;
  latest_instagram_followers: string | number | null;
  max_last_seen_at: Date | string;
  min_start_date: Date | string | null;
  total_creatives_count: number;
  total_canonical_ads_count: number;
  brand_round?: number;
}

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
 * Executes an exact creative group query against `ad_discovery_index` joining `brands`.
 *
 * Exact creative group identity: `(brand_id, COALESCE(representative_media_sha256, ad_id::text))`
 *
 * Enforces:
 *  - Grouping before pagination.
 *  - Deterministic representative ad selection (highest last_seen_at / rank).
 *  - Total filtered creative count + total canonical ad count computed in-pass.
 *  - Brand-diverse explore mode via window-function rounds.
 *  - Strict analytical sorting when explicitly selected.
 */
export async function queryDiscoveryCreatives(
  options: QueryDiscoveryCreativesOptions = {},
  executor?: DbOrTx,
): Promise<QueryDiscoveryCreativesResult> {
  const dbClient = executor ?? defaultDb;
  const now = options.now ?? new Date();
  const sort: DiscoverySort = options.sort ?? "EXPLORE";
  const pageSize = Math.min(Math.max(options.pageSize ?? 72, 1), 500);
  const offset = Math.max(options.offset ?? 0, 0);

  const normalizedFilters = options.filters
    ? "brandIds" in options.filters &&
      Array.isArray(options.filters.brandIds) &&
      (options.filters.startedAfter instanceof Date ||
        options.filters.startedAfter === undefined)
      ? (options.filters as NormalizedDiscoveryFilters)
      : normalizeDiscoveryFilters(options.filters)
    : normalizeDiscoveryFilters({});

  const predicates = compileDiscoveryPredicates({
    filters: normalizedFilters,
    now,
  });

  const baseWhere =
    predicates.length > 0
      ? and(...predicates, sql`${adDiscoveryIndex.representativeMediaSha256} IS NOT NULL`)
      : sql`${adDiscoveryIndex.representativeMediaSha256} IS NOT NULL`;
  const sortClauses = getDiscoveryGroupedSortClauses(sort);

  const result = await dbClient.execute<CreativeGroupDbRow>(sql`
    WITH base_filtered AS (
      SELECT
        ${adDiscoveryIndex.adId} as ad_id,
        ${adDiscoveryIndex.brandId} as brand_id,
        ${brands.name} as brand_name,
        ${brands.slug} as brand_slug,
        ${adDiscoveryIndex.lastSeenAt} as last_seen_at,
        ${adDiscoveryIndex.startDate} as start_date,
        ${adDiscoveryIndex.representativeMediaType} as representative_media_type,
        ${adDiscoveryIndex.representativeMediaSha256} as representative_media_sha256,
        ${adDiscoveryIndex.representativeShapeFamily} as representative_shape_family,
        ${adDiscoveryIndex.representativeAspectRatio} as representative_aspect_ratio,
        ${adDiscoveryIndex.videoDurationMs} as video_duration_ms,
        ${adDiscoveryIndex.ctaType} as cta_type,
        ${adDiscoveryIndex.publisherPlatforms} as publisher_platforms,
        ${adDiscoveryIndex.latestPageCategory} as latest_page_category,
        ${adDiscoveryIndex.hasEuTransparencyEvidence} as has_eu_transparency_evidence,
        ${adDiscoveryIndex.latestEuTotalReach} as latest_eu_total_reach,
        ${adDiscoveryIndex.hasUkTransparencyEvidence} as has_uk_transparency_evidence,
        ${adDiscoveryIndex.latestUkTotalReach} as latest_uk_total_reach,
        ${adDiscoveryIndex.latestInstagramFollowers} as latest_instagram_followers,
        ${adDiscoveryIndex.brandId}::text || ':' || ${adDiscoveryIndex.representativeMediaSha256} as group_key
      FROM ${adDiscoveryIndex}
      JOIN ${brands} ON ${brands.id} = ${adDiscoveryIndex.brandId}
      WHERE ${baseWhere}
    ),
    grouped_creatives AS (
      SELECT
        group_key,
        brand_id,
        (ARRAY_AGG(brand_name))[1] as brand_name,
        (ARRAY_AGG(brand_slug))[1] as brand_slug,
        (ARRAY_AGG(representative_media_sha256))[1] as representative_media_sha256,
        (ARRAY_AGG(representative_media_type ORDER BY last_seen_at DESC))[1] as representative_media_type,
        (ARRAY_AGG(representative_shape_family ORDER BY last_seen_at DESC))[1] as representative_shape_family,
        (ARRAY_AGG(representative_aspect_ratio ORDER BY last_seen_at DESC))[1] as representative_aspect_ratio,
        MAX(video_duration_ms) as video_duration_ms,
        COUNT(*)::int as exact_reuse_count,
        (ARRAY_AGG(ad_id ORDER BY last_seen_at DESC, ad_id ASC))[1] as representative_ad_id,
        ARRAY_AGG(ad_id ORDER BY last_seen_at DESC, ad_id ASC) as sibling_ad_ids,
        BOOL_OR(has_eu_transparency_evidence) as has_eu_transparency_evidence,
        (ARRAY_AGG(latest_eu_total_reach ORDER BY last_seen_at DESC, ad_id ASC))[1] as latest_eu_total_reach,
        BOOL_OR(has_uk_transparency_evidence) as has_uk_transparency_evidence,
        (ARRAY_AGG(latest_uk_total_reach ORDER BY last_seen_at DESC, ad_id ASC))[1] as latest_uk_total_reach,
        (ARRAY_AGG(latest_instagram_followers ORDER BY last_seen_at DESC, ad_id ASC))[1] as latest_instagram_followers,
        MAX(last_seen_at) as max_last_seen_at,
        MIN(start_date) as min_start_date
      FROM base_filtered
      GROUP BY group_key, brand_id
    ),
    ranked_creatives AS (
      SELECT
        *,
        COUNT(*) OVER()::int as total_creatives_count,
        SUM(exact_reuse_count) OVER()::int as total_canonical_ads_count,
        ROW_NUMBER() OVER (
          PARTITION BY brand_id
          ORDER BY max_last_seen_at DESC, representative_ad_id ASC
        ) as brand_round
      FROM grouped_creatives
    )
    SELECT *
    FROM ranked_creatives
    ORDER BY ${sql.join(sortClauses, sql`, `)}
    LIMIT ${pageSize + 1} OFFSET ${offset}
  `);

  const rawRows: CreativeGroupDbRow[] = Array.isArray(result)
    ? (result as CreativeGroupDbRow[])
    : ((result as { rows?: CreativeGroupDbRow[] })?.rows ?? []);

  const hasMore = rawRows.length > pageSize;
  const pageRows = hasMore ? rawRows.slice(0, pageSize) : rawRows;

  const totalCreativesCount = pageRows[0]?.total_creatives_count ?? 0;
  const totalCanonicalAdsCount = pageRows[0]?.total_canonical_ads_count ?? 0;

  const items: DiscoveryCreativeGroupItem[] = pageRows.map((r) => ({
    groupKey: r.group_key,
    brandId: r.brand_id,
    brandName: r.brand_name,
    brandSlug: r.brand_slug,
    representativeAdId: r.representative_ad_id,
    representativeMediaSha256: r.representative_media_sha256,
    representativeMediaType: r.representative_media_type as "VIDEO" | "IMAGE" | null,
    representativeShapeFamily: r.representative_shape_family,
    representativeAspectRatio: r.representative_aspect_ratio != null ? Number(r.representative_aspect_ratio) : null,
    videoDurationMs: r.video_duration_ms,
    exactReuseCount: r.exact_reuse_count,
    siblingAdIds: r.sibling_ad_ids ?? [r.representative_ad_id],
    hasEuTransparencyEvidence: Boolean(r.has_eu_transparency_evidence),
    latestEuTotalReach: r.latest_eu_total_reach != null ? BigInt(r.latest_eu_total_reach) : null,
    hasUkTransparencyEvidence: Boolean(r.has_uk_transparency_evidence),
    latestUkTotalReach: r.latest_uk_total_reach != null ? BigInt(r.latest_uk_total_reach) : null,
    latestInstagramFollowers: r.latest_instagram_followers != null ? BigInt(r.latest_instagram_followers) : null,
    maxLastSeenAt: r.max_last_seen_at instanceof Date ? r.max_last_seen_at : new Date(r.max_last_seen_at),
    minStartDate: r.min_start_date ? (r.min_start_date instanceof Date ? r.min_start_date : new Date(r.min_start_date)) : null,
  }));

  return {
    items,
    totalCreativesCount,
    totalCanonicalAdsCount,
    pageSize,
    offset,
    hasMore,
  };
}

/**
 * Builds cursor values tuple for canonical ad queries.
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
    case "EXPLORE":
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
        row.latest_instagram_followers != null
          ? String(row.latest_instagram_followers)
          : null,
        lastSeenIso,
        row.ad_id,
      ];

    case "CREATIVE_REUSE_DESC":
    case "CREATIVE_REUSE_ASC":
      return [
        row.exact_creative_reuse_count != null
          ? row.exact_creative_reuse_count
          : null,
        lastSeenIso,
        row.ad_id,
      ];

    default:
      return [lastSeenIso, row.ad_id];
  }
}

/**
 * Queries canonical individual ads directly from `ad_discovery_index`.
 * Kept for backward compatibility and internal canonical inspections.
 */
export async function queryDiscoveryAds(
  options: QueryDiscoveryAdsOptions = {},
  executor?: DbOrTx,
): Promise<QueryDiscoveryAdsResult> {
  const dbClient = executor ?? defaultDb;
  const now = options.now ?? new Date();
  const sort: DiscoverySort = options.sort ?? "RECENTLY_SEEN";
  const pageSize = Math.min(options.pageSize ?? 50, 100);

  const normalizedFilters = options.filters
    ? "brandIds" in options.filters &&
      Array.isArray(options.filters.brandIds) &&
      (options.filters.startedAfter instanceof Date ||
        options.filters.startedAfter === undefined)
      ? (options.filters as NormalizedDiscoveryFilters)
      : normalizeDiscoveryFilters(options.filters)
    : normalizeDiscoveryFilters({});

  const predicates = compileDiscoveryPredicates({
    filters: normalizedFilters,
    now,
  });

  const baseWhere = predicates.length > 0 ? and(...predicates) : sql`1=1`;
  const sortClauses = getDiscoverySortClauses(sort, false);

  let rawRows: AdDiscoveryDbRow[];

  if (options.limitPerBrand && options.limitPerBrand > 0) {
    const outerSortClauses = getDiscoverySortClauses(sort, true);
    const outerCursorPredicate = options.cursor
      ? compileCursorPredicate(decodeDiscoveryCursor(options.cursor, sort), true)
      : null;

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
    const cursorPredicate = options.cursor
      ? compileCursorPredicate(decodeDiscoveryCursor(options.cursor, sort), false)
      : null;

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
  const pageRows = hasMore ? rawRows.slice(0, pageSize) : rawRows;

  let nextCursor: string | null = null;
  if (hasMore && pageRows.length > 0) {
    const lastItem = pageRows[pageRows.length - 1];
    nextCursor = encodeDiscoveryCursor({
      v: 1,
      sort,
      values: buildCursorValues(lastItem, sort),
    });
  }

  return {
    items: pageRows.map((r) => ({ adId: r.ad_id })),
    nextCursor,
  };
}

/**
 * Facet query facade forwarding to `computeDiscoveryFacets`.
 */
export async function queryDiscoveryFacets(
  options: QueryDiscoveryFacetsOptions = {},
  executor?: DbOrTx,
): Promise<DiscoveryFacetsResult> {
  const now = options.now ?? new Date();
  const normalizedFilters = options.filters
    ? "brandIds" in options.filters &&
      Array.isArray(options.filters.brandIds) &&
      (options.filters.startedAfter instanceof Date ||
        options.filters.startedAfter === undefined)
      ? (options.filters as NormalizedDiscoveryFilters)
      : normalizeDiscoveryFilters(options.filters)
    : normalizeDiscoveryFilters({});

  return computeDiscoveryFacets(normalizedFilters, now, executor);
}
