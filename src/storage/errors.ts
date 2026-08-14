/**
 * Error classes for Cloudflare R2 object storage operations.
 *
 * Errors must never expose secret keys, credentials, or full signed tokens.
 */

export class ObjectStorageError extends Error {
  public readonly storageKey?: string;
  public readonly bucketName?: string;

  constructor(message: string, storageKey?: string, bucketName?: string) {
    super(message);
    this.name = "ObjectStorageError";
    this.storageKey = storageKey;
    this.bucketName = bucketName;
  }
}

export class StoredObjectConflictError extends ObjectStorageError {
  public readonly sha256: string;
  public readonly expectedByteSize: bigint;
  public readonly actualByteSize?: bigint;
  public readonly existingSha256?: string;

  constructor(
    message: string,
    storageKey: string,
    bucketName: string,
    sha256: string,
    expectedByteSize: bigint,
    actualByteSize?: bigint,
    existingSha256?: string,
  ) {
    super(message, storageKey, bucketName);
    this.name = "StoredObjectConflictError";
    this.sha256 = sha256;
    this.expectedByteSize = expectedByteSize;
    this.actualByteSize = actualByteSize;
    this.existingSha256 = existingSha256;
  }
}

export class DownloadedMediaFileMissingError extends ObjectStorageError {
  public readonly tempFilePath: string;

  constructor(message: string, tempFilePath: string, storageKey?: string) {
    super(message, storageKey);
    this.name = "DownloadedMediaFileMissingError";
    this.tempFilePath = tempFilePath;
  }
}

export class MissingR2ConfigError extends ObjectStorageError {
  public readonly missingVar: string;

  constructor(missingVar: string) {
    super(
      `Missing required Cloudflare R2 environment variable: "${missingVar}". Check your environment configuration.`,
    );
    this.name = "MissingR2ConfigError";
    this.missingVar = missingVar;
  }
}
