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
import { getAdLibraryItems } from "../src/features/ad-library/index.ts";
import { computeCorpusAudit, formatCorpusAuditTable } from "../src/corpus/audit.ts";

async function main() {
  try {
    const items = await getAdLibraryItems();
    const result = computeCorpusAudit(items);
    console.log(formatCorpusAuditTable(result));
  } finally {
    await closeDatabaseConnection();
  }
}

main().catch((err) => {
  console.error("❌ Audit Error:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
