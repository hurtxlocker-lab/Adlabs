import { boolean, index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { ads } from "./ads";
import { ingestionRuns } from "./ingestion-runs";
import { adTransparencyObservations } from "./ad-transparency-observations";

export const adObservations = pgTable(
  "ad_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adId: uuid("ad_id")
      .notNull()
      .references(() => ads.id, { onDelete: "restrict" }),
    ingestionRunId: uuid("ingestion_run_id")
      .notNull()
      .references(() => ingestionRuns.id, { onDelete: "restrict" }),
    observedAt: timestamp("observed_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    observedActive: boolean("observed_active"),
    snapshotHash: text("snapshot_hash"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [
    unique("ad_observations_ad_id_ingestion_run_id_unique").on(
      table.adId,
      table.ingestionRunId,
    ),
    index("ad_observations_ingestion_run_id_idx").on(table.ingestionRunId),
    index("ad_observations_observed_at_idx").on(table.observedAt),
  ],
);

export const adObservationsRelations = relations(
  adObservations,
  ({ one, many }) => ({
    ad: one(ads, {
      fields: [adObservations.adId],
      references: [ads.id],
    }),
    ingestionRun: one(ingestionRuns, {
      fields: [adObservations.ingestionRunId],
      references: [ingestionRuns.id],
    }),
    transparencyObservations: many(adTransparencyObservations),
  }),
);
