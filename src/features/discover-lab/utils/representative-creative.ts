import type {
  AdLibraryItem,
  AdLibraryMediaItem,
} from "@/features/ad-library/types";
import { getPrimaryMedia } from "@/features/ad-library/utils";
import type { CreativeShapeFamily } from "@/features/discover/utils/creative-shape";
import {
  resolveDomainRepresentativeCreative,
  type DomainCreativeSubject,
} from "@/domain/creative/representative-creative";

export interface DiscoverRepresentativeCreative {
  sourceAdId: string;
  representativeVariationId: string | null;
  isMultiVariation: boolean;
  isVideo: boolean;
  video?: AdLibraryMediaItem;
  preview?: AdLibraryMediaItem;
  displayMedia?: AdLibraryMediaItem;
  activeMedia?: AdLibraryMediaItem;
  width: number | null;
  height: number | null;
  shapeFamily: CreativeShapeFamily;
  aspectRatio: number;
  aspectRatioCss: string;
  headline: string | null;
  body: string | null;
  description: string | null;
  ctaText: string | null;
  destinationUrl: string | null;
}

/**
 * Resolves exactly one representative creative for an AdLibraryItem in Discover Lab.
 *
 * Delegates to the pure domain `resolveDomainRepresentativeCreative` to ensure 100% doctrine parity
 * between UI read models and database projections.
 */
export function resolveDiscoverRepresentativeCreative(
  item: AdLibraryItem,
): DiscoverRepresentativeCreative {
  const variations = item.variations ?? [];
  const hasVariations = variations.length > 0;

  let subject: DomainCreativeSubject;

  if (hasVariations) {
    subject = {
      id: item.id,
      headline: item.headline,
      primaryText: item.primaryText,
      description: item.description,
      ctaText: item.ctaText,
      displayFormat: item.displayFormat,
      variations: variations.map((v) => ({
        id: v.id,
        position: v.position,
        headline: v.headline,
        body: v.body,
        description: v.description,
        ctaText: v.ctaText,
        destinationUrl: v.destinationUrl,
        media: v.media?.map((m) => ({
          id: m.id,
          mediaType: m.mediaType,
          role: m.role,
          width: m.width ?? null,
          height: m.height ?? null,
          url: m.mediaUrl,
        })),
      })),
    };
  } else {
    const primary = getPrimaryMedia(item);
    const directMediaList: Array<{
      id?: string;
      mediaType: string;
      role: string | null;
      width: number | null;
      height: number | null;
      url: string;
    }> = [];

    if (primary.video) {
      directMediaList.push({
        id: primary.video.id,
        mediaType: "VIDEO",
        role: "video",
        width: primary.video.width ?? null,
        height: primary.video.height ?? null,
        url: primary.video.mediaUrl,
      });
    }
    if (primary.displayMedia && primary.displayMedia !== primary.video) {
      directMediaList.push({
        id: primary.displayMedia.id,
        mediaType: primary.displayMedia.mediaType,
        role: primary.displayMedia.role,
        width: primary.displayMedia.width ?? null,
        height: primary.displayMedia.height ?? null,
        url: primary.displayMedia.mediaUrl,
      });
    }
    if (primary.preview) {
      directMediaList.push({
        id: primary.preview.id,
        mediaType: primary.preview.mediaType,
        role: "preview",
        width: primary.preview.width ?? null,
        height: primary.preview.height ?? null,
        url: primary.preview.mediaUrl,
      });
    }

    subject = {
      id: item.id,
      headline: item.headline,
      primaryText: item.primaryText,
      description: item.description,
      ctaText: item.ctaText,
      displayFormat: item.displayFormat,
      directMedia: directMediaList,
    };
  }

  const resolved = resolveDomainRepresentativeCreative(subject);

  // Map domain result to DiscoverRepresentativeCreative interface
  let videoItem: AdLibraryMediaItem | undefined;
  let previewItem: AdLibraryMediaItem | undefined;
  let displayItem: AdLibraryMediaItem | undefined;
  let activeItem: AdLibraryMediaItem | undefined;

  if (hasVariations) {
    const v0 = variations[0];
    const vMedia = v0.media ?? [];
    videoItem = vMedia.find((m) => m.mediaType === "VIDEO" || m.role === "video");
    previewItem = vMedia.find((m) => m.role === "preview");
    displayItem =
      vMedia.find(
        (m) =>
          m.mediaType === "IMAGE" ||
          (m.role !== "preview" && m.role !== "video"),
      ) ?? vMedia[0];
    activeItem = resolved.isVideo ? videoItem : displayItem;
  } else {
    const primary = getPrimaryMedia(item);
    videoItem = primary.video ?? undefined;
    previewItem = primary.preview ?? undefined;
    displayItem = primary.displayMedia ?? undefined;
    activeItem = (resolved.isVideo ? primary.video : primary.displayMedia) ?? undefined;
  }

  return {
    sourceAdId: resolved.sourceAdId,
    representativeVariationId: resolved.representativeVariationId,
    isMultiVariation: resolved.isMultiVariation,
    isVideo: resolved.isVideo,
    video: videoItem,
    preview: previewItem,
    displayMedia: displayItem,
    activeMedia: activeItem,
    width: resolved.width,
    height: resolved.height,
    shapeFamily: resolved.shapeFamily,
    aspectRatio: resolved.aspectRatio,
    aspectRatioCss: resolved.aspectRatioCss,
    headline: resolved.headline,
    body: resolved.body,
    description: resolved.description,
    ctaText: resolved.ctaText,
    destinationUrl: hasVariations ? (variations[0]?.destinationUrl ?? item.destinationUrl) : item.destinationUrl,
  };
}
