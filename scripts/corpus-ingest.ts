/**
 * scripts/corpus-ingest.ts
 *
 * CLI Entrypoint for Semi-Automatic Corpus Extraction Runner.
 *
 * Usage:
 *   pnpm corpus:ingest --url "<META_AD_LIBRARY_URL>" --count 50 --country IN [--brand mamaearth] [--dry-run]
 *
 * Invariants:
 *  - scrapeAdDetails defaults to true.
 *  - Runs full canonical ingestion, derivative processing, and discovery projection.
 *  - Safe output: zero credentials or secret tokens printed.
 */

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env") as {
  loadEnvConfig: (dir: string) => void;
};
loadEnvConfig(projectRoot);

import { closeDatabaseConnection } from "../src/db/client.ts";
import { parseCorpusIngestCliArgs, runCorpusIngest } from "../src/corpus/ingest-runner.ts";

async function main() {
  const args = parseCorpusIngestCliArgs(process.argv.slice(2));

  try {
    const result = await runCorpusIngest(args);
    if (!result.success) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error("\n❌ Corpus Ingest Error:\n  ", err instanceof Error ? err.message : String(err), "\n");
    process.exitCode = 1;
  } finally {
    await closeDatabaseConnection();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error("\n❌ Fatal Error:", err);
    process.exitCode = 1;
  });
}
