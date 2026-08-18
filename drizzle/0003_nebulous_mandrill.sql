CREATE TABLE "source_account_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_account_id" uuid NOT NULL,
	"ingestion_run_id" uuid,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"page_category" text,
	"facebook_likes" bigint,
	"instagram_username" text,
	"instagram_followers" bigint,
	"facebook_verified" boolean,
	"instagram_verified" boolean,
	"page_is_deleted" boolean,
	"page_is_restricted" boolean,
	"about_text" text,
	"profile_image_url" text,
	"cover_image_url" text,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_transparency_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_observation_id" uuid NOT NULL,
	"region" text NOT NULL,
	"total_reach" bigint,
	"target_age_min" integer,
	"target_age_max" integer,
	"target_gender" text,
	"target_countries" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"reached_countries" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"reach_breakdown" jsonb,
	"provider_payload" jsonb,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_transparency_observations_ad_obs_region_unique" UNIQUE("ad_observation_id","region"),
	CONSTRAINT "ad_transparency_obs_region_check" CHECK ("ad_transparency_observations"."region" IN ('EU', 'UK', 'BR')),
	CONSTRAINT "ad_transparency_obs_reach_check" CHECK ("ad_transparency_observations"."total_reach" IS NULL OR "ad_transparency_observations"."total_reach" >= 0),
	CONSTRAINT "ad_transparency_obs_age_check" CHECK (("ad_transparency_observations"."target_age_min" IS NULL OR "ad_transparency_observations"."target_age_min" >= 0) AND ("ad_transparency_observations"."target_age_max" IS NULL OR "ad_transparency_observations"."target_age_max" >= 0) AND ("ad_transparency_observations"."target_age_min" IS NULL OR "ad_transparency_observations"."target_age_max" IS NULL OR "ad_transparency_observations"."target_age_min" <= "ad_transparency_observations"."target_age_max"))
);
--> statement-breakpoint
ALTER TABLE "source_account_observations" ADD CONSTRAINT "source_account_observations_source_account_id_source_accounts_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "public"."source_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_account_observations" ADD CONSTRAINT "source_account_observations_ingestion_run_id_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "public"."ingestion_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_transparency_observations" ADD CONSTRAINT "ad_transparency_observations_ad_observation_id_ad_observations_id_fk" FOREIGN KEY ("ad_observation_id") REFERENCES "public"."ad_observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_account_observations_account_observed_idx" ON "source_account_observations" USING btree ("source_account_id","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "source_account_observations_run_idx" ON "source_account_observations" USING btree ("ingestion_run_id");--> statement-breakpoint
CREATE INDEX "ad_transparency_obs_ad_obs_id_idx" ON "ad_transparency_observations" USING btree ("ad_observation_id");--> statement-breakpoint
CREATE INDEX "ad_transparency_obs_region_idx" ON "ad_transparency_observations" USING btree ("region");--> statement-breakpoint
CREATE INDEX "ad_transparency_obs_observed_at_idx" ON "ad_transparency_observations" USING btree ("observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ad_transparency_obs_target_countries_gin" ON "ad_transparency_observations" USING gin ("target_countries");--> statement-breakpoint
CREATE INDEX "ad_transparency_obs_reached_countries_gin" ON "ad_transparency_observations" USING gin ("reached_countries");