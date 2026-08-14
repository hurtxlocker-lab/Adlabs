import { z } from "zod";

/**
 * Helper for validating provider external identifiers safely without precision loss.
 *
 * Rules:
 *  1. Non-empty string IDs are trimmed and accepted.
 *  2. Blank/empty strings are rejected.
 *  3. Safe integer numbers (Number.isSafeInteger(val)) are converted to string.
 *  4. Unsafe numbers (!Number.isSafeInteger(val)) FAIL validation.
 */
export const providerIdSchema = z.preprocess(
  (val) => (typeof val === "string" ? val.trim() : val),
  z.union([
    z.string().min(1, { message: "Identifier string must not be empty or blank" }),
    z
      .number()
      .refine((n) => Number.isSafeInteger(n), {
        message:
          "Numeric identifier must be a safe integer to avoid precision corruption",
      })
      .transform((n) => String(n)),
  ]),
);

export const optionalProviderIdSchema = z.preprocess(
  (val) => {
    if (val === null || val === undefined) return val;
    if (typeof val === "string") return val.trim();
    return val;
  },
  z
    .union([
      z.string().min(1, { message: "Identifier string must not be empty or blank" }),
      z
        .number()
        .refine((n) => Number.isSafeInteger(n), {
          message:
            "Numeric identifier must be a safe integer to avoid precision corruption",
        })
        .transform((n) => String(n)),
    ])
    .nullable()
    .optional(),
);

/**
 * Zod schema for media structures inside Curious Coder payloads.
 * Tolerant of extra provider keys and missing/nullable URLs.
 */
export const curiousCoderVideoSchema = z
  .object({
    video_hd_url: z.string().nullable().optional(),
    video_sd_url: z.string().nullable().optional(),
    video_preview_image_url: z.string().nullable().optional(),
  })
  .passthrough();

export const curiousCoderImageSchema = z
  .object({
    original_image_url: z.string().nullable().optional(),
    resized_image_url: z.string().nullable().optional(),
  })
  .passthrough();

/**
 * Child card structure for DCO / carousel ads.
 */
export const curiousCoderCardSchema = z
  .object({
    body: z
      .union([z.string(), z.record(z.string(), z.unknown())])
      .nullable()
      .optional(),
    title: z
      .union([z.string(), z.record(z.string(), z.unknown())])
      .nullable()
      .optional(),
    caption: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    link_description: z.string().nullable().optional(),
    cta_text: z.string().nullable().optional(),
    cta_type: z.string().nullable().optional(),
    link_url: z.string().nullable().optional(),

    // Direct card media properties
    video_hd_url: z.string().nullable().optional(),
    video_sd_url: z.string().nullable().optional(),
    video_preview_image_url: z.string().nullable().optional(),
    original_image_url: z.string().nullable().optional(),
    resized_image_url: z.string().nullable().optional(),

    // Nested media arrays on cards
    videos: z.array(curiousCoderVideoSchema).nullable().optional(),
    images: z.array(curiousCoderImageSchema).nullable().optional(),
  })
  .passthrough();

/**
 * Snapshot object representing the rendered creative and publisher state.
 */
export const curiousCoderSnapshotSchema = z
  .object({
    page_id: optionalProviderIdSchema,
    page_name: z.string().nullable().optional(),
    page_profile_uri: z.string().nullable().optional(),

    branded_content_page_id: optionalProviderIdSchema,
    branded_content_page_name: z.string().nullable().optional(),
    branded_content_page_profile_uri: z.string().nullable().optional(),

    display_format: z.string().nullable().optional(),

    body: z
      .union([
        z.string(),
        z.object({
          markup: z.object({ __html: z.string() }).optional(),
          text: z.string().optional(),
        }).passthrough(),
        z.record(z.string(), z.unknown()),
      ])
      .nullable()
      .optional(),

    title: z
      .union([
        z.string(),
        z.object({
          text: z.string().optional(),
        }).passthrough(),
        z.record(z.string(), z.unknown()),
      ])
      .nullable()
      .optional(),

    caption: z.string().nullable().optional(),
    link_description: z.string().nullable().optional(),
    cta_text: z.string().nullable().optional(),
    cta_type: z.string().nullable().optional(),
    link_url: z.string().nullable().optional(),

    // Confirmed real provider media paths under snapshot
    videos: z.array(curiousCoderVideoSchema).nullable().optional(),
    images: z.array(curiousCoderImageSchema).nullable().optional(),
    cards: z.array(curiousCoderCardSchema).nullable().optional(),
    extra_images: z.array(curiousCoderImageSchema).nullable().optional(),
    extra_videos: z.array(curiousCoderVideoSchema).nullable().optional(),
  })
  .passthrough();

/**
 * Top-level Curious Coder Meta Scraper item schema.
 *
 * Rules:
 *  - ad_archive_id is the MANDATORY non-empty canonical identifier.
 *  - ad_id is optional/nullable and must NOT be used as canonical identity.
 *  - Identifiers must be strings or safe integers. Unsafe numbers are rejected.
 *  - All other fields are optional and tolerant of provider variations.
 */
export const curiousCoderItemSchema = z
  .object({
    // Primary unique identity from Meta Ad Library archive
    ad_archive_id: providerIdSchema,

    // Nullable legacy ad ID (not canonical)
    ad_id: optionalProviderIdSchema,

    // Opaque collation metadata
    collation_id: optionalProviderIdSchema,
    collation_count: z.number().nullable().optional(),

    // Tracked advertiser identity
    page_id: optionalProviderIdSchema,
    page_name: z.string().nullable().optional(),
    page_profile_uri: z.string().nullable().optional(),

    // Platforms
    publisher_platform: z
      .union([z.array(z.string()), z.string()])
      .nullable()
      .optional(),
    publisher_platforms: z.array(z.string()).nullable().optional(),

    // Dates
    start_date: z.union([z.number(), z.string()]).nullable().optional(),
    end_date: z.union([z.number(), z.string()]).nullable().optional(),
    start_date_formatted: z.string().nullable().optional(),
    end_date_formatted: z.string().nullable().optional(),

    // Activity state
    is_active: z.boolean().nullable().optional(),
    active: z.boolean().nullable().optional(),

    // Ad Library URL
    ad_library_url: z.string().nullable().optional(),
    url: z.string().nullable().optional(),

    // Rendered creative snapshot
    snapshot: curiousCoderSnapshotSchema.nullable().optional(),
  })
  .passthrough();

export type CuriousCoderItem = z.infer<typeof curiousCoderItemSchema>;
export type CuriousCoderSnapshot = z.infer<typeof curiousCoderSnapshotSchema>;
export type CuriousCoderCard = z.infer<typeof curiousCoderCardSchema>;
export type CuriousCoderVideo = z.infer<typeof curiousCoderVideoSchema>;
export type CuriousCoderImage = z.infer<typeof curiousCoderImageSchema>;
