import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { mediaAssets } from "./media-assets";

export const mediaDerivatives = pgTable(
  "media_derivatives",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceMediaAssetId: uuid("source_media_asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    derivedMediaAssetId: uuid("derived_media_asset_id")
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    derivativeKind: text("derivative_kind").notNull(),
    recipeVersion: text("recipe_version").notNull(),
    status: text("status").notNull().default("PENDING"),
    errorReason: text("error_reason"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("media_derivatives_unique_recipe_idx").on(
      table.sourceMediaAssetId,
      table.derivativeKind,
      table.recipeVersion,
    ),
    index("media_derivatives_derived_asset_idx").on(table.derivedMediaAssetId),
    index("media_derivatives_status_idx").on(table.status),
    check(
      "media_derivatives_status_check",
      sql`${table.status} IN ('PENDING', 'PROCESSING', 'READY', 'FAILED')`,
    ),
    check(
      "media_derivatives_kind_check",
      sql`${table.derivativeKind} IN ('PREVIEW_LOOP', 'DISPLAY_IMAGE', 'POSTER')`,
    ),
    check(
      "media_derivatives_ready_asset_check",
      sql`(${table.status} = 'READY' AND ${table.derivedMediaAssetId} IS NOT NULL) OR (${table.status} IN ('PENDING', 'PROCESSING', 'FAILED') AND ${table.derivedMediaAssetId} IS NULL)`,
    ),
  ],
);

export const mediaDerivativesRelations = relations(mediaDerivatives, ({ one }) => ({
  sourceMediaAsset: one(mediaAssets, {
    fields: [mediaDerivatives.sourceMediaAssetId],
    references: [mediaAssets.id],
    relationName: "sourceMediaDerivatives",
  }),
  derivedMediaAsset: one(mediaAssets, {
    fields: [mediaDerivatives.derivedMediaAssetId],
    references: [mediaAssets.id],
    relationName: "derivedFromMediaDerivatives",
  }),
}));
