import type { db } from "@/db/client";
import type * as schema from "@/db/schema";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";

export type DbClient = typeof db;
export type DbTransaction = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
export type DbOrTx = DbClient | DbTransaction;

export type BrandRow = typeof schema.brands.$inferSelect;
export type SourceAccountRow = typeof schema.sourceAccounts.$inferSelect;
export type IngestionRunRow = typeof schema.ingestionRuns.$inferSelect;
export type RawIngestionItemRow = typeof schema.rawIngestionItems.$inferSelect;

export interface EnsureBrandInput {
  name: string;
  slug: string;
  websiteUrl?: string | null;
  category?: string | null;
}

export interface EnsureSourceAccountInput {
  brandId: string;
  source: string;
  sourcePageId: string;
  sourcePageUrl?: string | null;
  displayName?: string | null;
  metadata?: Record<string, unknown>;
}

export interface StartIngestionRunInput {
  source: string;
  sourceAccountId: string;
  metadata?: Record<string, unknown>;
}

export type IngestionRunFinalStatus = "SUCCEEDED" | "PARTIAL" | "FAILED";

export interface FinishIngestionRunInput {
  ingestionRunId: string;
  status: IngestionRunFinalStatus;

  sourceItemsCount: number;
  newAdsCount: number;
  updatedAdsCount: number;

  mediaDownloadedCount: number;
  mediaDuplicateCount: number;
  mediaFailedCount: number;

  bytesDownloaded: bigint;
  uniqueBytesStored: bigint;

  errorSummary?: string | null;
  metadata?: Record<string, unknown>;
}

export interface SaveRawIngestionItemInput {
  ingestionRunId: string;
  sourceItemId?: string | null;
  payload: unknown;
  payloadHash: string;
}

export class SourceAccountOwnershipConflictError extends Error {
  readonly existingAccount: SourceAccountRow;
  readonly attemptedBrandId: string;

  constructor(
    message: string,
    existingAccount: SourceAccountRow,
    attemptedBrandId: string,
  ) {
    super(message);
    this.name = "SourceAccountOwnershipConflictError";
    this.existingAccount = existingAccount;
    this.attemptedBrandId = attemptedBrandId;
  }
}

export class IngestionRunStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestionRunStateError";
  }
}

export class InvalidCounterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCounterError";
  }
}
