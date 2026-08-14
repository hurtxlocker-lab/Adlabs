import { index, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { ads } from "./ads";
import { mediaAssets } from "./media-assets";

export const adMedia = pgTable(
  "ad_media",
  {
    adId: uuid("ad_id")
      .notNull()
      .references(() => ads.id, { onDelete: "cascade" }),
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "restrict" }),
    position: integer("position").notNull().default(0),
    role: text("role"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "ad_media_pk",
      columns: [table.adId, table.mediaAssetId, table.position],
    }),
    index("ad_media_ad_id_idx").on(table.adId),
    index("ad_media_media_asset_id_idx").on(table.mediaAssetId),
  ],
);

export const adMediaRelations = relations(adMedia, ({ one }) => ({
  ad: one(ads, {
    fields: [adMedia.adId],
    references: [ads.id],
  }),
  mediaAsset: one(mediaAssets, {
    fields: [adMedia.mediaAssetId],
    references: [mediaAssets.id],
  }),
}));
