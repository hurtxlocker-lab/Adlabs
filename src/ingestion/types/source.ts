/**
 * Canonical, provider-independent source types for AdLabs M0.
 *
 * All upstream provider payloads (e.g. Curious Coder Meta scraper) are parsed
 * and transformed into these canonical shapes before normalization or persistence.
 *
 * Core semantic rules:
 *  1. sourceAdId is the external archive identity (e.g. ad_archive_id from Meta).
 *  2. Advertiser (tracked brand account) is kept distinct from publisher and brandedContent.
 *  3. sourceCollationId is stored strictly as reported metadata (not interpreted as concept/campaign).
 *  4. sourceReportedEndAt is the provider-reported end date (not a proven inactivity date).
 *  5. There is NO Creative abstraction at this ingestion stage.
 */

export type SourceName = "meta";

export type SourceMediaType = "image" | "video" | "video_preview" | "unknown";

export interface SourceMedia {
  type: SourceMediaType;
  sourceUrl: string;
  role?: string | null;
}

export interface SourceAdCard {
  position: number;
  body?: string | null;
  title?: string | null;
  description?: string | null;
  ctaText?: string | null;
  ctaType?: string | null;
  destinationUrl?: string | null;
  media: SourceMedia[];
  raw: unknown;
}

export type TransparencyRegion = "EU" | "UK" | "BR";

export interface SourceAdTransparencyObservation {
  region: TransparencyRegion;
  totalReach?: bigint | number | null;
  targetAgeMin?: number | null;
  targetAgeMax?: number | null;
  targetGender?: string | null;
  targetCountries: string[];
  reachedCountries: string[];
  reachBreakdown?: unknown;
  providerPayload?: Record<string, unknown> | null;
}

export interface SourceAccountObservationData {
  pageCategory?: string | null;
  facebookLikes?: bigint | number | null;
  instagramUsername?: string | null;
  instagramFollowers?: bigint | number | null;
  facebookVerified?: boolean | null;
  instagramVerified?: boolean | null;
  pageIsDeleted?: boolean | null;
  pageIsRestricted?: boolean | null;
  aboutText?: string | null;
  profileImageUrl?: string | null;
  coverImageUrl?: string | null;
  providerMetadata?: Record<string, unknown> | null;
}

export interface SourceAd {
  source: SourceName;
  sourceAdId: string;

  sourceCollationId?: string | null;
  sourceCollationCount?: number | null;

  advertiser: {
    sourcePageId: string;
    name?: string | null;
    url?: string | null;
  };

  accountObservation?: SourceAccountObservationData | null;
  transparencyObservations?: SourceAdTransparencyObservation[];

  publisher?: {
    sourcePageId?: string | null;
    name?: string | null;
    url?: string | null;
  } | null;

  brandedContent?: {
    sourcePageId?: string | null;
    name?: string | null;
    url?: string | null;
  } | null;

  displayFormat?: string | null;

  primaryText?: string | null;
  headline?: string | null;
  description?: string | null;

  ctaText?: string | null;
  ctaType?: string | null;
  destinationUrl?: string | null;

  publisherPlatforms: string[];

  platformStartAt?: Date | null;
  sourceReportedEndAt?: Date | null;

  active?: boolean | null;

  adLibraryUrl?: string | null;

  cards: SourceAdCard[];
  directMedia: SourceMedia[];

  raw: unknown;
}
