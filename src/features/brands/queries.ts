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
 * Brands directory — the Competitive Landscape.
 *
 * One grouped aggregate over ad_discovery_index per brand:
 * creative-group volume, live status, observation recency/span,
 * EU/UK transparency presence (never summed), audience bands,
 * social authority, and the representative creative asset for
 * the polaroid portrait.
 */

export interface BrandDirectoryEntry {
  brandId: string;
  slug: string;
  name: string;
  category: string | null;
  pageCategory: string | null;

  /** Distinct creative groups (brand_id + representative sha). */
  creativeGroups: number;
  /** Groups currently observed active in latest crawl. */
  activeGroups: number;

  lastSeenAt: Date;
  firstSeenAt: Date;
  /** True if any group was active in the latest observation window. */
  isActive: boolean;

  hasEuTransparency: boolean;
  hasUkTransparency: boolean;

  /** Disclosed EU reach max across groups (null when undisclosed). */
  euReachMax: number | null;
  /** Target age band from EU evidence (nulls allowed independently). */
  targetAgeMin: number | null;
  targetAgeMax: number | null;
  targetGender: string | null;

  instagramFollowers: number | null;
  facebookLikes: number | null;
  instagramVerified: boolean;
  facebookVerified: boolean;

  /** Representative creative image URL (browse-image-v1 preferred, original fallback). */
  portraitUrl: string | null;
}

interface GroupedRow extends Record<string, unknown> {
  brand_id: string;
  slug: string;
  name: string;
  category: string | null;
  page_category: string | null;
  creative_groups: number;
  active_groups: number;
  last_seen_at: string;
  first_seen_at: string;
  has_eu: boolean;
  has_uk: boolean;
  eu_reach_max: string | number | null;
  age_min: number | null;
  age_max: number | null;
  gender: string | null;
  ig_followers: string | number | null;
  fb_likes: string | number | null;
  ig_verified: boolean;
  fb_verified: boolean;
  rep_media_asset_id: string | null;
}

export type BrandDirectorySort =
  | "MOST_CREATIVES"
  | "RECENTLY_ACTIVE"
  | "REACH_SCALE"
  | "SOCIAL_AUTHORITY";

const SORT_SQL: Record<BrandDirectorySort, string> = {
  MOST_CREATIVES: "creative_groups DESC, name ASC",
  RECENTLY_ACTIVE: "last_seen_at DESC, creative_groups DESC",
  REACH_SCALE: "eu_reach_max DESC NULLS LAST, creative_groups DESC",
  SOCIAL_AUTHORITY: "ig_followers DESC NULLS LAST, creative_groups DESC",
};

function num(v: string | number | null): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function getBrandDirectory(
  sort: BrandDirectorySort = "MOST_CREATIVES",
): Promise<BrandDirectoryEntry[]> {
  const orderSql = SORT_SQL[sort] ?? SORT_SQL.MOST_CREATIVES;

  const result = await db.execute<GroupedRow>(sql`
    SELECT
      b.id AS brand_id,
      b.slug AS slug,
      b.name AS name,
      b.category AS category,
      (ARRAY_AGG(idx.latest_page_category) FILTER (WHERE idx.latest_page_category IS NOT NULL))[1] AS page_category,
      count(DISTINCT idx.representative_media_sha256)::int AS creative_groups,
      count(DISTINCT CASE WHEN idx.is_active = true THEN idx.representative_media_sha256 END)::int AS active_groups,
      MAX(idx.last_seen_at) AS last_seen_at,
      MIN(idx.first_seen_at) AS first_seen_at,
      bool_or(COALESCE(idx.has_eu_transparency_evidence, false)) AS has_eu,
      bool_or(COALESCE(idx.has_uk_transparency_evidence, false)) AS has_uk,
      MAX(idx.latest_eu_total_reach) AS eu_reach_max,
      MIN(idx.latest_eu_target_age_min) AS age_min,
      MAX(idx.latest_eu_target_age_max) AS age_max,
      (ARRAY_AGG(idx.latest_eu_target_gender) FILTER (WHERE idx.latest_eu_target_gender IS NOT NULL))[1] AS gender,
      MAX(idx.latest_instagram_followers) AS ig_followers,
      MAX(idx.latest_facebook_likes) AS fb_likes,
      bool_or(COALESCE(idx.latest_instagram_verified, false)) AS ig_verified,
      bool_or(COALESCE(idx.latest_facebook_verified, false)) AS fb_verified,
      (ARRAY_AGG(idx.representative_media_asset_id) FILTER (WHERE idx.representative_media_asset_id IS NOT NULL))[1] AS rep_media_asset_id
    FROM ${adDiscoveryIndex} idx
    INNER JOIN ${brands} b ON b.id = idx.brand_id
    WHERE idx.representative_media_sha256 IS NOT NULL
    GROUP BY b.id, b.slug, b.name, b.category
    ORDER BY ${sql.raw(orderSql)}
  `);

  const rows: GroupedRow[] = Array.isArray(result)
    ? (result as unknown as GroupedRow[])
    : ((result as { rows?: GroupedRow[] })?.rows ?? []);

  // Resolve portrait URLs for all representative assets in one derivative query
  const assetIds = rows
    .map((r) => r.rep_media_asset_id)
    .filter((v): v is string => Boolean(v));

  const portraitMap = await resolvePortraitUrls(assetIds);

  return rows.map((r) => ({
    brandId: r.brand_id,
    slug: r.slug,
    name: r.name,
    category: r.category ?? r.page_category,
    pageCategory: r.page_category,

    creativeGroups: Number(r.creative_groups),
    activeGroups: Number(r.active_groups),
    lastSeenAt: new Date(r.last_seen_at),
    firstSeenAt: new Date(r.first_seen_at),
    isActive: Number(r.active_groups) > 0,

    hasEuTransparency: r.has_eu === true,
    hasUkTransparency: r.has_uk === true,

    euReachMax: num(r.eu_reach_max),
    targetAgeMin: r.age_min,
    targetAgeMax: r.age_max,
    targetGender: r.gender,

    instagramFollowers: num(r.ig_followers),
    facebookLikes: num(r.fb_likes),
    instagramVerified: r.ig_verified === true,
    facebookVerified: r.fb_verified === true,

    portraitUrl: r.rep_media_asset_id ? portraitMap.get(r.rep_media_asset_id) ?? null : null,
  }));
}

/**
 * Resolves browse-image-v1 portrait URL per representative asset, falling back
 * to the original stored object when no READY derivative exists.
 */
async function resolvePortraitUrls(
  sourceMediaAssetIds: string[],
): Promise<Map<string, string>> {
  if (sourceMediaAssetIds.length === 0) return new Map();

  const derivativeRows = await db
    .select({
      sourceMediaAssetId: mediaDerivatives.sourceMediaAssetId,
      storageKey: mediaAssets.storageKey,
    })
    .from(mediaDerivatives)
    .innerJoin(mediaAssets, eq(mediaDerivatives.derivedMediaAssetId, mediaAssets.id))
    .where(
      and(
        inArray(mediaDerivatives.sourceMediaAssetId, sourceMediaAssetIds),
        eq(mediaDerivatives.derivativeKind, "DISPLAY_IMAGE"),
        eq(mediaDerivatives.recipeVersion, "browse-image-v1"),
        eq(mediaDerivatives.status, "READY"),
      ),
    );

  const map = new Map<string, string>();
  for (const row of derivativeRows) {
    if (!row.storageKey) continue;
    try {
      map.set(row.sourceMediaAssetId, resolveMediaUrl(row.storageKey));
    } catch {
      // Ignore malformed keys — fallback path handles them
    }
  }

  // Fallback: originals for assets without a READY browse derivative
  const missing = sourceMediaAssetIds.filter((id) => !map.has(id));
  if (missing.length > 0) {
    const originals = await db
      .select({ id: mediaAssets.id, storageKey: mediaAssets.storageKey })
      .from(mediaAssets)
      .where(inArray(mediaAssets.id, missing));

    for (const row of originals) {
      if (!row.storageKey) continue;
      try {
        map.set(row.id, resolveMediaUrl(row.storageKey));
      } catch {
        // Skip unresolvable
      }
    }
  }

  return map;
}
