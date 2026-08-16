/**
 * src/ingestion/providers/apify/index.ts
 *
 * Public API of the Apify provider adapter.
 *
 * Only the adapter function, its types, and its errors are exported.
 * ApifyClient import is NOT re-exported — kept internal to client.ts.
 */

export { fetchCuriousCoderTaskItems } from "./curious-coder-task";
export { createApifyClient } from "./client";
export * from "./input-builder";
export * from "./types";
export * from "./errors";
