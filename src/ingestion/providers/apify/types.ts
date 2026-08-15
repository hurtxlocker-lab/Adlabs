/**
 * src/ingestion/providers/apify/types.ts
 *
 * Narrow domain types for the Apify saved-task adapter.
 *
 * These types describe the adapter's external API only.
 * No Apify SDK types are exported beyond this module's boundary.
 */

/** Input to fetchCuriousCoderTaskItems. */
export interface FetchCuriousCoderTaskItemsInput {
  /** Apify saved task ID, e.g. "hurtxlocker/3-ad-task-mamaearth". */
  taskId: string;

  /**
   * Local hard cap: maximum number of dataset items to return.
   * Items beyond this cap are silently discarded.
   * Independent of the task's own configured limit.
   */
  limit: number;

  /**
   * Maximum wall-clock seconds to wait for the Apify run to complete.
   * The adapter fails if the run exceeds this duration.
   * Default: 300 (5 minutes).
   */
  timeoutSeconds?: number;
}

/** Result metadata from fetchCuriousCoderTaskItems. */
export interface FetchCuriousCoderTaskItemsResult {
  /** The Apify run ID for tracing/logging. */
  runId: string;

  /** Final Apify run status (e.g. "SUCCEEDED", "FAILED"). */
  runStatus: string;

  /** Dataset ID used to retrieve items. */
  datasetId: string;

  /** Number of items returned by the Apify dataset (before local hard cap). */
  datasetItemCount: number;

  /**
   * Raw provider dataset items, capped to `limit`.
   * Items are unmodified provider objects — no parsing or normalization.
   */
  items: unknown[];
}

/** Injectable Apify client interface for dependency injection / testing. */
export interface ApifyClientInterface {
  task(taskId: string): {
    call(options: {
      waitSecs?: number;
    }): Promise<{ id: string; status: string; defaultDatasetId?: string | null }>;
  };
  dataset(datasetId: string): {
    listItems(options?: {
      limit?: number;
    }): Promise<{ items: unknown[] }>;
  };
}
