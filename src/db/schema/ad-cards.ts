import { integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { ads } from "./ads";
import { cardMedia } from "./card-media";

export const adCards = pgTable(
  "ad_cards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adId: uuid("ad_id")
      .notNull()
      .references(() => ads.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    body: text("body"),
    title: text("title"),
    description: text("description"),
    ctaText: text("cta_text"),
    ctaType: text("cta_type"),
    destinationUrl: text("destination_url"),
    rawPayload: jsonb("raw_payload")
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("ad_cards_ad_id_position_unique").on(table.adId, table.position),
  ],
);

export const adCardsRelations = relations(adCards, ({ one, many }) => ({
  ad: one(ads, {
    fields: [adCards.adId],
    references: [ads.id],
  }),
  media: many(cardMedia),
}));
