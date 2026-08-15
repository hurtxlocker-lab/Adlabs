/**
 * src/ingestion/providers/apify/client.ts
 *
 * Thin factory that creates a configured ApifyClient instance.
 *
 * The real ApifyClient is imported here. All other modules receive
 * the client via dependency injection (ApifyClientInterface) so that
 * tests can provide a fake without touching real network.
 *
 * Apify config is read lazily (only when this function is called),
 * so pnpm test / pnpm build do not fail if APIFY_TOKEN is absent.
 */

import { ApifyClient } from "apify-client";
import { ApifyConfigurationError } from "./errors";

/**
 * Creates a configured ApifyClient using APIFY_TOKEN from process.env.
 *
 * Throws ApifyConfigurationError if APIFY_TOKEN is absent or blank.
 * Called only from the DEV run script — never from the test suite.
 */
export function createApifyClient(): ApifyClient {
  const token = process.env.APIFY_TOKEN;
  if (!token || token.trim().length === 0) {
    throw new ApifyConfigurationError(
      "APIFY_TOKEN is not set or empty. " +
        "Set APIFY_TOKEN in .env.local before executing the Apify adapter.",
    );
  }
  return new ApifyClient({ token: token.trim() });
}
