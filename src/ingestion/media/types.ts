export type SourceExpectedMediaType =
  | "image"
  | "video"
  | "video_preview"
  | "unknown";

export type DownloadedMediaType =
  | "IMAGE"
  | "VIDEO"
  | "VIDEO_PREVIEW"
  | "UNKNOWN";

export interface DownloadMediaInput {
  sourceUrl: string;
  expectedType?: SourceExpectedMediaType;
}

export interface DownloadedMedia {
  sourceUrl: string;
  finalUrl: string;
  sha256: string;
  byteSize: bigint;
  mimeType: string | null;
  mediaType: DownloadedMediaType;
  tempFilePath: string;
  cleanup: () => Promise<void>;
}

export type DnsLookupFn = (
  hostname: string,
) => Promise<Array<{ address: string; family: number }>>;

export type FetchFn = typeof fetch;

export interface DownloadMediaOptions {
  /** Custom DNS lookup function (for testing). */
  dnsLookup?: DnsLookupFn;
  /** Custom fetch implementation (for testing). */
  fetchImpl?: FetchFn;
  /** Overall download timeout in milliseconds. */
  timeoutMs?: number;
  /** Maximum media size in bytes. */
  maxBytes?: bigint;
  /** Maximum number of redirects. */
  maxRedirects?: number;
  /** Custom URL validator (for testing). */
  validateUrl?: (url: string) => Promise<void>;
}
