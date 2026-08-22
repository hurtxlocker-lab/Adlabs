import { redactUrl } from "@/ingestion/media/url-safety";

export class MediaPreparationError extends Error {
  readonly sourceUrl: string;
  readonly mediaType: string;
  readonly role: string | null;
  readonly originalError: unknown;

  constructor(
    message: string,
    context: {
      sourceUrl: string;
      mediaType: string;
      role?: string | null;
      originalError?: unknown;
    },
  ) {
    const redacted = redactUrl(context.sourceUrl);
    super(
      `${message} (URL: "${redacted}", type: "${context.mediaType}", role: "${context.role ?? "null"}")`,
    );
    this.name = "MediaPreparationError";
    this.sourceUrl = context.sourceUrl;
    this.mediaType = context.mediaType;
    this.role = context.role ?? null;
    this.originalError = context.originalError;
  }
}

export class PreparedCardNotFoundError extends Error {
  readonly adId: string;
  readonly cardPosition: number;

  constructor(adId: string, cardPosition: number) {
    super(
      `Cannot persist prepared card media: Card at position ${cardPosition} does not exist in database for ad "${adId}".`,
    );
    this.name = "PreparedCardNotFoundError";
    this.adId = adId;
    this.cardPosition = cardPosition;
  }
}

export class AdNotFoundError extends Error {
  readonly adId: string;

  constructor(adId: string) {
    super(`Ad with ID "${adId}" was not found in the database.`);
    this.name = "AdNotFoundError";
    this.adId = adId;
  }
}

export class MissingRepresentativeMediaError extends Error {
  readonly sourceAdId: string;

  constructor(sourceAdId: string, message?: string) {
    super(
      message ??
        `Cannot promote ad "${sourceAdId}": no valid representative media could be prepared or established.`,
    );
    this.name = "MissingRepresentativeMediaError";
    this.sourceAdId = sourceAdId;
  }
}
