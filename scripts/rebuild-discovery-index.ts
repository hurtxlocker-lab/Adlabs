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

import { closeDatabaseConnection } from "../src/db/client";
import { rebuildDiscoveryIndex } from "../src/discovery/projection";

async function main() {
  const args = process.argv.slice(2);
  let brandSlug: string | undefined;
  let adId: string | undefined;
  let chunkSize = 100;
  let destructiveTruncate = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--brand" && args[i + 1]) {
      brandSlug = args[++i];
    } else if (arg.startsWith("--brand=")) {
      brandSlug = arg.split("=")[1];
    } else if (arg === "--ad" && args[i + 1]) {
      adId = args[++i];
    } else if (arg.startsWith("--ad=")) {
      adId = arg.split("=")[1];
    } else if (arg === "--chunk-size" && args[i + 1]) {
      chunkSize = parseInt(args[++i], 10) || 100;
    } else if (arg.startsWith("--chunk-size=")) {
      chunkSize = parseInt(arg.split("=")[1], 10) || 100;
    } else if (arg === "--truncate") {
      destructiveTruncate = true;
    }
  }

  console.log("🚀 Starting discovery index rebuild...");
  if (brandSlug) console.log(`   Brand filter: ${brandSlug}`);
  if (adId) console.log(`   Ad filter: ${adId}`);
  if (destructiveTruncate) console.log("   Destructive truncate: true");
  console.log(`   Chunk size: ${chunkSize}`);

  try {
    const result = await rebuildDiscoveryIndex({
      brandSlug,
      adId,
      chunkSize,
      destructiveTruncate,
    });

    console.log(`✅ Discovery index rebuild completed in ${result.durationMs}ms:`);
    console.log(`   Total ads projected: ${result.totalProjected}`);
  } finally {
    await closeDatabaseConnection();
  }
}

main().catch((err) => {
  console.error("❌ Rebuild Error:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
