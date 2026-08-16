import type {
  AdLibraryCardItem,
  AdLibraryCreativeVariation,
  AdLibraryItem,
  AdLibraryMediaItem,
} from "./types";

/**
 * Regular expression matching raw Meta template placeholder variables (e.g. {{product.name}}, {{product.brand}}).
 */
const META_TEMPLATE_REGEX = /\{\{\s*[\w.-]+\s*\}\}/;

/**
 * Detects whether a string contains unresolved Meta template syntax (e.g. {{product.name}}).
 */
export function isTemplateExpression(
  value: string | null | undefined,
): boolean {
  if (!value) return false;
  return META_TEMPLATE_REGEX.test(value);
}

/**
 * Returns clean display text, or null if the string is empty or contains unresolved template expressions.
 */
export function sanitizeDisplayCopy(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (isTemplateExpression(trimmed)) return null;
  return trimmed;
}

/**
 * Normalizes string copy for conservative exact-equality comparison.
 * Trims whitespace and treats null/empty as null.
 */
function normalizeCopyValue(val: string | null | undefined): string | null {
  if (val == null) return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Deterministically resolves distinct product-facing creative variations from ordered source cards.
 *
 * Rules:
 *  1. Preserves source card ordering by position.
 *  2. Derives exact display signature:
 *     - Primary visual media asset ID (SHA-based)
 *     - Normalized headline / title
 *     - Normalized body
 *     - Normalized description
 *     - Normalized CTA text
 *     - CTA type
 *     - Normalized destination URL
 *  3. Exact duplicates collapse into the first occurrence representative.
 *  4. Provenance is preserved in variation.sourceCardIds.
 *  5. Distinct media bytes / SHAs NEVER collapse together.
 */
export function resolveCreativeVariations(
  cards: AdLibraryCardItem[],
): AdLibraryCreativeVariation[] {
  if (!cards || cards.length === 0) return [];

  const variations: AdLibraryCreativeVariation[] = [];
  const signatureMap = new Map<string, AdLibraryCreativeVariation>();

  // Ensure deterministic processing ordered by persisted position
  const sortedCards = [...cards].sort((a, b) => a.position - b.position);

  for (const card of sortedCards) {
    const primaryMedia =
      card.media.find((m) => m.role !== "preview") ?? card.media[0];
    const primaryMediaKey = primaryMedia?.id ?? "none";

    const normalizedHeadline = normalizeCopyValue(card.headline);
    const normalizedBody = normalizeCopyValue(card.body);
    const normalizedDescription = normalizeCopyValue(card.description);
    const normalizedCtaText = normalizeCopyValue(card.ctaText);
    const ctaType = card.ctaType ?? null;
    const normalizedDestinationUrl = normalizeCopyValue(card.destinationUrl);

    const signature = JSON.stringify([
      primaryMediaKey,
      normalizedHeadline,
      normalizedBody,
      normalizedDescription,
      normalizedCtaText,
      ctaType,
      normalizedDestinationUrl,
    ]);

    const existing = signatureMap.get(signature);
    if (existing) {
      existing.sourceCardIds.push(card.id);
    } else {
      const variation: AdLibraryCreativeVariation = {
        id: card.id,
        sourceCardIds: [card.id],
        position: variations.length + 1,
        headline: card.headline,
        body: card.body,
        description: card.description,
        ctaText: card.ctaText,
        ctaType: card.ctaType,
        destinationUrl: card.destinationUrl,
        media: card.media,
      };
      variations.push(variation);
      signatureMap.set(signature, variation);
    }
  }

  return variations;
}

/**
 * Formats display format tag with factual variation count for DCO / multi-variation ads.
 */
export function formatDisplayFormat(
  format: string | null,
  variationCount = 0,
): string {
  const baseFormat = format ? format.toUpperCase() : "VIDEO";

  if (baseFormat === "DCO" || variationCount > 1) {
    if (variationCount > 1) {
      return `DCO • ${variationCount} variations`;
    }
    return "DCO";
  }

  return baseFormat;
}

/**
 * Returns the primary visual assets for rendering an ad item in a stream or detail view.
 *
 * Distinguishes between playable video assets, preview poster images, and standalone images.
 * If direct media is empty, falls back to the first available variation/card media.
 */
export function getPrimaryMedia(item: AdLibraryItem): {
  video?: AdLibraryMediaItem;
  preview?: AdLibraryMediaItem;
  image?: AdLibraryMediaItem;
  displayMedia: AdLibraryMediaItem | null;
} {
  const allMedia =
    item.media.length > 0
      ? item.media
      : item.variations && item.variations.length > 0
        ? item.variations.flatMap((v) => v.media)
        : item.sourceCards && item.sourceCards.length > 0
          ? item.sourceCards.flatMap((c) => c.media)
          : item.cards && item.cards.length > 0
            ? item.cards.flatMap((c) => c.media)
            : [];

  const video = allMedia.find((m) => m.mediaType === "VIDEO");
  const preview = allMedia.find(
    (m) => m.mediaType === "IMAGE" && m.role === "preview",
  );
  const image =
    allMedia.find((m) => m.mediaType === "IMAGE" && m.role !== "preview") ??
    preview;

  const displayMedia = video ?? image ?? (allMedia.length > 0 ? allMedia[0] : null);

  return {
    video,
    preview,
    image,
    displayMedia,
  };
}

/**
 * Formats a factual date into an ISO/clean human string (e.g. "Aug 15, 2026").
 */
export function formatFactualDate(date: Date | string | number): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Factual search predicate for in-memory / unit-test filtering.
 */
export function matchesFactualSearch(
  item: AdLibraryItem,
  searchTerm: string,
): boolean {
  if (!searchTerm || searchTerm.trim() === "") return true;
  const term = searchTerm.trim().toLowerCase();

  const brandMatch = item.brand.name.toLowerCase().includes(term);
  const headlineMatch = item.headline?.toLowerCase().includes(term) ?? false;
  const primaryTextMatch =
    item.primaryText?.toLowerCase().includes(term) ?? false;
  const sourceIdMatch = item.sourceAdId.toLowerCase().includes(term);

  return brandMatch || headlineMatch || primaryTextMatch || sourceIdMatch;
}
