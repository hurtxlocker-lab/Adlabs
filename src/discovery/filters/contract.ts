import { z } from "zod";
import type { DiscoverySort } from "./types";

export const discoverySortEnum = [
  "RECENTLY_SEEN",
  "OLDEST_SEEN",
  "NEWEST_STARTED",
  "OLDEST_STARTED",
  "EU_REACH_DESC",
  "EU_REACH_ASC",
  "INSTAGRAM_FOLLOWERS_DESC",
  "INSTAGRAM_FOLLOWERS_ASC",
  "CREATIVE_REUSE_DESC",
  "CREATIVE_REUSE_ASC",
] as const satisfies readonly DiscoverySort[];

export const discoverySortSchema = z.enum(discoverySortEnum).default("RECENTLY_SEEN");

const uuidSchema = z.string().uuid();
const countryCodeSchema = z
  .string()
  .trim()
  .length(2, "Country code must be a 2-letter ISO code")
  .transform((val) => val.toUpperCase());

const ageSchema = z.number().int().min(0).max(120);

const dateOrStringSchema = z
  .union([z.date(), z.string().datetime(), z.string().date()])
  .transform((val) => (val instanceof Date ? val : new Date(val)));

const stringOrBigIntSchema = z
  .union([z.number().int().nonnegative(), z.bigint().nonnegative(), z.string().regex(/^\d+$/)])
  .transform((val) => (typeof val === "bigint" ? val : BigInt(val)));

export const discoveryFilterInputSchema = z
  .object({
    // Identity
    brandIds: z.array(uuidSchema).optional(),
    sourceAccountIds: z.array(uuidSchema).optional(),

    // Lifecycle
    isActive: z.boolean().optional(),
    startedAfter: dateOrStringSchema.optional(),
    startedBefore: dateOrStringSchema.optional(),
    runningMinDays: z.number().int().nonnegative().optional(),
    runningMaxDays: z.number().int().nonnegative().optional(),

    // Creative
    mediaTypes: z.array(z.string()).optional(),
    shapeFamilies: z.array(z.enum(["portrait", "square", "landscape", "wide"])).optional(),
    videoDurationMinMs: z.number().int().nonnegative().optional(),
    videoDurationMaxMs: z.number().int().nonnegative().optional(),
    ctaTypes: z.array(z.string()).optional(),
    publisherPlatforms: z.array(z.string()).optional(),
    copyLengthMinChars: z.number().int().nonnegative().optional(),
    copyLengthMaxChars: z.number().int().nonnegative().optional(),
    copyLengthMinWords: z.number().int().nonnegative().optional(),
    copyLengthMaxWords: z.number().int().nonnegative().optional(),

    // Creative Reuse
    exactCreativeReuseMin: z.number().int().min(1).optional(),
    exactCreativeReuseMax: z.number().int().min(1).optional(),

    // Account
    pageCategories: z.array(z.string()).optional(),
    instagramFollowersMin: stringOrBigIntSchema.optional(),
    instagramFollowersMax: stringOrBigIntSchema.optional(),
    facebookLikesMin: stringOrBigIntSchema.optional(),
    facebookLikesMax: stringOrBigIntSchema.optional(),
    facebookVerified: z.boolean().optional(),
    instagramVerified: z.boolean().optional(),

    // Transparency Presence
    hasEuTransparencyEvidence: z.boolean().optional(),
    hasUkTransparencyEvidence: z.boolean().optional(),
    hasBrTransparencyEvidence: z.boolean().optional(),

    // Regional Reach
    euReachMin: stringOrBigIntSchema.optional(),
    euReachMax: stringOrBigIntSchema.optional(),
    ukReachMin: stringOrBigIntSchema.optional(),
    ukReachMax: stringOrBigIntSchema.optional(),
    brReachMin: stringOrBigIntSchema.optional(),
    brReachMax: stringOrBigIntSchema.optional(),

    // Countries
    targetCountries: z.array(countryCodeSchema).optional(),
    reachedCountries: z.array(countryCodeSchema).optional(),

    // Age
    euTargetAgeMin: ageSchema.optional(),
    euTargetAgeMax: ageSchema.optional(),
    ukTargetAgeMin: ageSchema.optional(),
    ukTargetAgeMax: ageSchema.optional(),
    brTargetAgeMin: ageSchema.optional(),
    brTargetAgeMax: ageSchema.optional(),

    // Gender
    euTargetGenders: z.array(z.string()).optional(),
    ukTargetGenders: z.array(z.string()).optional(),
    brTargetGenders: z.array(z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    // Range sanity checks: reject min > max
    if (data.startedAfter && data.startedBefore && data.startedAfter > data.startedBefore) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startedAfter must not be later than startedBefore",
        path: ["startedAfter"],
      });
    }
    if (data.runningMinDays != null && data.runningMaxDays != null && data.runningMinDays > data.runningMaxDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "runningMinDays must not be greater than runningMaxDays",
        path: ["runningMinDays"],
      });
    }
    if (data.videoDurationMinMs != null && data.videoDurationMaxMs != null && data.videoDurationMinMs > data.videoDurationMaxMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "videoDurationMinMs must not be greater than videoDurationMaxMs",
        path: ["videoDurationMinMs"],
      });
    }
    if (data.copyLengthMinChars != null && data.copyLengthMaxChars != null && data.copyLengthMinChars > data.copyLengthMaxChars) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "copyLengthMinChars must not be greater than copyLengthMaxChars",
        path: ["copyLengthMinChars"],
      });
    }
    if (data.copyLengthMinWords != null && data.copyLengthMaxWords != null && data.copyLengthMinWords > data.copyLengthMaxWords) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "copyLengthMinWords must not be greater than copyLengthMaxWords",
        path: ["copyLengthMinWords"],
      });
    }
    if (data.exactCreativeReuseMin != null && data.exactCreativeReuseMax != null && data.exactCreativeReuseMin > data.exactCreativeReuseMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "exactCreativeReuseMin must not be greater than exactCreativeReuseMax",
        path: ["exactCreativeReuseMin"],
      });
    }
    if (data.instagramFollowersMin != null && data.instagramFollowersMax != null && data.instagramFollowersMin > data.instagramFollowersMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "instagramFollowersMin must not be greater than instagramFollowersMax",
        path: ["instagramFollowersMin"],
      });
    }
    if (data.facebookLikesMin != null && data.facebookLikesMax != null && data.facebookLikesMin > data.facebookLikesMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "facebookLikesMin must not be greater than facebookLikesMax",
        path: ["facebookLikesMin"],
      });
    }
    if (data.euReachMin != null && data.euReachMax != null && data.euReachMin > data.euReachMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "euReachMin must not be greater than euReachMax",
        path: ["euReachMin"],
      });
    }
    if (data.ukReachMin != null && data.ukReachMax != null && data.ukReachMin > data.ukReachMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ukReachMin must not be greater than ukReachMax",
        path: ["ukReachMin"],
      });
    }
    if (data.brReachMin != null && data.brReachMax != null && data.brReachMin > data.brReachMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "brReachMin must not be greater than brReachMax",
        path: ["brReachMin"],
      });
    }
    if (data.euTargetAgeMin != null && data.euTargetAgeMax != null && data.euTargetAgeMin > data.euTargetAgeMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "euTargetAgeMin must not be greater than euTargetAgeMax",
        path: ["euTargetAgeMin"],
      });
    }
    if (data.ukTargetAgeMin != null && data.ukTargetAgeMax != null && data.ukTargetAgeMin > data.ukTargetAgeMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ukTargetAgeMin must not be greater than ukTargetAgeMax",
        path: ["ukTargetAgeMin"],
      });
    }
    if (data.brTargetAgeMin != null && data.brTargetAgeMax != null && data.brTargetAgeMin > data.brTargetAgeMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "brTargetAgeMin must not be greater than brTargetAgeMax",
        path: ["brTargetAgeMin"],
      });
    }
  });

export const discoveryQueryInputSchema = z.object({
  filters: discoveryFilterInputSchema.optional(),
  sort: discoverySortSchema.optional().default("RECENTLY_SEEN"),
  pageSize: z.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().trim().min(1).optional(),
  limitPerBrand: z.number().int().min(1).max(100).optional(),
});
