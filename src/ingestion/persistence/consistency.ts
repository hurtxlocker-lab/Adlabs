import { redactUrl } from "@/ingestion/media/url-safety";
import type { SourceAd } from "@/ingestion/types";
import {
  PreparedMediaMismatchError,
  type PreparedAdMedia,
} from "./types";

/**
 * Validates structural and content consistency between a normalized SourceAd
 * and the PreparedAdMedia artifact before database transaction execution.
 *
 * Checks:
 *  1. Direct media array lengths match.
 *  2. Direct media positions match 0-indexed sequential order (0, 1, ...).
 *  3. Direct media source URLs and roles match exactly.
 *  4. Card media array lengths match SourceAd.cards length.
 *  5. Card positions match SourceAd.cards positions.
 *  6. Per-card media array lengths, positions, source URLs, and roles match exactly.
 *
 * Any mismatch throws PreparedMediaMismatchError with redacted URLs.
 */
export function validateSourceAndPreparedMediaConsistency(
  ad: SourceAd,
  prepared: PreparedAdMedia,
): void {
  // 1. Direct media validation
  if (prepared.directMedia.length !== ad.directMedia.length) {
    throw new PreparedMediaMismatchError(
      `Prepared direct media count (${prepared.directMedia.length}) does not match source direct media count (${ad.directMedia.length}) for ad "${ad.sourceAdId}".`,
      { sourceAdId: ad.sourceAdId },
    );
  }

  for (let i = 0; i < ad.directMedia.length; i++) {
    const src = ad.directMedia[i];
    const prep = prepared.directMedia[i];

    if (prep.position !== i) {
      throw new PreparedMediaMismatchError(
        `Prepared direct media at index ${i} has position ${prep.position} (expected ${i}) for ad "${ad.sourceAdId}".`,
        { sourceAdId: ad.sourceAdId, mediaPosition: i },
      );
    }

    if (prep.media.sourceUrl !== src.sourceUrl) {
      const srcRedacted = redactUrl(src.sourceUrl);
      const prepRedacted = redactUrl(prep.media.sourceUrl ?? "");
      throw new PreparedMediaMismatchError(
        `Prepared direct media at position ${i} has sourceUrl "${prepRedacted}" (expected "${srcRedacted}") for ad "${ad.sourceAdId}".`,
        { sourceAdId: ad.sourceAdId, mediaPosition: i },
      );
    }

    const expectedRole = src.role ?? null;
    if (prep.role !== expectedRole) {
      throw new PreparedMediaMismatchError(
        `Prepared direct media at position ${i} has role "${prep.role}" (expected "${expectedRole}") for ad "${ad.sourceAdId}".`,
        { sourceAdId: ad.sourceAdId, mediaPosition: i },
      );
    }
  }

  // 2. Card media validation
  if (prepared.cardMedia.length !== ad.cards.length) {
    throw new PreparedMediaMismatchError(
      `Prepared card media count (${prepared.cardMedia.length}) does not match source card count (${ad.cards.length}) for ad "${ad.sourceAdId}".`,
      { sourceAdId: ad.sourceAdId },
    );
  }

  for (let c = 0; c < ad.cards.length; c++) {
    const srcCard = ad.cards[c];
    const prepCard = prepared.cardMedia[c];

    if (prepCard.cardPosition !== srcCard.position) {
      throw new PreparedMediaMismatchError(
        `Prepared card media at index ${c} has cardPosition ${prepCard.cardPosition} (expected ${srcCard.position}) for ad "${ad.sourceAdId}".`,
        { sourceAdId: ad.sourceAdId, cardPosition: prepCard.cardPosition },
      );
    }

    if (prepCard.media.length !== srcCard.media.length) {
      throw new PreparedMediaMismatchError(
        `Prepared card at position ${srcCard.position} media count (${prepCard.media.length}) does not match source card media count (${srcCard.media.length}) for ad "${ad.sourceAdId}".`,
        { sourceAdId: ad.sourceAdId, cardPosition: srcCard.position },
      );
    }

    for (let m = 0; m < srcCard.media.length; m++) {
      const srcM = srcCard.media[m];
      const prepM = prepCard.media[m];

      if (prepM.position !== m) {
        throw new PreparedMediaMismatchError(
          `Prepared card at position ${srcCard.position} media at index ${m} has position ${prepM.position} (expected ${m}) for ad "${ad.sourceAdId}".`,
          { sourceAdId: ad.sourceAdId, cardPosition: srcCard.position, mediaPosition: m },
        );
      }

      if (prepM.media.sourceUrl !== srcM.sourceUrl) {
        const srcRedacted = redactUrl(srcM.sourceUrl);
        const prepRedacted = redactUrl(prepM.media.sourceUrl ?? "");
        throw new PreparedMediaMismatchError(
          `Prepared card at position ${srcCard.position} media at position ${m} has sourceUrl "${prepRedacted}" (expected "${srcRedacted}") for ad "${ad.sourceAdId}".`,
          { sourceAdId: ad.sourceAdId, cardPosition: srcCard.position, mediaPosition: m },
        );
      }

      const expectedCardRole = srcM.role ?? null;
      if (prepM.role !== expectedCardRole) {
        throw new PreparedMediaMismatchError(
          `Prepared card at position ${srcCard.position} media at position ${m} has role "${prepM.role}" (expected "${expectedCardRole}") for ad "${ad.sourceAdId}".`,
          { sourceAdId: ad.sourceAdId, cardPosition: srcCard.position, mediaPosition: m },
        );
      }
    }
  }
}
