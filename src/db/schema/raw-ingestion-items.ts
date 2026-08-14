import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { ingestionRuns } from "./ingestion-runs";

export const rawIngestionItems = pgTable(
  "raw_ingestion_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ingestionRunId: uuid("ingestion_run_id")
      .notNull()
      .references(() => ingestionRuns.id, { onDelete: "restrict" }),
    sourceItemId: text("source_item_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    payloadHash: text("payload_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("raw_ingestion_items_ingestion_run_id_idx").on(table.ingestionRunId),
    index("raw_ingestion_items_source_item_id_idx").on(table.sourceItemId),
    index("raw_ingestion_items_payload_hash_idx").on(table.payloadHash),
  ],
);

export const rawIngestionItemsRelations = relations(
  rawIngestionItems,
  ({ one }) => ({
    ingestionRun: one(ingestionRuns, {
      fields: [rawIngestionItems.ingestionRunId],
      references: [ingestionRuns.id],
    }),
  }),
);
