import "server-only";
import { db } from "@/db/client";
import {
  adDiscoveryIndex,
  brands,
  mediaAssets,
  mediaDerivatives,
} from "@/db/schema";
import { resolveMediaUrl } from "@/storage";
import { sql, eq, and, inArray } from "drizzle-orm";

/**
 * Brands Directory read model — the Competitive Landscape.
 *
 * PHASE A: one aggregate query for brand-level facts.
 * PHASE B: batched deterministic portrait resolution for returned brands.
 *
 * SEMANTICS (contract):
 * - creativeCount: DISTINCT (brand, representative_media_sha256) — creative
 *   groups observed in the corpus. NOT canonical ad count.
 * - activeCreativeCount: distinct groups where BOOL_OR(deployment running).
 *   Running = projection isActive, which is derived 1:1 from ads.isActiveObserved
 *   (proven: projector.ts L306 `isActive: ad.isActiveObserved`). No new
 *   Brands-specific running definition; first/last_seen never used for Running.
 * - transparency evidence: presence-only booleans per region, never summed.
 * - peakEuReach: MAX single-deployment EU reach. RANKING SIGNAL ONLY — never
 *   presented as brand/total reach.
 * - authority: MAX() over the projection's denormalized account columns is a
 *   serving SHORTCUT, not the domain definition. It is safe ONLY because the
 *   current projector duplicates the latest-known source_account_observation
 *   state across every index row of the same source account — so MAX over a
 *   brand's rows equals the latest observation value. IF THE PROJECTION EVER
 *   STOPS DUPLICATING LATEST ACCOUNT STATE (e.g. starts appending history),
 *   MAX() becomes semantically unsafe and must be replaced with an explicit
 *   latest-observation join.
 * - portrait: deterministic ranking (active → recent → start_date → stable
 *   tie-break), IMAGE→browse derivative/original, VIDEO→POSTER derivative/
 *   poster asset. Never raw video bytes into <img>. Null when no candidate
 *   yields a valid visual.
 */

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
    creativeCount: number;
    activeCreativeCount: number;
    /** Distinct canonical ad deployments whose canonical Running state is true.
     *  Deployment identity, NOT creative identity. Never implies performance. */
    activeAdCount: number;
    lastSeenAt: Date;
  };
  transparency: {
    hasEuEvidence: boolean;
    hasUkEvidence: boolean;
    /** MAX single-deployment EU reach ("how large did one ad get?"). */
    peakEuReach: number | null;
    /** SUM of deployment-level EU reach ("how much disclosed reach exists?
     *  People may be counted more than once — NEVER impressions/unique). */
    combinedEuReach: number | null;
    /**
     * Brand-level TARGETED age summary from EU/UK transparency disclosures:
     * MIN of disclosed mins, MAX of disclosed maxes across qualifying ads.
     * Regional (EU/UK) — never a universal audience claim.
     */
    targetAgeMin: number | null;
    targetAgeMax: number | null;
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

/** Deterministic SQL ordering per lens with stable final tie-breaks. */
const SORT_SQL: Record<BrandDirectorySort, string> = {
  MOST_CREATIVES:
    "creative_groups DESC, last_seen_at DESC, lower(b.name) ASC, b.id ASC",
  RECENTLY_ACTIVE:
    "last_seen_at DESC, creative_groups DESC, lower(b.name) ASC, b.id ASC",
  REACH_SCALE:
    "eu_reach_max DESC NULLS LAST, creative_groups DESC, last_seen_at DESC, lower(b.name) ASC, b.id ASC",
  SOCIAL_AUTHORITY:
    "ig_followers DESC NULLS LAST, creative_groups DESC, last_seen_at DESC, lower(b.name) ASC, b.id ASC",
};

interface BrandFactsRow extends Record<string, unknown> {
  brand_id: string;
  slug: string;
  name: string;
  category: string | null;
  creative_groups: number;
  active_groups: number;
  active_ads: number;
  last_seen_at: string;
  has_eu: boolean;
  has_uk: boolean;
  eu_reach_max: string | number | null;
  eu_reach_combined: string | number | null;
  age_min: number | null;
  age_max: number | null;
  ig_followers: string | number | null;
  fb_likes: string | number | null;
}

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * PHASE A — brand-level facts aggregate.
 */
async function getBrandFacts(
  sort: BrandDirectorySort,
): Promise<BrandFactsRow[]> {
  const orderSql = SORT_SQL[sort] ?? SORT_SQL.MOST_CREATIVES;

  const result = await db.execute<BrandFactsRow>(sql`
    SELECT
      b.id AS brand_id,
      b.slug AS slug,
      b.name AS name,
      (ARRAY_AGG(b.category) FILTER (WHERE b.category IS NOT NULL))[1] AS category,
      COUNT(DISTINCT idx.representative_media_sha256)::int AS creative_groups,
      -- isActive is consumed 1:1 from ads.isActiveObserved by the projection
      -- (discovery/projection/projector.ts). Brands consumes canonical
      -- projection Running state; Brands does NOT define Running.
      COUNT(DISTINCT CASE WHEN idx.is_active = true
        THEN idx.representative_media_sha256 END)::int AS active_groups,
      -- activeAdCount: DEPLOYMENT identity (canonical ads), not creative identity.
      -- idx.ad_id is the PRIMARY KEY of ad_discovery_index => one row per
      -- canonical ad, so DISTINCT cannot be inflated by joins. Do NOT use
      -- representative_media_sha256 here — that is creative-group identity.
      COUNT(DISTINCT CASE WHEN idx.is_active = true
        THEN idx.ad_id END)::int AS active_ads,
      MAX(idx.last_seen_at) AS last_seen_at,
      BOOL_OR(COALESCE(idx.has_eu_transparency_evidence, false)) AS has_eu,
      BOOL_OR(COALESCE(idx.has_uk_transparency_evidence, false)) AS has_uk,
      -- peakEuReach: MAX single-deployment EU reach
      MAX(idx.latest_eu_total_reach) AS eu_reach_max,
      -- combinedEuReach: SUM over DISTINCT canonical deployments. The inline
      -- subquery below dedups to one row per ad_id (the table PK, proven unique
      -- at 565=565) BEFORE aggregation, so each deployment contributes its reach
      -- at most once. SUM(DISTINCT reach_value) is intentionally NOT used because
      -- it would wrongly collapse distinct ads sharing an identical reach number.
      -- NEVER label as impressions or unique reach — same person may be
      -- counted repeatedly across deployments.
      COALESCE(SUM(idx.latest_eu_total_reach), 0)::bigint AS eu_reach_combined,
      -- brand-level TARGETED age summary from transparency disclosures
      -- (EU AND UK regimes — independent regional data, never summed). MIN of
      -- all disclosed minimums / MAX of all disclosed maximums across whichever
      -- regions actually carry age data (typically EU, sometimes UK-only).
      -- Regional — never a universal brand-audience claim.
      LEAST(
        MIN(idx.latest_eu_target_age_min) FILTER (WHERE idx.latest_eu_target_age_min IS NOT NULL),
        MIN(idx.latest_uk_target_age_min) FILTER (WHERE idx.latest_uk_target_age_min IS NOT NULL)
      ) AS age_min,
      GREATEST(
        MAX(idx.latest_eu_target_age_max) FILTER (WHERE idx.latest_eu_target_age_max IS NOT NULL),
        MAX(idx.latest_uk_target_age_max) FILTER (WHERE idx.latest_uk_target_age_max IS NOT NULL)
      ) AS age_max,
      MAX(idx.latest_instagram_followers) AS ig_followers,
      MAX(idx.latest_facebook_likes) AS fb_likes
    FROM (
      -- One row per canonical ad (ad_id is PK): safe to SUM/EAVG reach here.
      SELECT DISTINCT ON (idx.ad_id)
        idx.ad_id, idx.brand_id, idx.is_active,
        idx.representative_media_sha256, idx.last_seen_at,
        idx.has_eu_transparency_evidence, idx.has_uk_transparency_evidence,
        idx.latest_eu_total_reach, idx.latest_eu_target_age_min,
        idx.latest_eu_target_age_max, idx.latest_instagram_followers,
        idx.latest_facebook_likes
      FROM ${adDiscoveryIndex} idx
      WHERE idx.representative_media_sha256 IS NOT NULL
    ) idx
    INNER JOIN ${brands} b ON b.id = idx.brand_id
    GROUP BY b.id
    ORDER BY ${sql.raw(orderSql)}
  `);

  const rows: BrandFactsRow[] = Array.isArray(result)
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
 *   IMAGE → browse-image-v1 READY derivative, else canonical original image
 *   VIDEO → POSTER derivative, else persisted poster image asset
 * Never resolves raw video bytes for display.
 */
async function resolvePortraits(
  brandIds: string[],
): Promise<Map<string, { url: string; sourceKind: "IMAGE" | "VIDEO_POSTER" }>> {
  if (brandIds.length === 0) return new Map();

  // One query: ranked portrait candidates for every returned brand.
  const candidatesResult = await db.execute<{
    brand_id: string;
    media_asset_id: string;
    media_type: string | null;
    storage_key: string | null;
    rank: number;
  }>(sql`
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
    // No valid candidate → brand simply absent from map → portrait=null upstream
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
 * Query count is constant regardless of brand count. Do not collapse these
 * phases merely to reduce statement count — semantic clarity wins per contract.
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
      creativeCount: Number(r.creative_groups),
      activeCreativeCount: Number(r.active_groups),
      activeAdCount: Number(r.active_ads),
      lastSeenAt: new Date(r.last_seen_at),
    },
    transparency: {
      hasEuEvidence: r.has_eu === true,
      hasUkEvidence: r.has_uk === true,
      peakEuReach: num(r.eu_reach_max),
      combinedEuReach: num(r.eu_reach_combined),
      targetAgeMin: r.age_min,
      targetAgeMax: r.age_max,
    },
    authority: {
      instagramFollowers: num(r.ig_followers),
      facebookLikes: num(r.fb_likes),
    },
    portrait: portraits.get(r.brand_id) ?? null,
  }));
}
