import type { adDiscoveryIndex } from "@/db/schema";

export type AdDiscoveryIndexRow = typeof adDiscoveryIndex.$inferSelect;
export type NewAdDiscoveryIndexRow = typeof adDiscoveryIndex.$inferInsert;

export interface ProjectedRepresentativeCreative {
  mediaType: "IMAGE" | "VIDEO" | null;
  mediaAssetId: string | null;
  mediaSha256: string | null;
  shapeFamily: "portrait" | "square" | "landscape" | "wide" | null;
  aspectRatio: number | null;
  videoDurationMs: number | null;
  headline: string | null;
  primaryText: string | null;
}

export interface RebuildDiscoveryIndexOptions {
  brandSlug?: string;
  adId?: string;
  chunkSize?: number;
  destructiveTruncate?: boolean;
}

export interface RebuildDiscoveryIndexResult {
  totalProjected: number;
  totalDeleted: number;
  durationMs: number;
}
