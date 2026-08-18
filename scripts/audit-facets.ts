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

import { queryDiscoveryFacets } from "../src/discovery/filters";
import { closeDatabaseConnection } from "../src/db/client";

async function main() {
  try {
    const facets = await queryDiscoveryFacets({});
    console.log("=== DEV CORPUS FACET AUDIT ===");
    console.log(JSON.stringify(facets, null, 2));
  } finally {
    await closeDatabaseConnection();
  }
}

main().catch(console.error);
