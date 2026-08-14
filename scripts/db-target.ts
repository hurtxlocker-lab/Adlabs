/**
 * scripts/db-target.ts
 *
 * Safe database target inspector and write-safety gatekeeper.
 *
 * Verifies that DATABASE_URL points to the intended Supabase project
 * specified by SUPABASE_PROJECT_REF before migrations or writes proceed.
 *
 * Run via:
 *   pnpm db:target
 *
 * Does NOT make a network connection.
 * Does NOT print passwords, full connection strings, or raw usernames.
 */

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  TargetSafetyError,
  verifyDatabaseTargetSafety,
} from "../src/db/target-safety.ts";

// Resolve project root from this script's location (scripts/ is one level down).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Load .env.local the same way Next.js does.
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env") as {
  loadEnvConfig: (dir: string) => void;
};
loadEnvConfig(projectRoot);

const databaseUrl = process.env.DATABASE_URL;
const expectedProjectRef = process.env.SUPABASE_PROJECT_REF;

if (!databaseUrl) {
  console.error(
    "❌ DATABASE_URL is not set.\n" +
      "   Check your .env.local file (see .env.example).",
  );
  process.exit(1);
}

try {
  const result = verifyDatabaseTargetSafety(databaseUrl, expectedProjectRef);

  console.log("\nDatabase target:");
  console.log(`  host:         ${result.host}`);
  console.log(`  port:         ${result.port}`);
  console.log(`  database:     ${result.database}`);
  console.log(`  ssl:          ${result.sslStatus}`);
  console.log(`  sslmode:      ${result.sslMode}`);
  console.log(`  project ref:  ${result.redactedProjectRef}`);
  console.log(`  target match: YES (matches SUPABASE_PROJECT_REF)`);
  console.log(
    "\n  ✓ Credentials omitted. Target verified safely without network connection.\n",
  );
} catch (err) {
  if (err instanceof TargetSafetyError) {
    console.error(`\n❌ Target Safety Verification Failed:\n   ${err.message}\n`);
  } else {
    console.error(`\n❌ Target Safety Error:\n   ${err}\n`);
  }
  process.exit(1);
}
