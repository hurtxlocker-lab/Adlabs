import { db as defaultDb } from "@/db/client";
import { adDiscoveryIndex } from "@/db/schema";
import type { DbOrTx } from "@/ingestion/persistence/types";
import { and, sql } from "drizzle-orm";
import {
  CREATIVE_REUSE_BANDS,
  EU_REACH_BANDS,
  INSTAGRAM_FOLLOWER_BANDS,
} from "./bands";
import { compileDiscoveryPredicates } from "./predicates";
import type {
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

/**
 * Builds disjunctive facet aggregations against `ad_discovery_index`.
 * For each facet dimension, all currently active filters are applied EXCEPT that facet's own group.
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
    return preds.length > 0 ? and(...preds) : sql`1=1`;
  };

  // Run facet queries concurrently
  const [
    mediaTypesRes,
    shapeFamiliesRes,
    ctaTypesRes,
    platformsRes,
    pageCategoriesRes,
    targetCountriesRes,
    reachedCountriesRes,
    transparencyRes,
    euReachBandsRes,
    reuseBandsRes,
    igFollowerBandsRes,
  ] = await Promise.all([
    // 1. Media Types (Excludes MEDIA_TYPE)
    dbClient.execute<QueryDbResult>(sql`
      SELECT ${adDiscoveryIndex.representativeMediaType} as val, count(*)::int as cnt
      FROM ${adDiscoveryIndex}
      WHERE ${getWhere("MEDIA_TYPE")} AND ${adDiscoveryIndex.representativeMediaType} IS NOT NULL
      GROUP BY ${adDiscoveryIndex.representativeMediaType}
      ORDER BY cnt DESC, val ASC
    `),

    // 2. Shape Families (Excludes SHAPE)
    dbClient.execute<QueryDbResult>(sql`
      SELECT ${adDiscoveryIndex.representativeShapeFamily} as val, count(*)::int as cnt
      FROM ${adDiscoveryIndex}
      WHERE ${getWhere("SHAPE")} AND ${adDiscoveryIndex.representativeShapeFamily} IS NOT NULL
      GROUP BY ${adDiscoveryIndex.representativeShapeFamily}
      ORDER BY cnt DESC, val ASC
    `),

    // 3. CTA Types (Excludes CTA)
    dbClient.execute<QueryDbResult>(sql`
      SELECT ${adDiscoveryIndex.ctaType} as val, count(*)::int as cnt
      FROM ${adDiscoveryIndex}
      WHERE ${getWhere("CTA")} AND ${adDiscoveryIndex.ctaType} IS NOT NULL
      GROUP BY ${adDiscoveryIndex.ctaType}
      ORDER BY cnt DESC, val ASC
    `),

    // 4. Publisher Platforms (Excludes PLATFORM)
    dbClient.execute<QueryDbResult>(sql`
      SELECT unnest(${adDiscoveryIndex.publisherPlatforms}) as val, count(*)::int as cnt
      FROM ${adDiscoveryIndex}
      WHERE ${getWhere("PLATFORM")}
      GROUP BY val
      ORDER BY cnt DESC, val ASC
    `),

    // 5. Page Categories (Excludes PAGE_CATEGORY)
    dbClient.execute<QueryDbResult>(sql`
      SELECT ${adDiscoveryIndex.latestPageCategory} as val, count(*)::int as cnt
      FROM ${adDiscoveryIndex}
      WHERE ${getWhere("PAGE_CATEGORY")} AND ${adDiscoveryIndex.latestPageCategory} IS NOT NULL
      GROUP BY ${adDiscoveryIndex.latestPageCategory}
      ORDER BY cnt DESC, val ASC
    `),

    // 6. Target Countries (Excludes TARGET_COUNTRY)
    dbClient.execute<QueryDbResult>(sql`
      SELECT unnest(${adDiscoveryIndex.targetCountries}) as val, count(*)::int as cnt
      FROM ${adDiscoveryIndex}
      WHERE ${getWhere("TARGET_COUNTRY")}
      GROUP BY val
      ORDER BY cnt DESC, val ASC
    `),

    // 7. Reached Countries (Excludes REACHED_COUNTRY)
    dbClient.execute<QueryDbResult>(sql`
      SELECT unnest(${adDiscoveryIndex.reachedCountries}) as val, count(*)::int as cnt
      FROM ${adDiscoveryIndex}
      WHERE ${getWhere("REACHED_COUNTRY")}
      GROUP BY val
      ORDER BY cnt DESC, val ASC
    `),

    // 8. Transparency Evidence (Excludes TRANSPARENCY_*)
    dbClient.execute<TransparencyDbResult>(sql`
      SELECT
        count(*) FILTER (WHERE ${adDiscoveryIndex.hasEuTransparencyEvidence} = true)::int as eu_true,
        count(*) FILTER (WHERE ${adDiscoveryIndex.hasEuTransparencyEvidence} = false)::int as eu_false,
        count(*) FILTER (WHERE ${adDiscoveryIndex.hasUkTransparencyEvidence} = true)::int as uk_true,
        count(*) FILTER (WHERE ${adDiscoveryIndex.hasUkTransparencyEvidence} = false)::int as uk_false,
        count(*) FILTER (WHERE ${adDiscoveryIndex.hasBrTransparencyEvidence} = true)::int as br_true,
        count(*) FILTER (WHERE ${adDiscoveryIndex.hasBrTransparencyEvidence} = false)::int as br_false
      FROM ${adDiscoveryIndex}
      WHERE ${getWhere(["TRANSPARENCY_EU", "TRANSPARENCY_UK", "TRANSPARENCY_BR"])}
    `),

    // 9. EU Reach Bands (Excludes EU_REACH)
    dbClient.execute<BandDbResult>(sql`
      SELECT
        CASE
          WHEN ${adDiscoveryIndex.latestEuTotalReach} >= 0 AND ${adDiscoveryIndex.latestEuTotalReach} < 1000 THEN 'LT_1K'
          WHEN ${adDiscoveryIndex.latestEuTotalReach} >= 1000 AND ${adDiscoveryIndex.latestEuTotalReach} < 10000 THEN '1K_10K'
          WHEN ${adDiscoveryIndex.latestEuTotalReach} >= 10000 AND ${adDiscoveryIndex.latestEuTotalReach} < 50000 THEN '10K_50K'
          WHEN ${adDiscoveryIndex.latestEuTotalReach} >= 50000 AND ${adDiscoveryIndex.latestEuTotalReach} < 100000 THEN '50K_100K'
          WHEN ${adDiscoveryIndex.latestEuTotalReach} >= 100000 THEN '100K_PLUS'
        END as band_key,
        count(*)::int as cnt
      FROM ${adDiscoveryIndex}
      WHERE ${getWhere("EU_REACH")} AND ${adDiscoveryIndex.latestEuTotalReach} IS NOT NULL
      GROUP BY band_key
    `),

    // 10. Creative Reuse Bands (Excludes REUSE)
    dbClient.execute<BandDbResult>(sql`
      SELECT
        CASE
          WHEN ${adDiscoveryIndex.exactCreativeReuseCount} = 1 THEN '1'
          WHEN ${adDiscoveryIndex.exactCreativeReuseCount} >= 2 AND ${adDiscoveryIndex.exactCreativeReuseCount} <= 3 THEN '2_3'
          WHEN ${adDiscoveryIndex.exactCreativeReuseCount} >= 4 AND ${adDiscoveryIndex.exactCreativeReuseCount} <= 10 THEN '4_10'
          WHEN ${adDiscoveryIndex.exactCreativeReuseCount} >= 11 THEN '11_PLUS'
        END as band_key,
        count(*)::int as cnt
      FROM ${adDiscoveryIndex}
      WHERE ${getWhere("REUSE")} AND ${adDiscoveryIndex.exactCreativeReuseCount} IS NOT NULL
      GROUP BY band_key
    `),

    // 11. Instagram Follower Bands (Excludes INSTAGRAM_FOLLOWERS)
    dbClient.execute<BandDbResult>(sql`
      SELECT
        CASE
          WHEN ${adDiscoveryIndex.latestInstagramFollowers} >= 0 AND ${adDiscoveryIndex.latestInstagramFollowers} < 10000 THEN 'LT_10K'
          WHEN ${adDiscoveryIndex.latestInstagramFollowers} >= 10000 AND ${adDiscoveryIndex.latestInstagramFollowers} < 50000 THEN '10K_50K'
          WHEN ${adDiscoveryIndex.latestInstagramFollowers} >= 50000 AND ${adDiscoveryIndex.latestInstagramFollowers} < 100000 THEN '50K_100K'
          WHEN ${adDiscoveryIndex.latestInstagramFollowers} >= 100000 AND ${adDiscoveryIndex.latestInstagramFollowers} < 500000 THEN '100K_500K'
          WHEN ${adDiscoveryIndex.latestInstagramFollowers} >= 500000 THEN '500K_PLUS'
        END as band_key,
        count(*)::int as cnt
      FROM ${adDiscoveryIndex}
      WHERE ${getWhere("INSTAGRAM_FOLLOWERS")} AND ${adDiscoveryIndex.latestInstagramFollowers} IS NOT NULL
      GROUP BY band_key
    `),
  ]);

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

  const transList = Array.isArray(transparencyRes)
    ? (transparencyRes as TransparencyDbResult[])
    : ((transparencyRes as { rows?: TransparencyDbResult[] })?.rows ?? []);
  const transRow = transList[0] ?? {
    eu_true: 0,
    eu_false: 0,
    uk_true: 0,
    uk_false: 0,
    br_true: 0,
    br_false: 0,
  };

  return {
    mediaTypes: mapCounts(mediaTypesRes),
    shapeFamilies: mapCounts(shapeFamiliesRes) as FacetValueCount<CreativeShapeFamily>[],
    ctaTypes: mapCounts(ctaTypesRes),
    publisherPlatforms: mapCounts(platformsRes),
    pageCategories: mapCounts(pageCategoriesRes),
    targetCountries: mapCounts(targetCountriesRes),
    reachedCountries: mapCounts(reachedCountriesRes),
    transparencyEvidence: {
      EU: {
        true: Number(transRow.eu_true),
        false: Number(transRow.eu_false),
      },
      UK: {
        true: Number(transRow.uk_true),
        false: Number(transRow.uk_false),
      },
      BR: {
        true: Number(transRow.br_true),
        false: Number(transRow.br_false),
      },
    },
    euReachBands: mapBands(euReachBandsRes, EU_REACH_BANDS),
    creativeReuseBands: mapBands(reuseBandsRes, CREATIVE_REUSE_BANDS),
    instagramFollowerBands: mapBands(igFollowerBandsRes, INSTAGRAM_FOLLOWER_BANDS),
  };
}
