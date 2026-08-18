import {
  resolveDomainRepresentativeCreative,
  type DomainCreativeSubject,
} from "@/domain/creative/representative-creative";
import type { ProjectedRepresentativeCreative } from "./types";

export interface MediaAssetEntity {
  id: string;
  sha256: string | null;
  mediaType: "IMAGE" | "VIDEO" | "UNKNOWN";
  width: number | null;
  height: number | null;
  durationMs: number | null;
  role?: string | null;
  position?: number | null;
}

export interface CardEntity {
  id: string;
  position: number;
  headline: string | null;
  body: string | null;
  description: string | null;
  ctaText: string | null;
  media: MediaAssetEntity[];
}

export interface CanonicalAdEntity {
  id: string;
  headline: string | null;
  primaryText: string | null;
  description: string | null;
  ctaText: string | null;
  ctaType: string | null;
  displayFormat: string;
}

/**
 * Resolves representative creative facts for discovery projection.
 *
 * Delegates strictly to pure domain `resolveDomainRepresentativeCreative` to maintain absolute parity
 * with Discover surfaces.
 */
export function resolveRepresentativeCreativeFacts(
  ad: CanonicalAdEntity,
  cards: CardEntity[],
  directMedia: MediaAssetEntity[],
): ProjectedRepresentativeCreative {
  const subject: DomainCreativeSubject = {
    id: ad.id,
    headline: ad.headline,
    primaryText: ad.primaryText,
    description: ad.description,
    ctaText: ad.ctaText,
    ctaType: ad.ctaType,
    displayFormat: ad.displayFormat,
    variations:
      cards.length > 0
        ? cards.map((c) => ({
            id: c.id,
            position: c.position,
            headline: c.headline,
            body: c.body,
            description: c.description,
            ctaText: c.ctaText,
            media: c.media.map((m) => ({
              id: m.id,
              sha256: m.sha256,
              mediaType: m.mediaType,
              width: m.width,
              height: m.height,
              durationMs: m.durationMs,
              role: m.role,
              position: m.position,
            })),
          }))
        : undefined,
    directMedia:
      cards.length === 0
        ? directMedia.map((m) => ({
            id: m.id,
            sha256: m.sha256,
            mediaType: m.mediaType,
            width: m.width,
            height: m.height,
            durationMs: m.durationMs,
            role: m.role,
            position: m.position,
          }))
        : undefined,
  };

  const resolved = resolveDomainRepresentativeCreative(subject);

  return {
    mediaType: resolved.mediaType,
    mediaAssetId: resolved.mediaAssetId,
    mediaSha256: resolved.mediaSha256,
    shapeFamily: resolved.shapeFamily,
    aspectRatio: resolved.aspectRatio,
    videoDurationMs: resolved.videoDurationMs,
    headline: resolved.headline,
    primaryText: resolved.body,
  };
}
