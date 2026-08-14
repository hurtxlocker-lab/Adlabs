import type {
  DownloadMediaInput,
  DownloadMediaOptions,
  DownloadedMedia,
} from "@/ingestion/media";
import type {
  DbOrTx,
  PersistPreparedObservedAdInput,
  PersistPreparedObservedAdResult,
  PreparedAdMedia,
  PreparedCardMedia,
  PreparedMediaRef,
  StoredMediaInput,
} from "@/ingestion/persistence";
import type { SourceAd } from "@/ingestion/types";
import type { StoreDownloadedMediaOptions } from "@/storage";

export type { PreparedMediaRef, PreparedCardMedia, PreparedAdMedia };

export type DownloadMediaFn = (
  input: DownloadMediaInput,
  options?: DownloadMediaOptions,
) => Promise<DownloadedMedia>;

export type StoreDownloadedMediaFn = (
  downloaded: DownloadedMedia,
  options?: StoreDownloadedMediaOptions,
) => Promise<StoredMediaInput>;

export interface PrepareAdMediaDependencies {
  downloadMedia?: DownloadMediaFn;
  storeDownloadedMedia?: StoreDownloadedMediaFn;
  concurrency?: number;
}

export type PrepareAdMediaOptions = PrepareAdMediaDependencies;

export interface PersistPreparedAdMediaInput {
  adId: string;
  prepared: PreparedAdMedia;
}

export interface PersistPreparedAdMediaResult {
  adId: string;
  directMediaCount: number;
  cardMediaCount: number;
  deletedDirectMediaCount: number;
  deletedCardMediaCount: number;
}

export type PrepareAdMediaFn = (
  ad: SourceAd,
  options?: PrepareAdMediaOptions,
) => Promise<PreparedAdMedia>;

export type PersistPreparedObservedAdFn = (
  input: PersistPreparedObservedAdInput,
  executor?: DbOrTx,
) => Promise<PersistPreparedObservedAdResult>;

export interface IngestNormalizedAdInput {
  ingestionRunId: string;
  sourceAccountId: string;
  sourceAd: SourceAd;
  rawPayload: unknown;
  rawPayloadHash?: string;
  snapshotHash?: string | null;
  observationMetadata?: Record<string, unknown>;
}

export interface IngestNormalizedAdDependencies {
  prepareAdMedia?: PrepareAdMediaFn;
  persistPreparedObservedAd?: PersistPreparedObservedAdFn;
  prepareOptions?: PrepareAdMediaOptions;
  db?: DbOrTx;
}

export interface IngestNormalizedAdResult {
  adId: string;
  adOutcome: "created" | "updated";
  rawItemId: string;
  observationId: string;
  cardsCount: number;
  directMediaCount: number;
  cardMediaCount: number;
  deletedDirectMediaCount: number;
  deletedCardMediaCount: number;
}
