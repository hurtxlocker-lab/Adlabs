import type { S3Client } from "@aws-sdk/client-s3";
import type { DownloadedMedia, DownloadedMediaType } from "@/ingestion/media/types";
import type { StoredMediaInput } from "@/ingestion/persistence/types";

export type { DownloadedMedia, DownloadedMediaType, StoredMediaInput };

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicBaseUrl?: string | null;
}

export interface StoreDownloadedMediaOptions {
  /** Injectable S3 client for testing. */
  s3Client?: S3Client;
  /** Injectable bucket name for testing. */
  bucketName?: string;
}
