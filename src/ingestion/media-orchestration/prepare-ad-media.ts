import { downloadMedia as defaultDownloadMedia } from "@/ingestion/media";
import type { SourceAd, SourceMedia } from "@/ingestion/types";
import { storeDownloadedMedia as defaultStoreDownloadedMedia } from "@/storage";
import { MediaPreparationError } from "./errors";
import type {
  DownloadMediaFn,
  PrepareAdMediaOptions,
  PreparedAdMedia,
  PreparedCardMedia,
  PreparedMediaRef,
  StoreDownloadedMediaFn,
} from "./types";

const DEFAULT_CONCURRENCY = 3;

/**
 * Phase A Media Orchestration:
 *
 * Downloads, computes streaming SHA-256, and stores/reuses all direct and card
 * media for a normalized SourceAd in Cloudflare R2 object storage.
 *
 * Invariants:
 *  1. ZERO database access during Phase A.
 *  2. Sequential deterministic positions (0, 1, 2, ...) for direct media and card media.
 *  3. In-memory deduplication/memoization for identical (type, sourceUrl) within this operation.
 *  4. Bounded concurrency (default: 3).
 *  5. Guaranteed local temporary file cleanup in `finally`.
 *  6. Conservative all-or-nothing failure: if ANY media item fails, prepareAdMedia fails.
 *  7. External SHA-addressed R2 objects are NOT rolled back or deleted on subsequent failure.
 */
export async function prepareAdMedia(
  ad: SourceAd,
  options?: PrepareAdMediaOptions,
): Promise<PreparedAdMedia> {
  const downloadFn: DownloadMediaFn =
    options?.downloadMedia ?? defaultDownloadMedia;
  const storeFn: StoreDownloadedMediaFn =
    options?.storeDownloadedMedia ?? defaultStoreDownloadedMedia;
  const concurrency = Math.max(1, options?.concurrency ?? DEFAULT_CONCURRENCY);

  // 1. Collect all unique SourceMedia items across direct media and cards
  const uniqueItemsMap = new Map<string, SourceMedia>();

  for (const sm of ad.directMedia) {
    const key = `${sm.type}:${sm.sourceUrl}`;
    if (!uniqueItemsMap.has(key)) {
      uniqueItemsMap.set(key, sm);
    }
  }

  for (const card of ad.cards) {
    for (const sm of card.media) {
      const key = `${sm.type}:${sm.sourceUrl}`;
      if (!uniqueItemsMap.has(key)) {
        uniqueItemsMap.set(key, sm);
      }
    }
  }

  const uniqueItems = Array.from(uniqueItemsMap.values());
  const storedResults = new Map<string, Awaited<ReturnType<StoreDownloadedMediaFn>>>();

  // 2. Process unique items with bounded concurrency
  if (uniqueItems.length > 0) {
    let cursor = 0;
    let firstError: Error | null = null;

    const worker = async () => {
      while (cursor < uniqueItems.length) {
        if (firstError) return;
        const index = cursor++;
        const sm = uniqueItems[index];
        const cacheKey = `${sm.type}:${sm.sourceUrl}`;

        let downloaded: Awaited<ReturnType<DownloadMediaFn>> | null = null;
        try {
          downloaded = await downloadFn({
            sourceUrl: sm.sourceUrl,
            expectedType: sm.type,
          });

          const stored = await storeFn(downloaded);

          // Preserve the original normalized source locator URL
          storedResults.set(cacheKey, {
            ...stored,
            sourceUrl: sm.sourceUrl,
          });
        } catch (err) {
          if (!firstError) {
            firstError =
              err instanceof MediaPreparationError
                ? err
                : new MediaPreparationError(
                    "Failed to download or store media asset",
                    {
                      sourceUrl: sm.sourceUrl,
                      mediaType: sm.type,
                      role: sm.role ?? null,
                      originalError: err,
                    },
                  );
          }
          return;
        } finally {
          if (downloaded) {
            try {
              await downloaded.cleanup();
            } catch {
              // Ignore cleanup error on temp unlink to preserve main error if present
            }
          }
        }
      }
    };

    const workerCount = Math.min(concurrency, uniqueItems.length);
    await Promise.all(
      Array.from({ length: workerCount }, () => worker()),
    );

    if (firstError) {
      throw firstError;
    }
  }

  // 3. Assemble direct media with deterministic 0-indexed positions
  const directMedia: PreparedMediaRef[] = ad.directMedia.map((sm, position) => {
    const key = `${sm.type}:${sm.sourceUrl}`;
    const stored = storedResults.get(key);
    if (!stored) {
      throw new MediaPreparationError(
        "Missing stored media result for direct media",
        {
          sourceUrl: sm.sourceUrl,
          mediaType: sm.type,
          role: sm.role ?? null,
        },
      );
    }
    return {
      media: stored,
      position,
      role: sm.role ?? null,
    };
  });

  // 4. Assemble card media with deterministic 0-indexed positions per card
  const cardMedia: PreparedCardMedia[] = ad.cards.map((card) => {
    const cardRefs: PreparedMediaRef[] = card.media.map((sm, position) => {
      const key = `${sm.type}:${sm.sourceUrl}`;
      const stored = storedResults.get(key);
      if (!stored) {
        throw new MediaPreparationError(
          `Missing stored media result for card media at position ${card.position}`,
          {
            sourceUrl: sm.sourceUrl,
            mediaType: sm.type,
            role: sm.role ?? null,
          },
        );
      }
      return {
        media: stored,
        position,
        role: sm.role ?? null,
      };
    });

    return {
      cardPosition: card.position,
      media: cardRefs,
    };
  });

  return {
    directMedia,
    cardMedia,
  };
}
