import {
  resolveCreativeShape,
  type CreativeShapeFamily,
} from "@/features/discover/utils/creative-shape";

export interface DomainMediaRef {
  id?: string | null;
  sha256?: string | null;
  mediaType: "IMAGE" | "VIDEO" | "UNKNOWN" | string;
  role?: string | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  position?: number | null;
  url?: string | null;
}

export interface DomainVariationRef {
  id?: string | null;
  position: number;
  headline?: string | null;
  body?: string | null;
  description?: string | null;
  ctaText?: string | null;
  destinationUrl?: string | null;
  media?: DomainMediaRef[];
}

export interface DomainCreativeSubject {
  id: string;
  headline?: string | null;
  primaryText?: string | null;
  description?: string | null;
  ctaText?: string | null;
  ctaType?: string | null;
  displayFormat?: string | null;
  variations?: DomainVariationRef[];
  directMedia?: DomainMediaRef[];
}

export interface ResolvedRepresentativeCreative {
  sourceAdId: string;
  representativeVariationId: string | null;
  isMultiVariation: boolean;
  isVideo: boolean;
  mediaType: "IMAGE" | "VIDEO" | null;
  mediaAssetId: string | null;
  mediaSha256: string | null;
  videoMedia?: DomainMediaRef;
  previewMedia?: DomainMediaRef;
  displayMedia?: DomainMediaRef;
  activeMedia?: DomainMediaRef;
  width: number | null;
  height: number | null;
  shapeFamily: CreativeShapeFamily;
  aspectRatio: number;
  aspectRatioCss: string;
  videoDurationMs: number | null;
  headline: string | null;
  body: string | null;
  description: string | null;
  ctaText: string | null;
  destinationUrl: string | null;
}

/**
 * Pure domain representative creative resolver.
 *
 * Single authoritative source of truth for selecting representative creative facts across
 * both Discover UI read models and backend database projections.
 *
 * Rules:
 *  1. Multi-variation / multi-card (variations.length > 0):
 *     - Inspect variation at position 0 (strictly first in source position order).
 *     - Video preferred over display image if video exists.
 *     - Active media = video ?? displayMedia.
 *     - Headline = variation[0].headline ?? subject.headline.
 *     - Body / primary text = variation[0].body ?? subject.primaryText.
 *  2. Standalone creative (variations.length === 0):
 *     - Inspect directMedia.
 *     - Video preferred over display image if video exists or displayFormat is VIDEO.
 *     - Active media = video ?? displayMedia.
 *     - Headline = subject.headline.
 *     - Body / primary text = subject.primaryText.
 *  3. Physical shape taxonomy & aspect ratio:
 *     - Evaluated via canonical `resolveCreativeShape(width, height)`.
 */
export function resolveDomainRepresentativeCreative(
  subject: DomainCreativeSubject,
): ResolvedRepresentativeCreative {
  const variations = subject.variations ?? [];
  const hasVariations = variations.length > 0;

  if (hasVariations) {
    const sorted = [...variations].sort((a, b) => a.position - b.position);
    const v0 = sorted[0];
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
      sourceAdId: subject.id,
      representativeVariationId: v0.id ?? null,
      isMultiVariation: variations.length > 1,
      isVideo,
      mediaType: activeMedia ? (activeMedia.mediaType === "VIDEO" || isVideo ? "VIDEO" : "IMAGE") : null,
      mediaAssetId: activeMedia?.id ?? null,
      mediaSha256: activeMedia?.sha256 ?? null,
      videoMedia: video,
      previewMedia: preview,
      displayMedia,
      activeMedia,
      width,
      height,
      shapeFamily: shape.shapeFamily,
      aspectRatio: shape.aspectRatio,
      aspectRatioCss: shape.aspectRatioCss,
      videoDurationMs: isVideo && activeMedia?.durationMs ? activeMedia.durationMs : null,
      headline: v0.headline ?? subject.headline ?? null,
      body: v0.body ?? subject.primaryText ?? null,
      description: v0.description ?? subject.description ?? null,
      ctaText: v0.ctaText ?? subject.ctaText ?? null,
      destinationUrl: v0.destinationUrl ?? null,
    };
  }

  // Standalone creative
  const directMedia = subject.directMedia ?? [];
  const video = directMedia.find(
    (m) => m.mediaType === "VIDEO" || m.role === "video",
  );
  const preview = directMedia.find((m) => m.role === "preview");
  const displayMedia =
    directMedia.find(
      (m) =>
        m.mediaType === "IMAGE" ||
        (m.role !== "preview" && m.role !== "video"),
    ) ?? directMedia[0];

  const isVideo =
    subject.displayFormat === "VIDEO" || Boolean(video);
  const activeMedia = isVideo ? (video ?? displayMedia) : displayMedia;
  const width =
    activeMedia?.width ??
    preview?.width ??
    displayMedia?.width ??
    null;
  const height =
    activeMedia?.height ??
    preview?.height ??
    displayMedia?.height ??
    null;
  const shape = resolveCreativeShape(width, height);

  return {
    sourceAdId: subject.id,
    representativeVariationId: null,
    isMultiVariation: false,
    isVideo,
    mediaType: activeMedia ? (activeMedia.mediaType === "VIDEO" || isVideo ? "VIDEO" : "IMAGE") : null,
    mediaAssetId: activeMedia?.id ?? null,
    mediaSha256: activeMedia?.sha256 ?? null,
    videoMedia: video,
    previewMedia: preview,
    displayMedia,
    activeMedia,
    width,
    height,
    shapeFamily: shape.shapeFamily,
    aspectRatio: shape.aspectRatio,
    aspectRatioCss: shape.aspectRatioCss,
    videoDurationMs: isVideo && activeMedia?.durationMs ? activeMedia.durationMs : null,
    headline: subject.headline ?? null,
    body: subject.primaryText ?? null,
    description: subject.description ?? null,
    ctaText: subject.ctaText ?? null,
    destinationUrl: null,
  };
}
