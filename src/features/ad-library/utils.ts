import type { AdLibraryItem, AdLibraryMediaItem } from "./types";

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
 * Formats display format tag with factual card count for DCO / multi-card ads.
 */
export function formatDisplayFormat(
  format: string | null,
  cardCount = 0,
): string {
  const baseFormat = format ? format.toUpperCase() : "VIDEO";

  if (baseFormat === "DCO" || cardCount > 1) {
    if (cardCount > 1) {
      return `DCO • ${cardCount} cards`;
    }
    if (cardCount === 1) {
      return `DCO • 1 card`;
    }
    return "DCO";
  }

  return baseFormat;
}

/**
 * Returns the primary visual assets for rendering an ad item in a stream or detail view.
 *
 * Distinguishes between playable video assets, preview poster images, and standalone images.
 * If direct media is empty, falls back to the first available card media.
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
      : item.cards.flatMap((c) => c.media);

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

  const cardMatch = item.cards.some(
    (c) =>
      (c.headline?.toLowerCase().includes(term) ?? false) ||
      (c.body?.toLowerCase().includes(term) ?? false),
  );

  return brandMatch || headlineMatch || primaryTextMatch || sourceIdMatch || cardMatch;
}
