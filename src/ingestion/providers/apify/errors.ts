/**
 * src/ingestion/providers/apify/errors.ts
 *
 * Typed errors for the Apify saved-task adapter.
 *
 * Safe context only — never includes token, credentials, or full raw payloads.
 */

/** Thrown when required Apify configuration (e.g. APIFY_TOKEN) is missing. */
export class ApifyConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApifyConfigurationError";
  }
}

/**
 * Thrown when the Apify task run completes with a non-SUCCEEDED status,
 * or when the run cannot be started.
 */
export class ApifyTaskRunError extends Error {
  public readonly taskId: string;
  public readonly runId: string | null;
  public readonly runStatus: string | null;

  constructor(opts: {
    message: string;
    taskId: string;
    runId?: string | null;
    runStatus?: string | null;
  }) {
    super(opts.message);
    this.name = "ApifyTaskRunError";
    this.taskId = opts.taskId;
    this.runId = opts.runId ?? null;
    this.runStatus = opts.runStatus ?? null;
  }
}

/**
 * Thrown when the dataset cannot be retrieved or is missing required fields.
 */
export class ApifyDatasetError extends Error {
  public readonly taskId: string;
  public readonly runId: string | null;
  public readonly datasetId: string | null;

  constructor(opts: {
    message: string;
    taskId: string;
    runId?: string | null;
    datasetId?: string | null;
  }) {
    super(opts.message);
    this.name = "ApifyDatasetError";
    this.taskId = opts.taskId;
    this.runId = opts.runId ?? null;
    this.datasetId = opts.datasetId ?? null;
  }
}
