import { bigint, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { sourceAccounts } from "./source-accounts";
import { rawIngestionItems } from "./raw-ingestion-items";
import { adObservations } from "./ad-observations";

export const ingestionRuns = pgTable(
  "ingestion_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: text("source").notNull(),
    sourceAccountId: uuid("source_account_id")
      .notNull()
      .references(() => sourceAccounts.id, { onDelete: "restrict" }),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    status: text("status").notNull(),
    sourceItemsCount: integer("source_items_count").notNull().default(0),
    newAdsCount: integer("new_ads_count").notNull().default(0),
    updatedAdsCount: integer("updated_ads_count").notNull().default(0),
    mediaDownloadedCount: integer("media_downloaded_count").notNull().default(0),
    mediaDuplicateCount: integer("media_duplicate_count").notNull().default(0),
    mediaFailedCount: integer("media_failed_count").notNull().default(0),
    bytesDownloaded: bigint("bytes_downloaded", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    uniqueBytesStored: bigint("unique_bytes_stored", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    errorSummary: text("error_summary"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ingestion_runs_source_account_id_idx").on(table.sourceAccountId),
    index("ingestion_runs_started_at_idx").on(table.startedAt),
    index("ingestion_runs_status_idx").on(table.status),
  ],
);

export const ingestionRunsRelations = relations(
  ingestionRuns,
  ({ one, many }) => ({
    sourceAccount: one(sourceAccounts, {
      fields: [ingestionRuns.sourceAccountId],
      references: [sourceAccounts.id],
    }),
    rawItems: many(rawIngestionItems),
    observations: many(adObservations),
  }),
);
