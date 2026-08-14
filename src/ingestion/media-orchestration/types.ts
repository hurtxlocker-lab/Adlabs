import type {
  DownloadMediaInput,
  DownloadMediaOptions,
  DownloadedMedia,
} from "@/ingestion/media";
import type { StoredMediaInput } from "@/ingestion/persistence";
import type { StoreDownloadedMediaOptions } from "@/storage";

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
