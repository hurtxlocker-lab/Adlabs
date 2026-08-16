CREATE TABLE "media_derivatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_media_asset_id" uuid NOT NULL,
	"derived_media_asset_id" uuid,
	"derivative_kind" text NOT NULL,
	"recipe_version" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"error_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "has_audio" boolean;--> statement-breakpoint
ALTER TABLE "media_derivatives" ADD CONSTRAINT "media_derivatives_source_media_asset_id_media_assets_id_fk" FOREIGN KEY ("source_media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_derivatives" ADD CONSTRAINT "media_derivatives_derived_media_asset_id_media_assets_id_fk" FOREIGN KEY ("derived_media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_derivatives_unique_recipe_idx" ON "media_derivatives" USING btree ("source_media_asset_id","derivative_kind","recipe_version");--> statement-breakpoint
CREATE INDEX "media_derivatives_derived_asset_idx" ON "media_derivatives" USING btree ("derived_media_asset_id");--> statement-breakpoint
CREATE INDEX "media_derivatives_status_idx" ON "media_derivatives" USING btree ("status");