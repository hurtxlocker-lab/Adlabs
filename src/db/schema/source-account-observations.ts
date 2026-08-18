import { bigint, boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { sourceAccounts } from "./source-accounts";
import { ingestionRuns } from "./ingestion-runs";

export const sourceAccountObservations = pgTable(
  "source_account_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceAccountId: uuid("source_account_id")
      .notNull()
      .references(() => sourceAccounts.id, { onDelete: "restrict" }),
    ingestionRunId: uuid("ingestion_run_id")
      .references(() => ingestionRuns.id, { onDelete: "restrict" }),
    observedAt: timestamp("observed_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    pageCategory: text("page_category"),
    facebookLikes: bigint("facebook_likes", { mode: "bigint" }),
    instagramUsername: text("instagram_username"),
    instagramFollowers: bigint("instagram_followers", { mode: "bigint" }),
    facebookVerified: boolean("facebook_verified"),
    instagramVerified: boolean("instagram_verified"),
    pageIsDeleted: boolean("page_is_deleted"),
    pageIsRestricted: boolean("page_is_restricted"),
    aboutText: text("about_text"),
    profileImageUrl: text("profile_image_url"),
    coverImageUrl: text("cover_image_url"),
    providerMetadata: jsonb("provider_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("source_account_observations_account_observed_idx").on(
      table.sourceAccountId,
      table.observedAt.desc(),
    ),
    index("source_account_observations_run_idx").on(table.ingestionRunId),
    uniqueIndex("source_account_observations_account_run_idx")
      .on(table.sourceAccountId, table.ingestionRunId)
      .where(sql`${table.ingestionRunId} IS NOT NULL`),
  ],
);

export const sourceAccountObservationsRelations = relations(
  sourceAccountObservations,
  ({ one }) => ({
    sourceAccount: one(sourceAccounts, {
      fields: [sourceAccountObservations.sourceAccountId],
      references: [sourceAccounts.id],
    }),
    ingestionRun: one(ingestionRuns, {
      fields: [sourceAccountObservations.ingestionRunId],
      references: [ingestionRuns.id],
    }),
  }),
);
