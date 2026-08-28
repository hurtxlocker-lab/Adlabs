import type { CreativeShapeFamily } from "@/features/discover/utils/creative-shape";

/**
 * Supported stable sort options for AdLabs Discovery.
 * "EXPLORE" is the default brand-diverse discovery mode.
 */
export type DiscoverySort =
  | "EXPLORE"
  | "RECENTLY_SEEN"
  | "OLDEST_SEEN"
  | "NEWEST_STARTED"
  | "OLDEST_STARTED"
  | "EU_REACH_DESC"
  | "EU_REACH_ASC"
  | "INSTAGRAM_FOLLOWERS_DESC"
  | "INSTAGRAM_FOLLOWERS_ASC"
  | "CREATIVE_REUSE_DESC"
  | "CREATIVE_REUSE_ASC";

/**
 * Filter groups for disjunctive faceting.
 */
export type DiscoveryFilterGroup =
  | "IDENTITY"
  | "LIFECYCLE"
  | "RUNNING_DAYS"
  | "MEDIA_TYPE"
  | "SHAPE"
  | "VIDEO_DURATION"
  | "CTA"
  | "PLATFORM"
  | "COPY_LENGTH_CHARS"
  | "COPY_LENGTH_WORDS"
  | "REUSE"
  | "PAGE_CATEGORY"
  | "INSTAGRAM_FOLLOWERS"
  | "FACEBOOK_LIKES"
  | "VERIFICATION"
  | "TRANSPARENCY_EU"
  | "TRANSPARENCY_UK"
  | "TRANSPARENCY_BR"
  | "EU_REACH"
  | "UK_REACH"
  | "BR_REACH"
  | "TARGET_COUNTRY"
  | "REACHED_COUNTRY"
  | "EU_TARGET_AGE"
  | "UK_TARGET_AGE"
  | "BR_TARGET_AGE"
  | "EU_TARGET_GENDER"
  | "UK_TARGET_GENDER"
  | "BR_TARGET_GENDER";

/**
 * Raw input parameters accepted for discovery queries before normalization.
 */
export interface DiscoveryFilterInput {
  // Identity
  brandIds?: string[];
  sourceAccountIds?: string[];

  // Lifecycle
  isActive?: boolean;
  startedAfter?: string | Date;
  startedBefore?: string | Date;
  runningMinDays?: number;
  runningMaxDays?: number;

  // Creative
  mediaTypes?: string[];
  shapeFamilies?: CreativeShapeFamily[];
  videoDurationMinMs?: number;
  videoDurationMaxMs?: number;
  ctaTypes?: string[];
  publisherPlatforms?: string[];
  copyLengthMinChars?: number;
  copyLengthMaxChars?: number;
  copyLengthMinWords?: number;
  copyLengthMaxWords?: number;

  // Creative Reuse
  exactCreativeReuseMin?: number;
  exactCreativeReuseMax?: number;

  // Account
  pageCategories?: string[];
  instagramFollowersMin?: number | bigint;
  instagramFollowersMax?: number | bigint;
  facebookLikesMin?: number | bigint;
  facebookLikesMax?: number | bigint;
  facebookVerified?: boolean;
  instagramVerified?: boolean;

  // Transparency Presence
  hasEuTransparencyEvidence?: boolean;
  hasUkTransparencyEvidence?: boolean;
  hasBrTransparencyEvidence?: boolean;

  // Regional Reach
  euReachMin?: number | bigint;
  euReachMax?: number | bigint;
  ukReachMin?: number | bigint;
  ukReachMax?: number | bigint;
  brReachMin?: number | bigint;
  brReachMax?: number | bigint;

  // Target Geography
  targetCountries?: string[];
  reachedCountries?: string[];

  // Target Demographics
  euTargetAgeMin?: number;
  euTargetAgeMax?: number;
  ukTargetAgeMin?: number;
  ukTargetAgeMax?: number;
  brTargetAgeMin?: number;
  brTargetAgeMax?: number;
  euTargetGenders?: string[];
  ukTargetGenders?: string[];
  brTargetGenders?: string[];
}

/**
 * Fully normalized, canonical filter input.
 * Arrays are sorted and deduplicated; strings are trimmed; dates are Date objects.
 */
export interface NormalizedDiscoveryFilters {
  // Identity
  brandIds?: string[];
  sourceAccountIds?: string[];

  // Lifecycle
  isActive?: boolean;
  startedAfter?: Date;
  startedBefore?: Date;
  runningMinDays?: number;
  runningMaxDays?: number;

  // Creative
  mediaTypes?: string[];
  shapeFamilies?: CreativeShapeFamily[];
  videoDurationMinMs?: number;
  videoDurationMaxMs?: number;
  ctaTypes?: string[];
  publisherPlatforms?: string[];
  copyLengthMinChars?: number;
  copyLengthMaxChars?: number;
  copyLengthMinWords?: number;
  copyLengthMaxWords?: number;

  // Creative Reuse
  exactCreativeReuseMin?: number;
  exactCreativeReuseMax?: number;

  // Account
  pageCategories?: string[];
  instagramFollowersMin?: bigint;
  instagramFollowersMax?: bigint;
  facebookLikesMin?: bigint;
  facebookLikesMax?: bigint;
  facebookVerified?: boolean;
  instagramVerified?: boolean;

  // Transparency Presence
  hasEuTransparencyEvidence?: boolean;
  hasUkTransparencyEvidence?: boolean;
  hasBrTransparencyEvidence?: boolean;

  // Regional Reach
  euReachMin?: bigint;
  euReachMax?: bigint;
  ukReachMin?: bigint;
  ukReachMax?: bigint;
  brReachMin?: bigint;
  brReachMax?: bigint;

  // Target Geography
  targetCountries?: string[];
  reachedCountries?: string[];

  // Target Demographics
  euTargetAgeMin?: number;
  euTargetAgeMax?: number;
  ukTargetAgeMin?: number;
  ukTargetAgeMax?: number;
  brTargetAgeMin?: number;
  brTargetAgeMax?: number;
  euTargetGenders?: string[];
  ukTargetGenders?: string[];
  brTargetGenders?: string[];
}

/**
 * Options for querying canonical ad discovery items.
 */
export interface QueryDiscoveryAdsOptions {
  filters?: DiscoveryFilterInput | NormalizedDiscoveryFilters;
  sort?: DiscoverySort;
  pageSize?: number;
  cursor?: string;
  limitPerBrand?: number;
  now?: Date;
}

/**
 * Result shape returned by the canonical ad discovery query engine.
 */
export interface QueryDiscoveryAdsResult {
  items: Array<{
    adId: string;
  }>;
  nextCursor: string | null;
  total?: number;
}

/**
 * Exact Creative Group result item for Discover gallery.
 * Defined by unique (brandId, representativeMediaSha256).
 */
export interface DiscoveryCreativeGroupItem {
  groupKey: string;
  brandId: string;
  brandName: string;
  brandSlug: string;
  representativeAdId: string;
  representativeMediaSha256: string | null;
  representativeMediaType: "VIDEO" | "IMAGE" | null;
  representativeShapeFamily: string | null;
  representativeAspectRatio: number | null;
  videoDurationMs: number | null;
  exactReuseCount: number;
  siblingAdIds: string[];
  hasEuTransparencyEvidence: boolean;
  latestEuTotalReach: bigint | null;
  hasUkTransparencyEvidence: boolean;
  latestUkTotalReach: bigint | null;
  latestInstagramFollowers: bigint | null;
  maxLastSeenAt: Date;
  minStartDate: Date | null;
}

/**
 * Options for querying grouped exact creative items.
 */
export interface QueryDiscoveryCreativesOptions {
  filters?: DiscoveryFilterInput | NormalizedDiscoveryFilters;
  sort?: DiscoverySort;
  pageSize?: number;
  offset?: number;
  now?: Date;
}

/**
 * Result shape returned by the creative group discovery query engine.
 */
export interface QueryDiscoveryCreativesResult {
  items: DiscoveryCreativeGroupItem[];
  totalCreativesCount: number;
  totalCanonicalAdsCount: number;
  pageSize: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Range facet band definition.
 */
export interface FacetBandCount<K extends string = string> {
  key: K;
  label: string;
  count: number;
}

/**
 * Brand facet item with display name and count.
 * Returned from disjunctive brand facet (counts computed excluding brand_ids filter).
 */
export interface BrandFacetItem {
  brandId: string;
  brandName: string;
  brandSlug: string;
  category?: string | null;
  count: number;
}

/**
 * Value-count pair for categorical facets.
 */
export interface FacetValueCount<T = string> {
  value: T;
  count: number;
}

/**
 * Complete facet aggregation response contract.
 */
export interface DiscoveryFacetsResult {
  mediaTypes: FacetValueCount<string>[];
  shapeFamilies: FacetValueCount<CreativeShapeFamily>[];
  ctaTypes: FacetValueCount<string>[];
  publisherPlatforms: FacetValueCount<string>[];
  pageCategories: FacetValueCount<string>[];
  targetCountries: FacetValueCount<string>[];
  reachedCountries: FacetValueCount<string>[];
  transparencyEvidence: {
    EU: { true: number; false: number };
    UK: { true: number; false: number };
    BR: { true: number; false: number };
  };
  euReachBands: FacetBandCount[];
  creativeReuseBands: FacetBandCount[];
  instagramFollowerBands: FacetBandCount[];
  brands: BrandFacetItem[];
}

/**
 * Options for querying facet aggregations.
 */
export interface QueryDiscoveryFacetsOptions {
  filters?: DiscoveryFilterInput | NormalizedDiscoveryFilters;
  now?: Date;
}
