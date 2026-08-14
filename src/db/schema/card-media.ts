import { index, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { adCards } from "./ad-cards";
import { mediaAssets } from "./media-assets";

export const cardMedia = pgTable(
  "card_media",
  {
    adCardId: uuid("ad_card_id")
      .notNull()
      .references(() => adCards.id, { onDelete: "cascade" }),
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
      name: "card_media_pk",
      columns: [table.adCardId, table.mediaAssetId, table.position],
    }),
    index("card_media_ad_card_id_idx").on(table.adCardId),
    index("card_media_media_asset_id_idx").on(table.mediaAssetId),
  ],
);

export const cardMediaRelations = relations(cardMedia, ({ one }) => ({
  card: one(adCards, {
    fields: [cardMedia.adCardId],
    references: [adCards.id],
  }),
  mediaAsset: one(mediaAssets, {
    fields: [cardMedia.mediaAssetId],
    references: [mediaAssets.id],
  }),
}));
