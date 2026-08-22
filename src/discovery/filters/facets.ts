import { db as defaultDb } from "@/db/client";
import { adDiscoveryIndex, brands } from "@/db/schema";
import type { DbOrTx } from "@/ingestion/persistence/types";
import { and, sql } from "drizzle-orm";
import {
  CREATIVE_REUSE_BANDS,
  EU_REACH_BANDS,
  INSTAGRAM_FOLLOWER_BANDS,
} from "./bands";
import { compileDiscoveryPredicates } from "./predicates";
import type {
  BrandFacetItem,
  DiscoveryFacetsResult,
  DiscoveryFilterGroup,
  FacetBandCount,
  FacetValueCount,
  NormalizedDiscoveryFilters,
} from "./types";
import type { CreativeShapeFamily } from "@/features/discover/utils/creative-shape";

interface QueryDbResult extends Record<string, unknown> {
  val: string | null;
  cnt: string | number;
}

interface BandDbResult extends Record<string, unknown> {
  band_key: string | null;
  cnt: string | number;
}

interface TransparencyDbResult extends Record<string, unknown> {
  eu_true: string | number;
  eu_false: string | number;
  uk_true: string | number;
  uk_false: string | number;
  br_true: string | number;
  br_false: string | number;
}

interface BrandFacetDbResult extends Record<string, unknown> {
  brand_id: string;
  brand_name: string;
  cnt: string | number;
}

/**
 * Executes an array of async tasks with bounded concurrency to protect the connection pool.
 */
async function runWithConcurrency(
  tasks: Array<() => Promise<unknown>>,
  concurrency = 3,
): Promise<unknown[]> {
  const results: unknown[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      results[idx] = await tasks[idx]();
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

/**
 * Builds disjunctive facet aggregations against `ad_discovery_index` counting distinct creative groups.
 * For each facet dimension, all currently active filters are applied EXCEPT that facet's own group.
 * Group identity: (brand_id, COALESCE(representative_media_sha256, ad_id::text))
 */
export async function computeDiscoveryFacets(
  filters: NormalizedDiscoveryFilters,
  now: Date = new Date(),
  executor?: DbOrTx,
): Promise<DiscoveryFacetsResult> {
  const dbClient = executor ?? defaultDb;

  // Helper to compile WHERE condition with group exclusion
  const getWhere = (excludeGroup?: DiscoveryFilterGroup | DiscoveryFilterGroup[]) => {
    const excluded = excludeGroup
      ? Array.isArray(excludeGroup)
        ? excludeGroup
        : [excludeGroup]
      : [];
    const preds = compileDiscoveryPredicates({
      filters,
      now,
      excludeGroups: excluded,
    });
    return preds.length > 0
      ? and(...preds, sql`${adDiscoveryIndex.representativeMediaSha256} IS NOT NULL`)
      : sql`${adDiscoveryIndex.representativeMediaSha256} IS NOT NULL`;
  };

  // Expression for unique creative group count
  const groupCountExpr = sql`count(DISTINCT ${adDiscoveryIndex.brandId}::text || ':' || ${adDiscoveryIndex.representativeMediaSha256})::int`;

  // Define 12 facet query tasks
  const tasks: Array<() => Promise<unknown>> = [
    // 0. Media Types (Excludes MEDIA_TYPE)
    () =>
      dbClient.execute<QueryDbResult>(sql`
        SELECT ${adDiscoveryIndex.representativeMediaType} as val, ${groupCountExpr} as cnt
        FROM ${adDiscoveryIndex}
        WHERE ${getWhere("MEDIA_TYPE")} AND ${adDiscoveryIndex.representativeMediaType} IS NOT NULL
        GROUP BY ${adDiscoveryIndex.representativeMediaType}
        ORDER BY cnt DESC
      `),

    // 1. Shape Families (Excludes SHAPE)
    () =>
      dbClient.execute<QueryDbResult>(sql`
        SELECT ${adDiscoveryIndex.representativeShapeFamily} as val, ${groupCountExpr} as cnt
        FROM ${adDiscoveryIndex}
        WHERE ${getWhere("SHAPE")} AND ${adDiscoveryIndex.representativeShapeFamily} IS NOT NULL
        GROUP BY ${adDiscoveryIndex.representativeShapeFamily}
        ORDER BY cnt DESC
      `),

    // 2. CTA Types (Excludes CTA)
    () =>
      dbClient.execute<QueryDbResult>(sql`
        SELECT ${adDiscoveryIndex.ctaType} as val, ${groupCountExpr} as cnt
        FROM ${adDiscoveryIndex}
        WHERE ${getWhere("CTA")} AND ${adDiscoveryIndex.ctaType} IS NOT NULL
        GROUP BY ${adDiscoveryIndex.ctaType}
        ORDER BY cnt DESC
      `),

    // 3. Publisher Platforms (Excludes PLATFORM)
    () =>
      dbClient.execute<QueryDbResult>(sql`
        SELECT unnest(${adDiscoveryIndex.publisherPlatforms}) as val, ${groupCountExpr} as cnt
        FROM ${adDiscoveryIndex}
        WHERE ${getWhere("PLATFORM")}
        GROUP BY val
        ORDER BY cnt DESC
      `),

    // 4. Page Categories (Excludes PAGE_CATEGORY)
    () =>
      dbClient.execute<QueryDbResult>(sql`
        SELECT ${adDiscoveryIndex.latestPageCategory} as val, ${groupCountExpr} as cnt
        FROM ${adDiscoveryIndex}
        WHERE ${getWhere("PAGE_CATEGORY")} AND ${adDiscoveryIndex.latestPageCategory} IS NOT NULL
        GROUP BY ${adDiscoveryIndex.latestPageCategory}
        ORDER BY cnt DESC
      `),

    // 5. Target Countries (Excludes TARGET_COUNTRY)
    () =>
      dbClient.execute<QueryDbResult>(sql`
        SELECT unnest(${adDiscoveryIndex.targetCountries}) as val, ${groupCountExpr} as cnt
        FROM ${adDiscoveryIndex}
        WHERE ${getWhere("TARGET_COUNTRY")}
        GROUP BY val
        ORDER BY cnt DESC
      `),

    // 6. Reached Countries (Excludes REACHED_COUNTRY)
    () =>
      dbClient.execute<QueryDbResult>(sql`
        SELECT unnest(${adDiscoveryIndex.reachedCountries}) as val, ${groupCountExpr} as cnt
        FROM ${adDiscoveryIndex}
        WHERE ${getWhere("REACHED_COUNTRY")}
        GROUP BY val
        ORDER BY cnt DESC
      `),

    // 7. Transparency Presence (Excludes all transparency groups)
    () =>
      dbClient.execute<TransparencyDbResult>(sql`
        SELECT
          count(DISTINCT CASE WHEN ${adDiscoveryIndex.hasEuTransparencyEvidence} = true THEN ${adDiscoveryIndex.brandId}::text || ':' || ${adDiscoveryIndex.representativeMediaSha256} END)::int as eu_true,
          count(DISTINCT CASE WHEN ${adDiscoveryIndex.hasEuTransparencyEvidence} = false THEN ${adDiscoveryIndex.brandId}::text || ':' || ${adDiscoveryIndex.representativeMediaSha256} END)::int as eu_false,
          count(DISTINCT CASE WHEN ${adDiscoveryIndex.hasUkTransparencyEvidence} = true THEN ${adDiscoveryIndex.brandId}::text || ':' || ${adDiscoveryIndex.representativeMediaSha256} END)::int as uk_true,
          count(DISTINCT CASE WHEN ${adDiscoveryIndex.hasUkTransparencyEvidence} = false THEN ${adDiscoveryIndex.brandId}::text || ':' || ${adDiscoveryIndex.representativeMediaSha256} END)::int as uk_false,
          count(DISTINCT CASE WHEN ${adDiscoveryIndex.hasBrTransparencyEvidence} = true THEN ${adDiscoveryIndex.brandId}::text || ':' || ${adDiscoveryIndex.representativeMediaSha256} END)::int as br_true,
          count(DISTINCT CASE WHEN ${adDiscoveryIndex.hasBrTransparencyEvidence} = false THEN ${adDiscoveryIndex.brandId}::text || ':' || ${adDiscoveryIndex.representativeMediaSha256} END)::int as br_false
        FROM ${adDiscoveryIndex}
        WHERE ${getWhere(["TRANSPARENCY_EU", "TRANSPARENCY_UK", "TRANSPARENCY_BR"])}
      `),

    // 8. EU Reach Bands (Excludes EU_REACH)
    () =>
      dbClient.execute<BandDbResult>(sql`
        SELECT
          CASE
            WHEN ${adDiscoveryIndex.latestEuTotalReach} >= 0 AND ${adDiscoveryIndex.latestEuTotalReach} < 1000 THEN 'LT_1K'
            WHEN ${adDiscoveryIndex.latestEuTotalReach} >= 1000 AND ${adDiscoveryIndex.latestEuTotalReach} < 10000 THEN '1K_10K'
            WHEN ${adDiscoveryIndex.latestEuTotalReach} >= 10000 AND ${adDiscoveryIndex.latestEuTotalReach} < 50000 THEN '10K_50K'
            WHEN ${adDiscoveryIndex.latestEuTotalReach} >= 50000 AND ${adDiscoveryIndex.latestEuTotalReach} < 100000 THEN '50K_100K'
            WHEN ${adDiscoveryIndex.latestEuTotalReach} >= 100000 THEN '100K_PLUS'
          END as band_key,
          ${groupCountExpr} as cnt
        FROM ${adDiscoveryIndex}
        WHERE ${getWhere("EU_REACH")} AND ${adDiscoveryIndex.latestEuTotalReach} IS NOT NULL
        GROUP BY band_key
      `),

    // 9. Creative Reuse Bands (Excludes REUSE)
    () =>
      dbClient.execute<BandDbResult>(sql`
        SELECT
          CASE
            WHEN ${adDiscoveryIndex.exactCreativeReuseCount} = 1 THEN '1'
            WHEN ${adDiscoveryIndex.exactCreativeReuseCount} >= 2 AND ${adDiscoveryIndex.exactCreativeReuseCount} <= 3 THEN '2_3'
            WHEN ${adDiscoveryIndex.exactCreativeReuseCount} >= 4 AND ${adDiscoveryIndex.exactCreativeReuseCount} <= 10 THEN '4_10'
            WHEN ${adDiscoveryIndex.exactCreativeReuseCount} >= 11 THEN '11_PLUS'
          END as band_key,
          ${groupCountExpr} as cnt
        FROM ${adDiscoveryIndex}
        WHERE ${getWhere("REUSE")} AND ${adDiscoveryIndex.exactCreativeReuseCount} IS NOT NULL
        GROUP BY band_key
      `),

    // 10. Instagram Follower Bands (Excludes INSTAGRAM_FOLLOWERS)
    () =>
      dbClient.execute<BandDbResult>(sql`
        SELECT
          CASE
            WHEN ${adDiscoveryIndex.latestInstagramFollowers} >= 0 AND ${adDiscoveryIndex.latestInstagramFollowers} < 10000 THEN 'LT_10K'
            WHEN ${adDiscoveryIndex.latestInstagramFollowers} >= 10000 AND ${adDiscoveryIndex.latestInstagramFollowers} < 50000 THEN '10K_50K'
            WHEN ${adDiscoveryIndex.latestInstagramFollowers} >= 50000 AND ${adDiscoveryIndex.latestInstagramFollowers} < 100000 THEN '50K_100K'
            WHEN ${adDiscoveryIndex.latestInstagramFollowers} >= 100000 AND ${adDiscoveryIndex.latestInstagramFollowers} < 500000 THEN '100K_500K'
            WHEN ${adDiscoveryIndex.latestInstagramFollowers} >= 500000 THEN '500K_PLUS'
          END as band_key,
          ${groupCountExpr} as cnt
        FROM ${adDiscoveryIndex}
        WHERE ${getWhere("INSTAGRAM_FOLLOWERS")} AND ${adDiscoveryIndex.latestInstagramFollowers} IS NOT NULL
        GROUP BY band_key
      `),

    // 11. Brands (Disjunctive — excludes IDENTITY group, joins brands for display name)
    () =>
      dbClient.execute<BrandFacetDbResult>(sql`
        SELECT
          ${adDiscoveryIndex.brandId} as brand_id,
          ${brands.name} as brand_name,
          ${groupCountExpr} as cnt
        FROM ${adDiscoveryIndex}
        INNER JOIN ${brands} ON ${brands.id} = ${adDiscoveryIndex.brandId}
        WHERE ${getWhere("IDENTITY")}
        GROUP BY ${adDiscoveryIndex.brandId}, ${brands.name}
        ORDER BY cnt DESC, ${brands.name} ASC
      `),
  ];

  const results = await runWithConcurrency(tasks, 3);

  const mediaTypesRes = results[0];
  const shapeFamiliesRes = results[1];
  const ctaTypesRes = results[2];
  const platformsRes = results[3];
  const pageCategoriesRes = results[4];
  const targetCountriesRes = results[5];
  const reachedCountriesRes = results[6];
  const transparencyRes = results[7];
  const euReachBandsRes = results[8];
  const reuseBandsRes = results[9];
  const igFollowerBandsRes = results[10];
  const brandsRes = results[11];

  const mapCounts = (rows: unknown): FacetValueCount<string>[] => {
    const list = Array.isArray(rows)
      ? (rows as QueryDbResult[])
      : ((rows as { rows?: QueryDbResult[] })?.rows ?? []);
    return list
      .filter((r) => r.val != null && String(r.val).trim().length > 0)
      .map((r) => ({
        value: String(r.val),
        count: Number(r.cnt),
      }));
  };

  const mapBands = (
    rows: unknown,
    defs: typeof EU_REACH_BANDS,
  ): FacetBandCount[] => {
    const list = Array.isArray(rows)
      ? (rows as BandDbResult[])
      : ((rows as { rows?: BandDbResult[] })?.rows ?? []);
    const countMap = new Map<string, number>();
    for (const r of list) {
      if (r.band_key) {
        countMap.set(r.band_key, Number(r.cnt));
      }
    }
    return defs.map((def) => ({
      key: def.key,
      label: def.label,
      count: countMap.get(def.key) ?? 0,
    }));
  };

  const mapTransparency = (rows: unknown) => {
    const list = Array.isArray(rows)
      ? (rows as TransparencyDbResult[])
      : ((rows as { rows?: TransparencyDbResult[] })?.rows ?? []);
    const row = list[0];
    return {
      EU: {
        true: row ? Number(row.eu_true) : 0,
        false: row ? Number(row.eu_false) : 0,
      },
      UK: {
        true: row ? Number(row.uk_true) : 0,
        false: row ? Number(row.uk_false) : 0,
      },
      BR: {
        true: row ? Number(row.br_true) : 0,
        false: row ? Number(row.br_false) : 0,
      },
    };
  };

  const mapBrands = (rows: unknown): BrandFacetItem[] => {
    const list = Array.isArray(rows)
      ? (rows as BrandFacetDbResult[])
      : ((rows as { rows?: BrandFacetDbResult[] })?.rows ?? []);
    return list.map((r) => ({
      brandId: r.brand_id,
      brandName: r.brand_name,
      count: Number(r.cnt),
    }));
  };

  return {
    mediaTypes: mapCounts(mediaTypesRes),
    shapeFamilies: mapCounts(shapeFamiliesRes) as FacetValueCount<CreativeShapeFamily>[],
    ctaTypes: mapCounts(ctaTypesRes),
    publisherPlatforms: mapCounts(platformsRes),
    pageCategories: mapCounts(pageCategoriesRes),
    targetCountries: mapCounts(targetCountriesRes),
    reachedCountries: mapCounts(reachedCountriesRes),
    transparencyEvidence: mapTransparency(transparencyRes),
    euReachBands: mapBands(euReachBandsRes, EU_REACH_BANDS),
    creativeReuseBands: mapBands(reuseBandsRes, CREATIVE_REUSE_BANDS),
    instagramFollowerBands: mapBands(igFollowerBandsRes, INSTAGRAM_FOLLOWER_BANDS),
    brands: mapBrands(brandsRes),
  };
}
