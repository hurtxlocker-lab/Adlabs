import type { AdLibraryItem, AdLibraryMediaItem } from "./types";

/**
 * Returns the primary visual assets for rendering an ad item in a stream or detail view.
 *
 * Distinguishes between playable video assets, preview poster images, and standalone images.
 */
export function getPrimaryMedia(item: AdLibraryItem): {
  video?: AdLibraryMediaItem;
  preview?: AdLibraryMediaItem;
  image?: AdLibraryMediaItem;
  displayMedia: AdLibraryMediaItem | null;
} {
  const video = item.media.find((m) => m.mediaType === "VIDEO");
  const preview = item.media.find((m) => m.mediaType === "IMAGE" && m.role === "preview");
  const image = item.media.find((m) => m.mediaType === "IMAGE" && m.role !== "preview") ?? preview;

  const displayMedia = video ?? image ?? (item.media.length > 0 ? item.media[0] : null);

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
  const primaryTextMatch = item.primaryText?.toLowerCase().includes(term) ?? false;
  const sourceIdMatch = item.sourceAdId.toLowerCase().includes(term);

  return brandMatch || headlineMatch || primaryTextMatch || sourceIdMatch;
}
