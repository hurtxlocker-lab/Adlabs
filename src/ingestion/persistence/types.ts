import type { db } from "@/db/client";
import type * as schema from "@/db/schema";
import type { SourceAd, SourceAdCard } from "@/ingestion/types";
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
export type AdRow = typeof schema.ads.$inferSelect;
export type AdObservationRow = typeof schema.adObservations.$inferSelect;
export type AdCardRow = typeof schema.adCards.$inferSelect;
export type MediaAssetRow = typeof schema.mediaAssets.$inferSelect;
export type AdMediaRow = typeof schema.adMedia.$inferSelect;
export type CardMediaRow = typeof schema.cardMedia.$inferSelect;

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

export interface UpsertAdInput {
  sourceAccountId: string;
  ad: SourceAd;
}

export interface AdPersistenceResult {
  ad: AdRow;
  outcome: "created" | "updated";
}

export interface ReconcileAdCardsInput {
  adId: string;
  cards: SourceAdCard[];
}

export interface ReconcileAdCardsResult {
  cards: AdCardRow[];
  deletedCount: number;
}

export interface CreateAdObservationInput {
  adId: string;
  ingestionRunId: string;
  observedActive: boolean | null;
  snapshotHash?: string | null;
  metadata?: Record<string, unknown>;
}

export interface PersistObservedAdInput {
  sourceAccountId: string;
  ingestionRunId: string;
  ad: SourceAd;
  rawPayload: unknown;
  rawPayloadHash: string;
  snapshotHash?: string | null;
  observationMetadata?: Record<string, unknown>;
}

export interface PersistObservedAdResult {
  rawItem: RawIngestionItemRow;
  ad: AdRow;
  adOutcome: "created" | "updated";
  cards: AdCardRow[];
  observation: AdObservationRow;
}

// -----------------------------------------------------------------------------
// Stored Media Types & Inputs
// -----------------------------------------------------------------------------

export type PhysicalMediaType =
  | "IMAGE"
  | "VIDEO"
  | "UNKNOWN";

export type StoredMediaType = PhysicalMediaType;

export interface StoredMediaInput {
  mediaType: StoredMediaType;
  sourceUrl?: string | null;
  sha256: string;
  mimeType?: string | null;
  byteSize: bigint;
  storageProvider: string;
  storageKey: string;
  width?: number | null;
  height?: number | null;
}

export interface PreparedMediaRef {
  media: StoredMediaInput;
  position: number;
  role: string | null;
}

export interface PreparedCardMedia {
  cardPosition: number;
  media: PreparedMediaRef[];
}

export interface PreparedAdMedia {
  directMedia: PreparedMediaRef[];
  cardMedia: PreparedCardMedia[];
}

export interface PersistPreparedObservedAdInput {
  sourceAccountId: string;
  ingestionRunId: string;
  ad: SourceAd;
  rawPayload: unknown;
  rawPayloadHash?: string;
  preparedMedia: PreparedAdMedia;
  snapshotHash?: string | null;
  observationMetadata?: Record<string, unknown>;
}

export interface PersistPreparedObservedAdResult {
  rawItem: RawIngestionItemRow;
  ad: AdRow;
  adOutcome: "created" | "updated";
  cards: AdCardRow[];
  directMediaCount: number;
  cardMediaCount: number;
  deletedDirectMediaCount: number;
  deletedCardMediaCount: number;
  observation: AdObservationRow;
}

export interface StoredMediaRef {
  media: StoredMediaInput;
  position: number;
  role?: string | null;
}

export type EnsureStoredMediaAssetInput = StoredMediaInput;

export interface ReconcileAdMediaInput {
  adId: string;
  media: StoredMediaRef[];
}

export interface ReconcileAdMediaResult {
  relationships: AdMediaRow[];
  deletedCount: number;
}

export interface ReconcileCardMediaInput {
  adCardId: string;
  media: StoredMediaRef[];
}

export interface ReconcileCardMediaResult {
  relationships: CardMediaRow[];
  deletedCount: number;
}

// -----------------------------------------------------------------------------
// Persistence Error Types
// -----------------------------------------------------------------------------

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

export class AdSourceAccountConflictError extends Error {
  readonly existingAd: AdRow;
  readonly attemptedSourceAccountId: string;

  constructor(
    message: string,
    existingAd: AdRow,
    attemptedSourceAccountId: string,
  ) {
    super(message);
    this.name = "AdSourceAccountConflictError";
    this.existingAd = existingAd;
    this.attemptedSourceAccountId = attemptedSourceAccountId;
  }
}

export class AdvertiserSourceAccountMismatchError extends Error {
  readonly expectedPageId: string;
  readonly advertiserPageId: string;

  constructor(
    message: string,
    expectedPageId: string,
    advertiserPageId: string,
  ) {
    super(message);
    this.name = "AdvertiserSourceAccountMismatchError";
    this.expectedPageId = expectedPageId;
    this.advertiserPageId = advertiserPageId;
  }
}

export class DuplicateAdObservationError extends Error {
  readonly adId: string;
  readonly ingestionRunId: string;

  constructor(message: string, adId: string, ingestionRunId: string) {
    super(message);
    this.name = "DuplicateAdObservationError";
    this.adId = adId;
    this.ingestionRunId = ingestionRunId;
  }
}

export class DuplicateCardPositionError extends Error {
  readonly adId: string;
  readonly duplicatePosition: number;

  constructor(message: string, adId: string, duplicatePosition: number) {
    super(message);
    this.name = "DuplicateCardPositionError";
    this.adId = adId;
    this.duplicatePosition = duplicatePosition;
  }
}

export class MediaAssetConflictError extends Error {
  readonly sha256: string;
  readonly existingAsset: MediaAssetRow;
  readonly conflictingInput: StoredMediaInput;

  constructor(
    message: string,
    sha256: string,
    existingAsset: MediaAssetRow,
    conflictingInput: StoredMediaInput,
  ) {
    super(message);
    this.name = "MediaAssetConflictError";
    this.sha256 = sha256;
    this.existingAsset = existingAsset;
    this.conflictingInput = conflictingInput;
  }
}

export class DuplicateMediaRelationshipError extends Error {
  readonly parentId: string;
  readonly sha256: string;
  readonly position: number;

  constructor(
    message: string,
    parentId: string,
    sha256: string,
    position: number,
  ) {
    super(message);
    this.name = "DuplicateMediaRelationshipError";
    this.parentId = parentId;
    this.sha256 = sha256;
    this.position = position;
  }
}

export class PreparedMediaMismatchError extends Error {
  readonly sourceAdId: string;
  readonly cardPosition?: number;
  readonly mediaPosition?: number;

  constructor(
    message: string,
    context: {
      sourceAdId: string;
      cardPosition?: number;
      mediaPosition?: number;
    },
  ) {
    super(message);
    this.name = "PreparedMediaMismatchError";
    this.sourceAdId = context.sourceAdId;
    this.cardPosition = context.cardPosition;
    this.mediaPosition = context.mediaPosition;
  }
}
