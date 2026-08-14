/**
 * Error classes for media downloading and URL validation.
 *
 * All error messages must contain safe/redacted URLs (query tokens and fragments stripped).
 */

export class MediaDownloaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaDownloaderError";
  }
}

export class UnsafeMediaUrlError extends MediaDownloaderError {
  public readonly url: string;
  public readonly reason: string;

  constructor(message: string, url: string, reason: string) {
    super(message);
    this.name = "UnsafeMediaUrlError";
    this.url = url;
    this.reason = reason;
  }
}

export class MediaDownloadHttpError extends MediaDownloaderError {
  public readonly url: string;
  public readonly statusCode: number;

  constructor(message: string, url: string, statusCode: number) {
    super(message);
    this.name = "MediaDownloadHttpError";
    this.url = url;
    this.statusCode = statusCode;
  }
}

export class MediaDownloadTimeoutError extends MediaDownloaderError {
  public readonly url: string;
  public readonly timeoutMs: number;

  constructor(message: string, url: string, timeoutMs: number) {
    super(message);
    this.name = "MediaDownloadTimeoutError";
    this.url = url;
    this.timeoutMs = timeoutMs;
  }
}

export class MediaTooLargeError extends MediaDownloaderError {
  public readonly url: string;
  public readonly maxBytes: bigint;
  public readonly actualBytes?: bigint;

  constructor(
    message: string,
    url: string,
    maxBytes: bigint,
    actualBytes?: bigint,
  ) {
    super(message);
    this.name = "MediaTooLargeError";
    this.url = url;
    this.maxBytes = maxBytes;
    this.actualBytes = actualBytes;
  }
}

export class InvalidMediaContentError extends MediaDownloaderError {
  public readonly url: string;
  public readonly mimeType: string | null;

  constructor(message: string, url: string, mimeType: string | null) {
    super(message);
    this.name = "InvalidMediaContentError";
    this.url = url;
    this.mimeType = mimeType;
  }
}

export class TooManyRedirectsError extends MediaDownloaderError {
  public readonly url: string;
  public readonly maxRedirects: number;

  constructor(message: string, url: string, maxRedirects: number) {
    super(message);
    this.name = "TooManyRedirectsError";
    this.url = url;
    this.maxRedirects = maxRedirects;
  }
}
