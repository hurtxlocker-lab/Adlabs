import "server-only";

/**
 * Brands Atlas — Production Read Model (Phase M1B)
 *
 * Single server-authoritative read model for the /brands surface.
 *
 * Query budget: EXACTLY two DB phases, zero N+1.
 *   Phase A — Brand-level factual aggregation (1 grouped query over ad_discovery_index)
 *   Phase B — Batched deterministic portrait resolution (1 ranked candidate query
 *             + batched browse-image-v1 derivative lookup
 *             + batched poster derivative lookup
 *             + batched original image lookup)
 *
 * Doctrine invariants:
 *   - EU and UK transparency data are NEVER summed together.
 *   - Aggregated reach: peakEuReach = MAX(single-ad reach),
 *     combinedEuReach = SUM(reported reach across observed ads; people may be counted >1x).
 *   - Target age ranges: EU and UK target age kept strictly separate.
 *   - Never resolves raw video bytes for display (browse-image-v1 -> poster -> original image).
 *   - Zero internal UUIDs leaked in public URLs (uses brand slugs).
 */

import { db } from "@/db/client";
import {
  adDiscoveryIndex,
  ads,
  brands,
  mediaAssets,
  mediaDerivatives,
} from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { resolveMediaUrl } from "@/storage/media-url";

export type BrandDirectorySort =
  | "MOST_CREATIVES"
  | "RECENTLY_ACTIVE"
  | "REACH_SCALE"
  | "SOCIAL_AUTHORITY";

export interface BrandDirectoryItem {
  brand: {
    slug: string;
    name: string;
    category: string | null;
  };
  creativeFootprint: {
    /** Total ads disclosed by Meta in the Ad Library (from Curious Coder payload `total`), or null if not reported. */
    libraryTotalAds: number | null;
    /** Distinct representative creative SHA-256 binaries in corpus. */
    creativeCount: number;
    /** Distinct representative creative SHA-256 binaries currently running in corpus. */
    activeCreativeCount: number;
    /** Canonical ad deployments currently running in corpus. */
    activeAdCount: number;
    /** Total ad rows in corpus. */
    scrapedAdCount: number;
    lastSeenAt: Date;
  };
  transparency: {
    hasEuEvidence: boolean;
    hasUkEvidence: boolean;
    /** MAX single-ad disclosed EU reach. */
    peakEuReach: number | null;
    /** SUM of disclosed EU reach across observed ads. */
    combinedEuReach: number | null;
    euTargetAgeMin: number | null;
    euTargetAgeMax: number | null;
    ukTargetAgeMin: number | null;
    ukTargetAgeMax: number | null;
  };
  authority: {
    instagramFollowers: number | null;
    facebookLikes: number | null;
  };
  portrait: {
    url: string;
    sourceKind: "IMAGE" | "VIDEO_POSTER";
  } | null;
}

interface BrandFactsRow extends Record<string, unknown> {
  brand_id: string;
  slug: string;
  name: string;
  category: string | null;
  creative_groups: string | number;
  active_groups: string | number;
  active_ads: string | number;
  scraped_ads: string | number;
  library_total_ads: string | number | null;
  last_seen_at: string;
  first_seen_at: string;
  has_eu: boolean;
  has_uk: boolean;
  eu_reach_max: string | number | null;
  eu_reach_combined: string | number | null;
  eu_age_min: number | null;
  eu_age_max: number | null;
  uk_age_min: number | null;
  uk_age_max: number | null;
  ig_followers: string | number | null;
  fb_likes: string | number | null;
}

interface PortraitCandidateRow extends Record<string, unknown> {
  brand_id: string;
  media_asset_id: string;
  media_type: string | null;
  storage_key: string | null;
  rank: number;
}

function num(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * PHASE A — Single grouped aggregate query over ad_discovery_index JOIN brands JOIN ads.
 * Binds sort order at SQL level for server-authoritative ordering.
 */
async function getBrandFacts(sort: BrandDirectorySort): Promise<BrandFactsRow[]> {
  const orderClause = (() => {
    switch (sort) {
      case "RECENTLY_ACTIVE":
        return sql`max(idx.last_seen_at) DESC, COALESCE(max(CASE WHEN (a.raw_last_payload->>'total') IS NOT NULL AND (a.raw_last_payload->>'total') ~ '^[0-9]+$' THEN (a.raw_last_payload->>'total')::int END), count(DISTINCT idx.representative_media_sha256)) DESC, b.name ASC`;
      case "REACH_SCALE":
        return sql`max(idx.latest_eu_total_reach) DESC NULLS LAST, count(DISTINCT idx.representative_media_sha256) DESC, b.name ASC`;
      case "SOCIAL_AUTHORITY":
        return sql`max(idx.latest_instagram_followers) DESC NULLS LAST, max(idx.latest_facebook_likes) DESC NULLS LAST, count(DISTINCT idx.representative_media_sha256) DESC, b.name ASC`;
      case "MOST_CREATIVES":
      default:
        return sql`COALESCE(max(CASE WHEN (a.raw_last_payload->>'total') IS NOT NULL AND (a.raw_last_payload->>'total') ~ '^[0-9]+$' THEN (a.raw_last_payload->>'total')::int END), count(DISTINCT idx.representative_media_sha256)) DESC, max(idx.last_seen_at) DESC, b.name ASC`;
    }
  })();

  const result = await db.execute<BrandFactsRow>(sql`
    SELECT
      b.id AS brand_id,
      b.slug AS slug,
      b.name AS name,
      max(b.category) AS category,
      count(DISTINCT idx.representative_media_sha256) AS creative_groups,
      count(DISTINCT CASE WHEN idx.is_active THEN idx.representative_media_sha256 END) AS active_groups,
      count(DISTINCT CASE WHEN idx.is_active THEN idx.ad_id END) AS active_ads,
      count(DISTINCT idx.ad_id) AS scraped_ads,
      max(CASE WHEN (a.raw_last_payload->>'total') IS NOT NULL AND (a.raw_last_payload->>'total') ~ '^[0-9]+$' THEN (a.raw_last_payload->>'total')::int END) AS library_total_ads,
      max(idx.last_seen_at) AS last_seen_at,
      min(idx.first_seen_at) AS first_seen_at,
      bool_or(idx.has_eu_transparency_evidence) AS has_eu,
      bool_or(idx.has_uk_transparency_evidence) AS has_uk,
      max(idx.latest_eu_total_reach) AS eu_reach_max,
      sum(idx.latest_eu_total_reach) AS eu_reach_combined,
      min(idx.latest_eu_target_age_min) AS eu_age_min,
      max(idx.latest_eu_target_age_max) AS eu_age_max,
      min(idx.latest_uk_target_age_min) AS uk_age_min,
      max(idx.latest_uk_target_age_max) AS uk_age_max,
      max(idx.latest_instagram_followers) AS ig_followers,
      max(idx.latest_facebook_likes) AS fb_likes
    FROM ${adDiscoveryIndex} idx
    INNER JOIN ${brands} b ON b.id = idx.brand_id
    INNER JOIN ${ads} a ON a.id = idx.ad_id
    WHERE idx.representative_media_sha256 IS NOT NULL
    GROUP BY b.id, b.slug, b.name
    ORDER BY ${orderClause}
  `);

  const rows = Array.isArray(result)
    ? (result as unknown as BrandFactsRow[])
    : ((result as { rows?: BrandFactsRow[] })?.rows ?? []);

  return rows;
}

/**
 * PHASE B — batched deterministic portrait resolution.
 *
 * Ranks candidate creatives per brand: active first, most recently seen,
 * newest source start date, stable sha tie-break. Walks the ranked list and
 * picks the first candidate that yields a valid visual:
 *   IMAGE -> browse-image-v1 READY derivative, else canonical original image
 *   VIDEO -> POSTER derivative, else persisted poster image asset
 * Never resolves raw video bytes for display.
 */
async function resolvePortraits(
  brandIds: string[],
): Promise<Map<string, { url: string; sourceKind: "IMAGE" | "VIDEO_POSTER" }>> {
  if (brandIds.length === 0) return new Map();

  // One query: ranked portrait candidates for every returned brand.
  const candidatesResult = await db.execute<PortraitCandidateRow>(sql`
    SELECT ranked.brand_id, ranked.media_asset_id, ranked.media_type,
           ma.storage_key, ranked.rank
    FROM (
      SELECT
        idx.brand_id,
        idx.representative_media_asset_id AS media_asset_id,
        idx.representative_media_type AS media_type,
        ROW_NUMBER() OVER (
          PARTITION BY idx.brand_id
          ORDER BY
            idx.is_active DESC NULLS LAST,
            idx.last_seen_at DESC,
            idx.start_date DESC NULLS LAST,
            idx.representative_media_sha256 ASC
        ) AS rank
      FROM ${adDiscoveryIndex} idx
      WHERE idx.brand_id IN (${sql.join(
        brandIds.map((id) => sql`${id}`),
        sql`, `,
      )})
        AND idx.representative_media_asset_id IS NOT NULL
    ) ranked
    INNER JOIN ${mediaAssets} ma ON ma.id = ranked.media_asset_id
    WHERE ma.storage_key IS NOT NULL AND ma.storage_key LIKE 'media/sha256/%'
    ORDER BY ranked.brand_id, ranked.rank ASC
  `);

  const candidateRows = Array.isArray(candidatesResult)
    ? (candidatesResult as unknown as Array<{
        brand_id: string;
        media_asset_id: string;
        media_type: string | null;
        storage_key: string | null;
        rank: number;
      }>)
    : ((candidatesResult as { rows?: Array<typeof candidatesResult> })
        ?.rows ?? []);

  type Candidate = {
    assetId: string;
    mediaType: string | null;
    rank: number;
  };
  const byBrand = new Map<string, Candidate[]>();
  for (const r of candidateRows) {
    if (!r.storage_key || !r.media_asset_id) continue;
    const list = byBrand.get(r.brand_id) ?? [];
    list.push({
      assetId: r.media_asset_id,
      mediaType: r.media_type,
      rank: Number(r.rank),
    });
    byBrand.set(r.brand_id, list);
  }

  // Batch-resolve visuals for ALL candidate assets up front:
  // browse-image-v1 derivatives + poster derivatives + original assets.
  const allAssetIds = [...new Set(candidateRows.map((c) => c.media_asset_id))];

  const browseMap = await resolveDisplayDerivative(allAssetIds, "browse-image-v1");
  const posterMap = await resolvePosterDerivative(allAssetIds);

  // Originals map (for image fallback)
  const originals = await db
    .select({ id: mediaAssets.id, storageKey: mediaAssets.storageKey })
    .from(mediaAssets)
    .where(inArray(mediaAssets.id, allAssetIds));
  const originalUrlMap = new Map<string, string>();
  for (const o of originals) {
    if (!o.storageKey) continue;
    try {
      originalUrlMap.set(o.id, resolveMediaUrl(o.storageKey));
    } catch {
      /* unresolvable keys skipped */
    }
  }

  const result = new Map<
    string,
    { url: string; sourceKind: "IMAGE" | "VIDEO_POSTER" }
  >();

  for (const [brandId, list] of byBrand) {
    for (const cand of list.sort((a, b) => a.rank - b.rank)) {
      if (cand.mediaType === "IMAGE") {
        const url = browseMap.get(cand.assetId) ?? originalUrlMap.get(cand.assetId);
        if (url) {
          result.set(brandId, { url, sourceKind: "IMAGE" });
          break;
        }
      } else if (cand.mediaType === "VIDEO") {
        const posterUrl = posterMap.get(cand.assetId);
        if (posterUrl) {
          result.set(brandId, { url: posterUrl, sourceKind: "VIDEO_POSTER" });
          break;
        }
        // No poster derivative: fall through to next candidate (never raw video).
      }
      // UNKNOWN / other types: skip to next candidate
    }
    // No valid candidate -> brand simply absent from map -> portrait=null upstream
  }

  return result;
}

async function resolveDisplayDerivative(
  sourceAssetIds: string[],
  recipeVersion: string,
): Promise<Map<string, string>> {
  if (sourceAssetIds.length === 0) return new Map();
  const rows = await db
    .select({
      sourceMediaAssetId: mediaDerivatives.sourceMediaAssetId,
      storageKey: mediaAssets.storageKey,
    })
    .from(mediaDerivatives)
    .innerJoin(mediaAssets, eq(mediaDerivatives.derivedMediaAssetId, mediaAssets.id))
    .where(
      and(
        inArray(mediaDerivatives.sourceMediaAssetId, sourceAssetIds),
        eq(mediaDerivatives.derivativeKind, "DISPLAY_IMAGE"),
        eq(mediaDerivatives.recipeVersion, recipeVersion),
        eq(mediaDerivatives.status, "READY"),
      ),
    );

  const map = new Map<string, string>();
  for (const row of rows) {
    if (!row.storageKey) continue;
    try {
      map.set(row.sourceMediaAssetId, resolveMediaUrl(row.storageKey));
    } catch {
      /* skip malformed */
    }
  }
  return map;
}

async function resolvePosterDerivative(
  sourceAssetIds: string[],
): Promise<Map<string, string>> {
  if (sourceAssetIds.length === 0) return new Map();
  const rows = await db
    .select({
      sourceMediaAssetId: mediaDerivatives.sourceMediaAssetId,
      storageKey: mediaAssets.storageKey,
    })
    .from(mediaDerivatives)
    .innerJoin(mediaAssets, eq(mediaDerivatives.derivedMediaAssetId, mediaAssets.id))
    .where(
      and(
        inArray(mediaDerivatives.sourceMediaAssetId, sourceAssetIds),
        eq(mediaDerivatives.derivativeKind, "POSTER"),
        eq(mediaDerivatives.status, "READY"),
      ),
    );

  const map = new Map<string, string>();
  for (const row of rows) {
    if (!row.storageKey) continue;
    try {
      map.set(row.sourceMediaAssetId, resolveMediaUrl(row.storageKey));
    } catch {
      /* skip malformed */
    }
  }
  return map;
}

/**
 * Public read model entry point. Bounded DB phases, zero N+1:
 *   Phase A — brand-level facts:            1 aggregate query
 *   Phase B — portrait/media resolution:
 *     1 ranked-candidate window query
 *   + 1 batched browse-image-v1 derivative lookup
 *   + 1 batched POSTER derivative lookup
 *   + 1 batched originals lookup
 *
 * Query count is constant regardless of brand count.
 */
export async function getBrandDirectory(
  sort: BrandDirectorySort = "MOST_CREATIVES",
): Promise<BrandDirectoryItem[]> {
  const startedAt = Date.now();
  const facts = await getBrandFacts(sort);
  const portraits = await resolvePortraits(facts.map((f) => f.brand_id));
  if (process.env.NODE_ENV === "development") {
    console.log(
      `[brands] getBrandDirectory(${sort}): ${Date.now() - startedAt}ms, ${facts.length} brands`,
    );
  }

  return facts.map((r) => ({
    brand: {
      slug: r.slug,
      name: r.name,
      category: r.category ?? null,
    },
    creativeFootprint: {
      libraryTotalAds: num(r.library_total_ads),
      creativeCount: Number(r.creative_groups),
      activeCreativeCount: Number(r.active_groups),
      activeAdCount: Number(r.active_ads),
      scrapedAdCount: Number(r.scraped_ads),
      lastSeenAt: new Date(r.last_seen_at),
    },
    transparency: {
      hasEuEvidence: r.has_eu === true,
      hasUkEvidence: r.has_uk === true,
      peakEuReach: num(r.eu_reach_max),
      combinedEuReach: num(r.eu_reach_combined),
      euTargetAgeMin: r.eu_age_min ?? null,
      euTargetAgeMax: r.eu_age_max ?? null,
      ukTargetAgeMin: r.uk_age_min ?? null,
      ukTargetAgeMax: r.uk_age_max ?? null,
    },
    authority: {
      instagramFollowers: num(r.ig_followers),
      facebookLikes: num(r.fb_likes),
    },
    portrait: portraits.get(r.brand_id) ?? null,
  }));
}
