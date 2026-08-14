/**
 * Drizzle Kit configuration.
 *
 * Drizzle Kit runs outside the Next.js server runtime (it is a CLI tool),
 * so it does not automatically load .env.local. We use @next/env's
 * loadEnvConfig — the mechanism recommended in the Next.js 16 docs for
 * ORM configuration files — to load the same env files that Next.js uses.
 *
 * Migration policy (Step 3A):
 *  - Migrations are source-controlled in drizzle/.
 *  - Workflow: schema change → drizzle-kit generate → review SQL → drizzle-kit migrate.
 *  - drizzle-kit push is NOT used; migration files are the source of truth.
 *  - Destructive operations require explicit review before migrate.
 */

import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Load .env.local (and .env) exactly as Next.js does.
// cwd() is the project root when drizzle-kit is invoked from package.json scripts.
loadEnvConfig(process.cwd());

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set. " +
      "Check your .env.local file (see .env.example).",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
  // Verbose output during migrations — helps catch unexpected changes.
  verbose: true,
  // Require explicit confirmation for destructive changes.
  strict: true,
});
