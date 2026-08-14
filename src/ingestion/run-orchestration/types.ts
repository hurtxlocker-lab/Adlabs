import type {
  DbOrTx,
  EnsureBrandInput,
  EnsureSourceAccountInput,
  FinishIngestionRunInput,
  IngestionRunRow,
  StartIngestionRunInput,
} from "@/ingestion/persistence";
import type { CuriousCoderItem } from "@/ingestion/sources/meta/curious-coder";
import type { SourceAd } from "@/ingestion/types";
import type {
  IngestNormalizedAdInput,
  IngestNormalizedAdResult,
} from "@/ingestion/media-orchestration";

export type IngestionFailureStage =
  | "parse"
  | "normalize"
  | "prepare_media"
  | "persist"
  | "ingest"
  | "run";

export interface IngestionItemFailure {
  itemIndex: number;
  sourceAdId?: string;
  stage: IngestionFailureStage;
  errorCode?: string;
  message: string;
}

export type IngestionRunStatus = "SUCCEEDED" | "PARTIAL" | "FAILED";

export interface IngestionRunResult {
  ingestionRunId: string;
  status: IngestionRunStatus;
  sourceAccountId: string;
  brandId: string;
  sourceItemsCount: number;
  succeededItemsCount: number;
  failedItemsCount: number;
  createdAdsCount: number;
  updatedAdsCount: number;
  failures: IngestionItemFailure[];
}

export interface RunCuriousCoderBrandInput {
  name: string;
  slug: string;
  websiteUrl?: string | null;
  category?: string | null;
}

export interface RunCuriousCoderSourceAccountInput {
  sourcePageId: string;
  sourcePageUrl?: string | null;
  displayName?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RunCuriousCoderIngestionInput {
  brand: RunCuriousCoderBrandInput;
  sourceAccount: RunCuriousCoderSourceAccountInput;
  providerItems: unknown[];
  sourceRunId?: string;
  sourceMetadata?: Record<string, unknown>;
  ingestionRunMetadata?: Record<string, unknown>;
}

export type EnsureBrandFn = (
  input: EnsureBrandInput,
  executor?: DbOrTx,
) => Promise<{ id: string }>;

export type EnsureSourceAccountFn = (
  input: EnsureSourceAccountInput,
  executor?: DbOrTx,
) => Promise<{
  id: string;
  brandId: string;
  source: string;
  sourcePageId: string;
}>;

export type StartIngestionRunFn = (
  input: StartIngestionRunInput,
  executor?: DbOrTx,
) => Promise<IngestionRunRow>;

export type FinishIngestionRunFn = (
  input: FinishIngestionRunInput,
  executor?: DbOrTx,
) => Promise<IngestionRunRow>;

export type ParseCuriousCoderItemFn = (
  raw: unknown,
) =>
  | { success: true; data: CuriousCoderItem; raw: unknown }
  | { success: false; error: Error; raw: unknown };

export type NormalizeCuriousCoderAdFn = (
  item: CuriousCoderItem,
  rawPayload?: unknown,
) => SourceAd;

export type IngestNormalizedAdFn = (
  input: IngestNormalizedAdInput,
  dependencies?: unknown,
) => Promise<IngestNormalizedAdResult>;

export interface RunCuriousCoderDependencies {
  ensureBrand?: EnsureBrandFn;
  ensureSourceAccount?: EnsureSourceAccountFn;
  startIngestionRun?: StartIngestionRunFn;
  finishIngestionRun?: FinishIngestionRunFn;
  parseItem?: ParseCuriousCoderItemFn;
  normalizeAd?: NormalizeCuriousCoderAdFn;
  ingestNormalizedAd?: IngestNormalizedAdFn;
  db?: DbOrTx;
}
