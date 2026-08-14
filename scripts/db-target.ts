/**
 * scripts/db-target.ts
 *
 * Safe database target inspector.
 *
 * Prints connection metadata (host, port, database, SSL) without exposing
 * credentials (username, password, query parameters).
 *
 * Run via:
 *   pnpm db:target
 *
 * Does NOT make a network connection.
 *
 * Implementation note:
 *   @next/env is a CommonJS module with no ESM exports map.
 *   We use createRequire to import it from this ES module context,
 *   matching the pattern Node.js documents for mixed CJS/ESM interop.
 */

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Resolve project root from this script's location (scripts/ is one level down).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Load .env.local the same way Next.js does.
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env") as {
  loadEnvConfig: (dir: string) => void;
};
loadEnvConfig(projectRoot);

const raw = process.env.DATABASE_URL;

if (!raw) {
  console.error(
    "❌ DATABASE_URL is not set.\n" +
      "   Check your .env.local file (see .env.example).",
  );
  process.exit(1);
}

let parsed: URL;
try {
  parsed = new URL(raw);
} catch {
  console.error(
    "❌ DATABASE_URL is not a valid URL.\n" +
      "   Expected format: postgresql://user:password@host:port/database",
  );
  process.exit(1);
}

// Validate protocol
if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
  console.error(
    `❌ DATABASE_URL has unexpected protocol: ${parsed.protocol}\n` +
      "   Expected: postgresql:// or postgres://",
  );
  process.exit(1);
}

const host = parsed.hostname;
const port = parsed.port || "5432";
const database = parsed.pathname.replace(/^\//, "") || "(default)";
const sslMode =
  parsed.searchParams.get("sslmode") ??
  "not specified (driver default applies)";

// postgres.js enables SSL automatically for non-localhost hosts.
const isLocalhost =
  host === "localhost" || host === "127.0.0.1" || host === "::1";
const sslStatus = isLocalhost
  ? "disabled (localhost)"
  : "required (non-localhost host — postgres.js auto-enables SSL)";

console.log("\nDatabase target:");
console.log(`  host:     ${host}`);
console.log(`  port:     ${port}`);
console.log(`  database: ${database}`);
console.log(`  ssl:      ${sslStatus}`);
console.log(`  sslmode:  ${sslMode}`);
console.log(
  "\n  ✓ Credentials omitted. No network connection was made.\n",
);
