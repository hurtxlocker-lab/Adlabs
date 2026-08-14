import { index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { brands } from "./brands";
import { ingestionRuns } from "./ingestion-runs";
import { ads } from "./ads";

export const sourceAccounts = pgTable(
  "source_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "restrict" }),
    source: text("source").notNull(),
    sourcePageId: text("source_page_id").notNull(),
    sourcePageUrl: text("source_page_url"),
    displayName: text("display_name"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("source_accounts_source_source_page_id_unique").on(
      table.source,
      table.sourcePageId,
    ),
    index("source_accounts_brand_id_idx").on(table.brandId),
  ],
);

export const sourceAccountsRelations = relations(
  sourceAccounts,
  ({ one, many }) => ({
    brand: one(brands, {
      fields: [sourceAccounts.brandId],
      references: [brands.id],
    }),
    ingestionRuns: many(ingestionRuns),
    ads: many(ads),
  }),
);
