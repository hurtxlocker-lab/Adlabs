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
  previewLoopUrl?: string | null;
  width?: number | null;
  height?: number | null;
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

export interface SiblingDeploymentFact {
  id: string;
  sourceAdId: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  hasEuEvidence: boolean;
  hasUkEvidence: boolean;
}

export interface AdInspectDossierFacts {
  startDate: Date | null;
  runningDays: number | null;
  exactCreativeReuseCount: number | null;

  // Account
  pageCategory: string | null;
  instagramUsername: string | null;
  instagramFollowers: bigint | null;
  instagramVerified: boolean | null;
  facebookLikes: bigint | null;
  facebookVerified: boolean | null;
  aboutText: string | null;

  // Regional Transparency (EU)
  hasEuTransparencyEvidence: boolean;
  latestEuTotalReach: bigint | null;
  latestEuTransparencyObservedAt: Date | null;
  latestEuTargetAgeMin: number | null;
  latestEuTargetAgeMax: number | null;
  latestEuTargetGender: string | null;
  euReachedCountries?: string[];
  euTargetCountries?: string[];

  // Regional Transparency (UK)
  hasUkTransparencyEvidence: boolean;
  latestUkTotalReach: bigint | null;
  latestUkTransparencyObservedAt: Date | null;
  latestUkTargetAgeMin: number | null;
  latestUkTargetAgeMax: number | null;
  latestUkTargetGender: string | null;
  ukReachedCountries?: string[];
  ukTargetCountries?: string[];

  // Geography
  targetCountries: string[];
  reachedCountries: string[];

  // Public Media Specs
  videoDurationMs: number | null;
  aspectRatio: number | null;
  width: number | null;
  height: number | null;

  // Sibling deployments (same brand_id + representative_media_sha256)
  siblingDeployments: SiblingDeploymentFact[];
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
  dossier?: AdInspectDossierFacts;
}

export interface AdLibraryQueryParams {
  search?: string;
  format?: string;
  brand?: string;
  active?: string;
}
