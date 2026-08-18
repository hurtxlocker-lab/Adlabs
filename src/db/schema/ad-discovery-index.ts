import {
  bigint,
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { ads } from "./ads";
import { brands } from "./brands";
import { sourceAccounts } from "./source-accounts";
import { mediaAssets } from "./media-assets";

/**
 * Ad Discovery Index (M2A Projection)
 *
 * A disposable, completely rebuildable current-state query projection table for Discover surfaces.
 * This table is NOT source truth. Ground truth remains strictly in canonical `ads`, `ad_cards`,
 * `media_assets`, `ad_observations`, `source_account_observations`, and `ad_transparency_observations`.
 */
export const adDiscoveryIndex = pgTable(
  "ad_discovery_index",
  {
    adId: uuid("ad_id")
      .primaryKey()
      .references(() => ads.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    sourceAccountId: uuid("source_account_id")
      .notNull()
      .references(() => sourceAccounts.id, { onDelete: "cascade" }),
    sourceAdId: text("source_ad_id").notNull(),

    // Lifecycle
    isActive: boolean("is_active"),
    startDate: timestamp("start_date", { withTimezone: true, mode: "date" }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: "date" }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }).notNull(),

    // Creative
    representativeMediaType: text("representative_media_type"),
    representativeMediaAssetId: uuid("representative_media_asset_id").references(
      () => mediaAssets.id,
      { onDelete: "set null" },
    ),
    representativeMediaSha256: text("representative_media_sha256"),
    representativeShapeFamily: text("representative_shape_family"),
    representativeAspectRatio: numeric("representative_aspect_ratio"),
    videoDurationMs: integer("video_duration_ms"),
    ctaType: text("cta_type"),
    publisherPlatforms: text("publisher_platforms")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),

    // Copy Metrics
    copyLengthChars: integer("copy_length_chars").notNull(),
    copyLengthWords: integer("copy_length_words").notNull(),

    // Creative Reuse (V1: Brand-scoped exact SHA reuse)
    exactCreativeReuseCount: integer("exact_creative_reuse_count"),

    // Account Metadata (Latest available from source_account_observations)
    latestPageCategory: text("latest_page_category"),
    latestInstagramFollowers: bigint("latest_instagram_followers", { mode: "bigint" }),
    latestFacebookLikes: bigint("latest_facebook_likes", { mode: "bigint" }),
    latestFacebookVerified: boolean("latest_facebook_verified"),
    latestInstagramVerified: boolean("latest_instagram_verified"),

    // Transparency Evidence Flags
    hasEuTransparencyEvidence: boolean("has_eu_transparency_evidence")
      .notNull()
      .default(false),
    hasUkTransparencyEvidence: boolean("has_uk_transparency_evidence")
      .notNull()
      .default(false),
    hasBrTransparencyEvidence: boolean("has_br_transparency_evidence")
      .notNull()
      .default(false),

    // Regional Total Reach (NULL means unavailable, never zero)
    latestEuTotalReach: bigint("latest_eu_total_reach", { mode: "bigint" }),
    latestUkTotalReach: bigint("latest_uk_total_reach", { mode: "bigint" }),
    latestBrTotalReach: bigint("latest_br_total_reach", { mode: "bigint" }),

    // Regional Observation Timestamps
    latestEuTransparencyObservedAt: timestamp("latest_eu_transparency_observed_at", {
      withTimezone: true,
      mode: "date",
    }),
    latestUkTransparencyObservedAt: timestamp("latest_uk_transparency_observed_at", {
      withTimezone: true,
      mode: "date",
    }),
    latestBrTransparencyObservedAt: timestamp("latest_br_transparency_observed_at", {
      withTimezone: true,
      mode: "date",
    }),

    // Region-Specific Target Age & Gender Evidence (Non-lossy)
    latestEuTargetAgeMin: integer("latest_eu_target_age_min"),
    latestEuTargetAgeMax: integer("latest_eu_target_age_max"),
    latestEuTargetGender: text("latest_eu_target_gender"),

    latestUkTargetAgeMin: integer("latest_uk_target_age_min"),
    latestUkTargetAgeMax: integer("latest_uk_target_age_max"),
    latestUkTargetGender: text("latest_uk_target_gender"),

    latestBrTargetAgeMin: integer("latest_br_target_age_min"),
    latestBrTargetAgeMax: integer("latest_br_target_age_max"),
    latestBrTargetGender: text("latest_br_target_gender"),

    // Country Aggregations (Deterministic union across available regional regimes)
    targetCountries: text("target_countries")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    reachedCountries: text("reached_countries")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),

    projectedAt: timestamp("projected_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Constraints
    check(
      "ad_discovery_index_copy_chars_check",
      sql`${table.copyLengthChars} >= 0`,
    ),
    check(
      "ad_discovery_index_copy_words_check",
      sql`${table.copyLengthWords} >= 0`,
    ),
    check(
      "ad_discovery_index_video_duration_check",
      sql`${table.videoDurationMs} IS NULL OR ${table.videoDurationMs} >= 0`,
    ),
    check(
      "ad_discovery_index_reuse_count_check",
      sql`${table.exactCreativeReuseCount} IS NULL OR ${table.exactCreativeReuseCount} >= 1`,
    ),
    check(
      "ad_discovery_index_aspect_ratio_check",
      sql`${table.representativeAspectRatio} IS NULL OR ${table.representativeAspectRatio} > 0`,
    ),
    check(
      "ad_discovery_index_eu_reach_check",
      sql`${table.latestEuTotalReach} IS NULL OR ${table.latestEuTotalReach} >= 0`,
    ),
    check(
      "ad_discovery_index_uk_reach_check",
      sql`${table.latestUkTotalReach} IS NULL OR ${table.latestUkTotalReach} >= 0`,
    ),
    check(
      "ad_discovery_index_br_reach_check",
      sql`${table.latestBrTotalReach} IS NULL OR ${table.latestBrTotalReach} >= 0`,
    ),
    check(
      "ad_discovery_index_eu_target_age_check",
      sql`(${table.latestEuTargetAgeMin} IS NULL OR (${table.latestEuTargetAgeMin} >= 0 AND ${table.latestEuTargetAgeMin} <= 120)) AND (${table.latestEuTargetAgeMax} IS NULL OR (${table.latestEuTargetAgeMax} >= 0 AND ${table.latestEuTargetAgeMax} <= 120)) AND (${table.latestEuTargetAgeMin} IS NULL OR ${table.latestEuTargetAgeMax} IS NULL OR ${table.latestEuTargetAgeMin} <= ${table.latestEuTargetAgeMax})`,
    ),
    check(
      "ad_discovery_index_uk_target_age_check",
      sql`(${table.latestUkTargetAgeMin} IS NULL OR (${table.latestUkTargetAgeMin} >= 0 AND ${table.latestUkTargetAgeMin} <= 120)) AND (${table.latestUkTargetAgeMax} IS NULL OR (${table.latestUkTargetAgeMax} >= 0 AND ${table.latestUkTargetAgeMax} <= 120)) AND (${table.latestUkTargetAgeMin} IS NULL OR ${table.latestUkTargetAgeMax} IS NULL OR ${table.latestUkTargetAgeMin} <= ${table.latestUkTargetAgeMax})`,
    ),
    check(
      "ad_discovery_index_br_target_age_check",
      sql`(${table.latestBrTargetAgeMin} IS NULL OR (${table.latestBrTargetAgeMin} >= 0 AND ${table.latestBrTargetAgeMin} <= 120)) AND (${table.latestBrTargetAgeMax} IS NULL OR (${table.latestBrTargetAgeMax} >= 0 AND ${table.latestBrTargetAgeMax} <= 120)) AND (${table.latestBrTargetAgeMin} IS NULL OR ${table.latestBrTargetAgeMax} IS NULL OR ${table.latestBrTargetAgeMin} <= ${table.latestBrTargetAgeMax})`,
    ),

    // B-tree Indexes
    index("ad_discovery_index_brand_id_idx").on(table.brandId),
    index("ad_discovery_index_source_account_id_idx").on(table.sourceAccountId),
    index("ad_discovery_index_is_active_idx").on(table.isActive),
    index("ad_discovery_index_start_date_idx").on(table.startDate),
    index("ad_discovery_index_last_seen_at_idx").on(table.lastSeenAt.desc()),
    index("ad_discovery_index_shape_family_idx").on(table.representativeShapeFamily),
    index("ad_discovery_index_media_type_idx").on(table.representativeMediaType),
    index("ad_discovery_index_reuse_count_idx").on(table.exactCreativeReuseCount),
    index("ad_discovery_index_ig_followers_idx").on(table.latestInstagramFollowers),
    index("ad_discovery_index_eu_reach_idx").on(table.latestEuTotalReach),

    // GIN Indexes
    index("ad_discovery_index_platforms_gin").using("gin", table.publisherPlatforms),
    index("ad_discovery_index_target_countries_gin").using("gin", table.targetCountries),
    index("ad_discovery_index_reached_countries_gin").using("gin", table.reachedCountries),

    // Partial Indexes
    index("ad_discovery_index_active_start_date_idx")
      .on(table.startDate)
      .where(sql`${table.isActive} = true`),
    index("ad_discovery_index_eu_reach_present_idx")
      .on(table.latestEuTotalReach)
      .where(
        sql`${table.hasEuTransparencyEvidence} = true AND ${table.latestEuTotalReach} IS NOT NULL`,
      ),
  ],
);

export const adDiscoveryIndexRelations = relations(adDiscoveryIndex, ({ one }) => ({
  ad: one(ads, {
    fields: [adDiscoveryIndex.adId],
    references: [ads.id],
  }),
  brand: one(brands, {
    fields: [adDiscoveryIndex.brandId],
    references: [brands.id],
  }),
  sourceAccount: one(sourceAccounts, {
    fields: [adDiscoveryIndex.sourceAccountId],
    references: [sourceAccounts.id],
  }),
  representativeMediaAsset: one(mediaAssets, {
    fields: [adDiscoveryIndex.representativeMediaAssetId],
    references: [mediaAssets.id],
  }),
}));
