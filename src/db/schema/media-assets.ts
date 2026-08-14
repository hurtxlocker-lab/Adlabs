import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { adMedia } from "./ad-media";
import { cardMedia } from "./card-media";

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mediaType: text("media_type").notNull(),
    sourceUrl: text("source_url"),
    storageProvider: text("storage_provider"),
    storageKey: text("storage_key"),
    mimeType: text("mime_type"),
    byteSize: bigint("byte_size", { mode: "bigint" }),
    sha256: text("sha256").unique(),
    downloadStatus: text("download_status").notNull().default("PENDING"),
    downloadError: text("download_error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("media_assets_storage_key_idx").on(table.storageKey),
    index("media_assets_download_status_idx").on(table.downloadStatus),
  ],
);

export const mediaAssetsRelations = relations(mediaAssets, ({ many }) => ({
  adMedia: many(adMedia),
  cardMedia: many(cardMedia),
}));
