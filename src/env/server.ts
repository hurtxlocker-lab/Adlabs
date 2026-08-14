/**
 * Server-only environment validation.
 *
 * This module is the single authoritative source of validated, typed
 * environment variables for all server-side code. It:
 *
 *   - Validates variables at startup using Zod.
 *   - Fails loudly with clear messages when configuration is missing.
 *   - Never logs secret values.
 *   - Is guarded by the "server-only" package, preventing accidental
 *     import into Client Components or browser bundles.
 *
 * Usage:
 *   import { env } from "@/env/server";
 *   // env.DATABASE_URL is guaranteed non-empty at this point.
 */

// Prevents this module from being imported in Client Components.
// Next.js will throw a build error if a Client Component imports it.
import "server-only";

import { createRequire } from "node:module";
import { z } from "zod";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env") as {
  loadEnvConfig: (dir: string, dev?: boolean) => void;
};
loadEnvConfig(process.cwd(), true);

// Ensure .env.local is also loaded when NODE_ENV=test
import { loadLocalEnv } from "@/testing/load-env";
loadLocalEnv();

const serverEnvSchema = z.object({
  /**
   * Supabase Session Pooler connection string.
   * Format: postgresql://user:password@host:port/database
   */
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL must not be empty")
    .refine(
      (val) => val.startsWith("postgresql://") || val.startsWith("postgres://"),
      "DATABASE_URL must be a PostgreSQL connection string (postgresql://... or postgres://...)",
    ),

  /**
   * Expected Supabase Project Reference (e.g. abcdefghijklmnop).
   * Required for write-safety target checks in migrations and DB integration tests.
   */
  SUPABASE_PROJECT_REF: z
    .string()
    .min(1, "SUPABASE_PROJECT_REF must not be empty")
    .optional(),

  /**
   * Cloudflare R2 Account ID.
   */
  R2_ACCOUNT_ID: z.string().min(1).optional(),

  /**
   * Cloudflare R2 Access Key ID.
   */
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),

  /**
   * Cloudflare R2 Secret Access Key.
   */
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),

  /**
   * Cloudflare R2 Bucket Name.
   */
  R2_BUCKET_NAME: z.string().min(1).optional(),

  /**
   * Optional Cloudflare R2 Public Base URL for presentation/linking.
   */
  R2_PUBLIC_BASE_URL: z.string().url().optional().or(z.literal("")).optional(),
});

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Surface all validation errors at once without printing secret values.
  const formatted = parsed.error.issues
    .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(
    `❌ Invalid server environment configuration:\n${formatted}\n\n` +
      "Check your .env.local file (see .env.example for required variables).",
  );
}

export const env = parsed.data;
