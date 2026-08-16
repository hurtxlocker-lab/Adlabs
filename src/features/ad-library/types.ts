/**
 * Product-facing read types for AdLabs Ad Library (Discover & Detail surfaces).
 *
 * Encapsulates normalized domain facts. Excludes internal infrastructure/storage
 * implementation mechanics (R2 tokens, S3 paths, raw payloads, SHA hashes, byte sizes, DB joins).
 */

export interface AdLibraryMediaItem {
  id: string;
  mediaType: "IMAGE" | "VIDEO" | "UNKNOWN";
  role: string | null;
  position: number;
  mimeType: string | null;
  mediaUrl: string;
}

export interface AdLibraryCardItem {
  id: string;
  position: number;
  headline: string | null;
  body: string | null;
  description: string | null;
  ctaText: string | null;
  ctaType: string | null;
  destinationUrl: string | null;
  media: AdLibraryMediaItem[];
}

export interface AdLibraryCreativeVariation {
  id: string;
  sourceCardIds: string[];
  position: number;
  headline: string | null;
  body: string | null;
  description: string | null;
  ctaText: string | null;
  ctaType: string | null;
  destinationUrl: string | null;
  media: AdLibraryMediaItem[];
}

export interface AdLibraryItem {
  id: string;
  source: string;
  sourceAdId: string;
  brand: {
    id: string;
    name: string;
    slug: string;
  };
  displayFormat: string | null;
  primaryText: string | null;
  headline: string | null;
  description: string | null;
  ctaText: string | null;
  ctaType: string | null;
  destinationUrl: string | null;
  publisherPlatforms: string[];
  isActiveObserved: boolean | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  adLibraryUrl: string | null;
  media: AdLibraryMediaItem[];
  sourceCards: AdLibraryCardItem[];
  variations: AdLibraryCreativeVariation[];
  /**
   * @deprecated Use variations for UI presentation or sourceCards for provenance
   */
  cards: AdLibraryCardItem[];
}

export interface AdLibraryQueryParams {
  search?: string;
  format?: string;
  brand?: string;
  active?: string;
}
