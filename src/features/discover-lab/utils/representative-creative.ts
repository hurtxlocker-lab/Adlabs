import type {
  AdLibraryCreativeVariation,
  AdLibraryItem,
  AdLibraryMediaItem,
} from "@/features/ad-library/types";
import { getPrimaryMedia } from "@/features/ad-library/utils";
import {
  resolveCreativeShape,
  type CreativeShapeFamily,
} from "@/features/discover/utils/creative-shape";

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
 * Rules:
 * 1. If variations.length === 0: uses standalone primary creative.
 * 2. If variations.length >= 1: uses variations[0] (strictly first resolved variation in source order).
 * 3. Never ranks, randomizes, or selects by aspect ratio/performance.
 * 4. Determines physical shape from the exact representative media.
 */
export function resolveDiscoverRepresentativeCreative(
  item: AdLibraryItem,
): DiscoverRepresentativeCreative {
  const variations = item.variations ?? [];
  const hasVariations = variations.length > 0;

  if (hasVariations) {
    const v0: AdLibraryCreativeVariation = variations[0];
    const vMedia = v0.media ?? [];
    const video = vMedia.find(
      (m) => m.mediaType === "VIDEO" || m.role === "video",
    );
    const preview = vMedia.find((m) => m.role === "preview");
    const displayMedia =
      vMedia.find(
        (m) =>
          m.mediaType === "IMAGE" ||
          (m.role !== "preview" && m.role !== "video"),
      ) ?? vMedia[0];

    const isVideo = Boolean(video);
    const activeMedia = isVideo ? video : displayMedia;
    const width = activeMedia?.width ?? preview?.width ?? null;
    const height = activeMedia?.height ?? preview?.height ?? null;
    const shape = resolveCreativeShape(width, height);

    return {
      sourceAdId: item.id,
      representativeVariationId: v0.id,
      isMultiVariation: variations.length > 1,
      isVideo,
      video,
      preview,
      displayMedia,
      activeMedia,
      width,
      height,
      shapeFamily: shape.shapeFamily,
      aspectRatio: shape.aspectRatio,
      aspectRatioCss: shape.aspectRatioCss,
      headline: v0.headline ?? item.headline,
      body: v0.body ?? item.primaryText,
      description: v0.description ?? item.description,
      ctaText: v0.ctaText ?? item.ctaText,
      destinationUrl: v0.destinationUrl ?? item.destinationUrl,
    };
  }

  // Standalone creative without variations array
  const primary = getPrimaryMedia(item);
  const isVideo =
    item.displayFormat === "VIDEO" || primary.video !== undefined;
  const activeMedia = isVideo ? primary.video : primary.displayMedia;
  const width =
    activeMedia?.width ??
    primary.preview?.width ??
    primary.displayMedia?.width ??
    null;
  const height =
    activeMedia?.height ??
    primary.preview?.height ??
    primary.displayMedia?.height ??
    null;
  const shape = resolveCreativeShape(width, height);

  return {
    sourceAdId: item.id,
    representativeVariationId: null,
    isMultiVariation: false,
    isVideo,
    video: primary.video ?? undefined,
    preview: primary.preview ?? undefined,
    displayMedia: primary.displayMedia ?? undefined,
    activeMedia: activeMedia ?? undefined,
    width,
    height,
    shapeFamily: shape.shapeFamily,
    aspectRatio: shape.aspectRatio,
    aspectRatioCss: shape.aspectRatioCss,
    headline: item.headline,
    body: item.primaryText,
    description: item.description,
    ctaText: item.ctaText,
    destinationUrl: item.destinationUrl,
  };
}
