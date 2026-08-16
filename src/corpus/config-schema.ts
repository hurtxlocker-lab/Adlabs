import { z } from "zod";

export const CandidateBrandSampleSchema = z.object({
  brand: z.string().trim().min(1, "Brand name is required"),
  url: z
    .string()
    .trim()
    .url("Valid Meta Ad Library URL is required")
    .refine(
      (u) => u.toLowerCase().includes("facebook.com/ads/library/"),
      "corpus:sample:dev expects an operator-supplied Meta Ad Library URL (containing 'facebook.com/ads/library/').",
    ),
  limit: z
    .number()
    .int("Limit must be an integer")
    .min(1, "Limit must be between 1 and 10")
    .max(10, "Limit cannot exceed 10")
    .default(6),
});

export const CandidateBatchConfigSchema = z
  .array(CandidateBrandSampleSchema)
  .min(1, "Batch config must contain at least one brand candidate");

export type CandidateBrandSample = z.infer<typeof CandidateBrandSampleSchema>;
export type CandidateBatchConfig = z.infer<typeof CandidateBatchConfigSchema>;
