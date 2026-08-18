import { bigint, check, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { adObservations } from "./ad-observations";

export const adTransparencyObservations = pgTable(
  "ad_transparency_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adObservationId: uuid("ad_observation_id")
      .notNull()
      .references(() => adObservations.id, { onDelete: "cascade" }),
    region: text("region").notNull(),
    totalReach: bigint("total_reach", { mode: "bigint" }),
    targetAgeMin: integer("target_age_min"),
    targetAgeMax: integer("target_age_max"),
    targetGender: text("target_gender"),
    targetCountries: text("target_countries")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    reachedCountries: text("reached_countries")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    reachBreakdown: jsonb("reach_breakdown").$type<unknown>(),
    providerPayload: jsonb("provider_payload").$type<Record<string, unknown>>(),
    observedAt: timestamp("observed_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("ad_transparency_observations_ad_obs_region_unique").on(
      table.adObservationId,
      table.region,
    ),
    check(
      "ad_transparency_obs_region_check",
      sql`${table.region} IN ('EU', 'UK', 'BR')`,
    ),
    check(
      "ad_transparency_obs_reach_check",
      sql`${table.totalReach} IS NULL OR ${table.totalReach} >= 0`,
    ),
    check(
      "ad_transparency_obs_age_check",
      sql`(${table.targetAgeMin} IS NULL OR (${table.targetAgeMin} >= 0 AND ${table.targetAgeMin} <= 120)) AND (${table.targetAgeMax} IS NULL OR (${table.targetAgeMax} >= 0 AND ${table.targetAgeMax} <= 120)) AND (${table.targetAgeMin} IS NULL OR ${table.targetAgeMax} IS NULL OR ${table.targetAgeMin} <= ${table.targetAgeMax})`,
    ),
    index("ad_transparency_obs_ad_obs_id_idx").on(table.adObservationId),
    index("ad_transparency_obs_region_idx").on(table.region),
    index("ad_transparency_obs_observed_at_idx").on(table.observedAt.desc()),
    index("ad_transparency_obs_target_countries_gin").using(
      "gin",
      table.targetCountries,
    ),
    index("ad_transparency_obs_reached_countries_gin").using(
      "gin",
      table.reachedCountries,
    ),
  ],
);

export const adTransparencyObservationsRelations = relations(
  adTransparencyObservations,
  ({ one }) => ({
    adObservation: one(adObservations, {
      fields: [adTransparencyObservations.adObservationId],
      references: [adObservations.id],
    }),
  }),
);
