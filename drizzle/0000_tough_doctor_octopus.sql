CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"website_url" text,
	"category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "source_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_page_id" text NOT NULL,
	"source_page_url" text,
	"display_name" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_accounts_source_source_page_id_unique" UNIQUE("source","source_page_id")
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_account_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"source_items_count" integer DEFAULT 0 NOT NULL,
	"new_ads_count" integer DEFAULT 0 NOT NULL,
	"updated_ads_count" integer DEFAULT 0 NOT NULL,
	"media_downloaded_count" integer DEFAULT 0 NOT NULL,
	"media_duplicate_count" integer DEFAULT 0 NOT NULL,
	"media_failed_count" integer DEFAULT 0 NOT NULL,
	"bytes_downloaded" bigint DEFAULT 0 NOT NULL,
	"unique_bytes_stored" bigint DEFAULT 0 NOT NULL,
	"error_summary" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_ingestion_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingestion_run_id" uuid NOT NULL,
	"source_item_id" text,
	"payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_ad_id" text NOT NULL,
	"source_account_id" uuid NOT NULL,
	"source_collation_id" text,
	"source_collation_count" integer,
	"display_format" text,
	"publisher_page_id" text,
	"publisher_page_name" text,
	"publisher_page_uri" text,
	"branded_content_page_id" text,
	"branded_content_page_name" text,
	"branded_content_page_uri" text,
	"primary_text" text,
	"headline" text,
	"description" text,
	"cta_text" text,
	"cta_type" text,
	"destination_url" text,
	"publisher_platforms" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"platform_start_at" timestamp with time zone,
	"source_reported_end_at" timestamp with time zone,
	"is_active_observed" boolean,
	"ad_library_url" text,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"raw_last_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ads_source_source_ad_id_unique" UNIQUE("source","source_ad_id")
);
--> statement-breakpoint
CREATE TABLE "ad_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"body" text,
	"title" text,
	"description" text,
	"cta_text" text,
	"cta_type" text,
	"destination_url" text,
	"raw_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_cards_ad_id_position_unique" UNIQUE("ad_id","position")
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_type" text NOT NULL,
	"source_url" text,
	"storage_provider" text,
	"storage_key" text,
	"mime_type" text,
	"byte_size" bigint,
	"sha256" text,
	"download_status" text DEFAULT 'PENDING' NOT NULL,
	"download_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_sha256_unique" UNIQUE("sha256")
);
--> statement-breakpoint
CREATE TABLE "ad_media" (
	"ad_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_media_pk" PRIMARY KEY("ad_id","media_asset_id","position")
);
--> statement-breakpoint
CREATE TABLE "card_media" (
	"ad_card_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_media_pk" PRIMARY KEY("ad_card_id","media_asset_id","position")
);
--> statement-breakpoint
CREATE TABLE "ad_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_id" uuid NOT NULL,
	"ingestion_run_id" uuid NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"observed_active" boolean,
	"snapshot_hash" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "ad_observations_ad_id_ingestion_run_id_unique" UNIQUE("ad_id","ingestion_run_id")
);
--> statement-breakpoint
ALTER TABLE "source_accounts" ADD CONSTRAINT "source_accounts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_runs" ADD CONSTRAINT "ingestion_runs_source_account_id_source_accounts_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "public"."source_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_ingestion_items" ADD CONSTRAINT "raw_ingestion_items_ingestion_run_id_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "public"."ingestion_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_source_account_id_source_accounts_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "public"."source_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_cards" ADD CONSTRAINT "ad_cards_ad_id_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_media" ADD CONSTRAINT "ad_media_ad_id_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_media" ADD CONSTRAINT "ad_media_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_media" ADD CONSTRAINT "card_media_ad_card_id_ad_cards_id_fk" FOREIGN KEY ("ad_card_id") REFERENCES "public"."ad_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_media" ADD CONSTRAINT "card_media_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_observations" ADD CONSTRAINT "ad_observations_ad_id_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_observations" ADD CONSTRAINT "ad_observations_ingestion_run_id_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "public"."ingestion_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_accounts_brand_id_idx" ON "source_accounts" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "ingestion_runs_source_account_id_idx" ON "ingestion_runs" USING btree ("source_account_id");--> statement-breakpoint
CREATE INDEX "ingestion_runs_started_at_idx" ON "ingestion_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "ingestion_runs_status_idx" ON "ingestion_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "raw_ingestion_items_ingestion_run_id_idx" ON "raw_ingestion_items" USING btree ("ingestion_run_id");--> statement-breakpoint
CREATE INDEX "raw_ingestion_items_source_item_id_idx" ON "raw_ingestion_items" USING btree ("source_item_id");--> statement-breakpoint
CREATE INDEX "raw_ingestion_items_payload_hash_idx" ON "raw_ingestion_items" USING btree ("payload_hash");--> statement-breakpoint
CREATE INDEX "ads_source_account_id_idx" ON "ads" USING btree ("source_account_id");--> statement-breakpoint
CREATE INDEX "ads_source_collation_id_idx" ON "ads" USING btree ("source_collation_id");--> statement-breakpoint
CREATE INDEX "ads_platform_start_at_idx" ON "ads" USING btree ("platform_start_at");--> statement-breakpoint
CREATE INDEX "ads_last_seen_at_idx" ON "ads" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "ads_is_active_observed_idx" ON "ads" USING btree ("is_active_observed");--> statement-breakpoint
CREATE INDEX "media_assets_storage_key_idx" ON "media_assets" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "media_assets_download_status_idx" ON "media_assets" USING btree ("download_status");--> statement-breakpoint
CREATE INDEX "ad_media_media_asset_id_idx" ON "ad_media" USING btree ("media_asset_id");--> statement-breakpoint
CREATE INDEX "card_media_media_asset_id_idx" ON "card_media" USING btree ("media_asset_id");--> statement-breakpoint
CREATE INDEX "ad_observations_ingestion_run_id_idx" ON "ad_observations" USING btree ("ingestion_run_id");--> statement-breakpoint
CREATE INDEX "ad_observations_observed_at_idx" ON "ad_observations" USING btree ("observed_at");