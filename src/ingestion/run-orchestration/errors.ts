export class IngestionRunFatalError extends Error {
  readonly ingestionRunId?: string;
  readonly originalError?: unknown;

  constructor(
    message: string,
    context?: {
      ingestionRunId?: string;
      originalError?: unknown;
    },
  ) {
    super(message);
    this.name = "IngestionRunFatalError";
    this.ingestionRunId = context?.ingestionRunId;
    this.originalError = context?.originalError;
  }
}

export class ItemAdvertiserMismatchError extends Error {
  readonly itemSourcePageId: string;
  readonly expectedSourcePageId: string;
  readonly sourceAdId?: string;

  constructor(
    itemSourcePageId: string,
    expectedSourcePageId: string,
    sourceAdId?: string,
  ) {
    super(
      `Item advertiser page ID "${itemSourcePageId}" does not match target source account page ID "${expectedSourcePageId}"${
        sourceAdId ? ` for ad "${sourceAdId}"` : ""
      }.`,
    );
    this.name = "ItemAdvertiserMismatchError";
    this.itemSourcePageId = itemSourcePageId;
    this.expectedSourcePageId = expectedSourcePageId;
    this.sourceAdId = sourceAdId;
  }
}
