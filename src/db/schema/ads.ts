import { boolean, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { sourceAccounts } from "./source-accounts";
import { adCards } from "./ad-cards";
import { adMedia } from "./ad-media";
import { adObservations } from "./ad-observations";

export const ads = pgTable(
  "ads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: text("source").notNull(),
    sourceAdId: text("source_ad_id").notNull(),
    sourceAccountId: uuid("source_account_id")
      .notNull()
      .references(() => sourceAccounts.id, { onDelete: "restrict" }),
    sourceCollationId: text("source_collation_id"),
    sourceCollationCount: integer("source_collation_count"),
    displayFormat: text("display_format"),
    publisherPageId: text("publisher_page_id"),
    publisherPageName: text("publisher_page_name"),
    publisherPageUri: text("publisher_page_uri"),
    brandedContentPageId: text("branded_content_page_id"),
    brandedContentPageName: text("branded_content_page_name"),
    brandedContentPageUri: text("branded_content_page_uri"),
    primaryText: text("primary_text"),
    headline: text("headline"),
    description: text("description"),
    ctaText: text("cta_text"),
    ctaType: text("cta_type"),
    destinationUrl: text("destination_url"),
    publisherPlatforms: text("publisher_platforms")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    platformStartAt: timestamp("platform_start_at", {
      withTimezone: true,
      mode: "date",
    }),
    sourceReportedEndAt: timestamp("source_reported_end_at", {
      withTimezone: true,
      mode: "date",
    }),
    isActiveObserved: boolean("is_active_observed"),
    adLibraryUrl: text("ad_library_url"),
    firstSeenAt: timestamp("first_seen_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    lastSeenAt: timestamp("last_seen_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    rawLastPayload: jsonb("raw_last_payload")
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("ads_source_source_ad_id_unique").on(
      table.source,
      table.sourceAdId,
    ),
    index("ads_source_account_id_idx").on(table.sourceAccountId),
    index("ads_source_collation_id_idx").on(table.sourceCollationId),
    index("ads_platform_start_at_idx").on(table.platformStartAt),
    index("ads_last_seen_at_idx").on(table.lastSeenAt),
    index("ads_is_active_observed_idx").on(table.isActiveObserved),
  ],
);

export const adsRelations = relations(ads, ({ one, many }) => ({
  sourceAccount: one(sourceAccounts, {
    fields: [ads.sourceAccountId],
    references: [sourceAccounts.id],
  }),
  cards: many(adCards),
  media: many(adMedia),
  observations: many(adObservations),
}));
