CREATE TABLE "ad_discovery_index" (
	"ad_id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"source_account_id" uuid NOT NULL,
	"source_ad_id" text NOT NULL,
	"is_active" boolean,
	"start_date" timestamp with time zone,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"representative_media_type" text,
	"representative_media_asset_id" uuid,
	"representative_media_sha256" text,
	"representative_shape_family" text,
	"representative_aspect_ratio" numeric,
	"video_duration_ms" integer,
	"cta_type" text,
	"publisher_platforms" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"copy_length_chars" integer NOT NULL,
	"copy_length_words" integer NOT NULL,
	"exact_creative_reuse_count" integer,
	"latest_page_category" text,
	"latest_instagram_followers" bigint,
	"latest_facebook_likes" bigint,
	"latest_facebook_verified" boolean,
	"latest_instagram_verified" boolean,
	"has_eu_transparency_evidence" boolean DEFAULT false NOT NULL,
	"has_uk_transparency_evidence" boolean DEFAULT false NOT NULL,
	"has_br_transparency_evidence" boolean DEFAULT false NOT NULL,
	"latest_eu_total_reach" bigint,
	"latest_uk_total_reach" bigint,
	"latest_br_total_reach" bigint,
	"latest_eu_transparency_observed_at" timestamp with time zone,
	"latest_uk_transparency_observed_at" timestamp with time zone,
	"latest_br_transparency_observed_at" timestamp with time zone,
	"target_countries" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"reached_countries" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"target_age_min" integer,
	"target_age_max" integer,
	"target_gender" text,
	"projected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_discovery_index_copy_chars_check" CHECK ("ad_discovery_index"."copy_length_chars" >= 0),
	CONSTRAINT "ad_discovery_index_copy_words_check" CHECK ("ad_discovery_index"."copy_length_words" >= 0),
	CONSTRAINT "ad_discovery_index_video_duration_check" CHECK ("ad_discovery_index"."video_duration_ms" IS NULL OR "ad_discovery_index"."video_duration_ms" >= 0),
	CONSTRAINT "ad_discovery_index_reuse_count_check" CHECK ("ad_discovery_index"."exact_creative_reuse_count" IS NULL OR "ad_discovery_index"."exact_creative_reuse_count" >= 1),
	CONSTRAINT "ad_discovery_index_aspect_ratio_check" CHECK ("ad_discovery_index"."representative_aspect_ratio" IS NULL OR "ad_discovery_index"."representative_aspect_ratio" > 0),
	CONSTRAINT "ad_discovery_index_eu_reach_check" CHECK ("ad_discovery_index"."latest_eu_total_reach" IS NULL OR "ad_discovery_index"."latest_eu_total_reach" >= 0),
	CONSTRAINT "ad_discovery_index_uk_reach_check" CHECK ("ad_discovery_index"."latest_uk_total_reach" IS NULL OR "ad_discovery_index"."latest_uk_total_reach" >= 0),
	CONSTRAINT "ad_discovery_index_br_reach_check" CHECK ("ad_discovery_index"."latest_br_total_reach" IS NULL OR "ad_discovery_index"."latest_br_total_reach" >= 0),
	CONSTRAINT "ad_discovery_index_target_age_check" CHECK (("ad_discovery_index"."target_age_min" IS NULL OR ("ad_discovery_index"."target_age_min" >= 0 AND "ad_discovery_index"."target_age_min" <= 120)) AND ("ad_discovery_index"."target_age_max" IS NULL OR ("ad_discovery_index"."target_age_max" >= 0 AND "ad_discovery_index"."target_age_max" <= 120)) AND ("ad_discovery_index"."target_age_min" IS NULL OR "ad_discovery_index"."target_age_max" IS NULL OR "ad_discovery_index"."target_age_min" <= "ad_discovery_index"."target_age_max"))
);
--> statement-breakpoint
ALTER TABLE "ad_discovery_index" ADD CONSTRAINT "ad_discovery_index_ad_id_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_discovery_index" ADD CONSTRAINT "ad_discovery_index_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_discovery_index" ADD CONSTRAINT "ad_discovery_index_source_account_id_source_accounts_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "public"."source_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_discovery_index" ADD CONSTRAINT "ad_discovery_index_representative_media_asset_id_media_assets_id_fk" FOREIGN KEY ("representative_media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_discovery_index_brand_id_idx" ON "ad_discovery_index" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "ad_discovery_index_source_account_id_idx" ON "ad_discovery_index" USING btree ("source_account_id");--> statement-breakpoint
CREATE INDEX "ad_discovery_index_is_active_idx" ON "ad_discovery_index" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "ad_discovery_index_start_date_idx" ON "ad_discovery_index" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "ad_discovery_index_last_seen_at_idx" ON "ad_discovery_index" USING btree ("last_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ad_discovery_index_shape_family_idx" ON "ad_discovery_index" USING btree ("representative_shape_family");--> statement-breakpoint
CREATE INDEX "ad_discovery_index_media_type_idx" ON "ad_discovery_index" USING btree ("representative_media_type");--> statement-breakpoint
CREATE INDEX "ad_discovery_index_reuse_count_idx" ON "ad_discovery_index" USING btree ("exact_creative_reuse_count");--> statement-breakpoint
CREATE INDEX "ad_discovery_index_ig_followers_idx" ON "ad_discovery_index" USING btree ("latest_instagram_followers");--> statement-breakpoint
CREATE INDEX "ad_discovery_index_eu_reach_idx" ON "ad_discovery_index" USING btree ("latest_eu_total_reach");--> statement-breakpoint
CREATE INDEX "ad_discovery_index_platforms_gin" ON "ad_discovery_index" USING gin ("publisher_platforms");--> statement-breakpoint
CREATE INDEX "ad_discovery_index_target_countries_gin" ON "ad_discovery_index" USING gin ("target_countries");--> statement-breakpoint
CREATE INDEX "ad_discovery_index_reached_countries_gin" ON "ad_discovery_index" USING gin ("reached_countries");--> statement-breakpoint
CREATE INDEX "ad_discovery_index_active_start_date_idx" ON "ad_discovery_index" USING btree ("start_date") WHERE "ad_discovery_index"."is_active" = true;--> statement-breakpoint
CREATE INDEX "ad_discovery_index_eu_reach_present_idx" ON "ad_discovery_index" USING btree ("latest_eu_total_reach") WHERE "ad_discovery_index"."has_eu_transparency_evidence" = true AND "ad_discovery_index"."latest_eu_total_reach" IS NOT NULL;