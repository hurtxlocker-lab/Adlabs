"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  AdLibraryItem,
  AdLibraryMediaItem,
} from "../../ad-library/types";
import { getPrimaryMedia } from "../../ad-library/utils";
import type { DiscoverLayoutRole } from "../utils/cluster-rhythm";
import {
  resolveCreativeShape,
  getMediaShellSizeClass,
} from "../utils/creative-shape";
import { formatDateWatermark } from "../utils/date-watermark";
import { PsyenceMosaic } from "./psyence-mosaic";
import { AmbientVideoPreview } from "./ambient-video-preview";

interface CreativeCardProps {
  item: AdLibraryItem;
  layoutRole?: DiscoverLayoutRole;
  clusterId?: string;
  hook?: string | null;
}

export function CreativeCard({
  item,
  layoutRole = "supporting",
  clusterId,
  hook = null,
}: CreativeCardProps) {
  const variations = item.variations ?? [];
  const variationCount = variations.length;
  const hasMultipleVariations = variationCount > 1;

  const [hoveredVariationIndex, setHoveredVariationIndex] = useState<number | null>(null);

  // Single creative media assets for non-mosaic items
  let currentVideo: AdLibraryMediaItem | undefined;
  let currentPreview: AdLibraryMediaItem | undefined;
  let currentDisplayMedia: AdLibraryMediaItem | undefined;

  if (!hasMultipleVariations) {
    const primary = getPrimaryMedia(item);
    currentVideo = primary.video;
    currentPreview = primary.preview;
    currentDisplayMedia = primary.displayMedia ?? undefined;
  }

  const isVideo =
    !hasMultipleVariations &&
    (item.displayFormat === "VIDEO" || currentVideo !== undefined);

  const isLead = layoutRole === "lead";
  const isWide = layoutRole === "wide";
  const isOffset = layoutRole === "offset";

  // Creative shape family and silhouette sizing for single creative media
  const activeMedia = isVideo ? currentVideo : currentDisplayMedia;
  const shapeInfo = resolveCreativeShape(activeMedia?.width, activeMedia?.height);
  const mediaShellSizeClass = getMediaShellSizeClass(layoutRole, shapeInfo.shapeFamily);

  // Legacy fallback media height for Psyence DCO mosaic frame
  const psyenceMediaHeightClass = isLead
    ? "min-h-[420px] sm:min-h-[500px] lg:min-h-[540px] 2xl:min-h-[580px] max-h-[660px]"
    : isWide
      ? "min-h-[300px] sm:min-h-[360px] lg:min-h-[400px] max-h-[480px]"
      : isOffset
        ? "min-h-[320px] sm:min-h-[380px] lg:min-h-[420px] max-h-[500px]"
        : "min-h-[260px] sm:min-h-[300px] lg:min-h-[330px] max-h-[390px]";

  // Date watermark formatted from factual firstSeenAt date
  const dateWatermark = formatDateWatermark(item.firstSeenAt);

  return (
    <article
      data-artifact
      className="group flex flex-col w-full"
    >
      {/* 1. Field Slot & Artifact Stage (Composition territory containing exact media shell) */}
      <div className="relative w-full">
        {/* Restrained DCO Plurality Cue (Stepped Card Backing for Psyence) */}
        {hasMultipleVariations && (
          <div
            className="dco-stacked-edge absolute -top-1.5 -right-1.5 w-full h-full border border-[#1b1e2a] bg-[#050609] -z-10"
            aria-hidden="true"
          />
        )}

        {hasMultipleVariations ? (
          /* Psyence Dynamic Creative Mosaic Container (Preserves exact mosaic grammar) */
          <div className="relative w-full">
            <div
              className={`artifact-media-frame relative w-full bg-[#030406] border border-[#161820] flex items-center justify-center overflow-hidden ${psyenceMediaHeightClass}`}
            >
              <PsyenceMosaic
                variations={variations}
                selectedIndex={hoveredVariationIndex ?? undefined}
                onHoverVariation={setHoveredVariationIndex}
                maxVisible={4}
              />

              {/* Date Watermark (Quiet top-right archival annotation) */}
              {dateWatermark && (
                <div
                  className="absolute top-2.5 right-2.5 z-10 font-mono text-[11px] font-medium tracking-wide uppercase text-[#d1d5db] bg-[#07080a]/70 px-1.5 py-0.5 border border-[#ffffff12] rounded-[2px] select-none pointer-events-none"
                  aria-hidden="true"
                >
                  {dateWatermark}
                </div>
              )}
            </div>

            {/* Caption: Brand (Tightly attached beneath mosaic) */}
            <div className="flex flex-col gap-0.5 pt-2.5">
              <Link
                href={`/ads/${item.id}`}
                className="inline-flex items-center text-sm sm:text-base font-medium font-sans text-[#f3f4f6] hover:text-[#e07945] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#e07945] w-fit"
                aria-label={`Inspect ${item.brand.name} creative`}
              >
                <span>{item.brand.name}</span>
              </Link>

              {/* Optional genuine semantic hook */}
              {hook && hook.trim() !== "" && (
                <p className="text-xs text-[#9da2ad] font-sans leading-relaxed line-clamp-2">
                  {hook}
                </p>
              )}
            </div>
          </div>
        ) : (
          /* Artifact Stage: Creative-Responsive Silhouette Media Shell */
          <div className="flex flex-col items-start w-fit max-w-full">
            <div
              className={`artifact-media-shell relative bg-[#030406] border border-[#161820] overflow-hidden ${mediaShellSizeClass}`}
              style={{ aspectRatio: shapeInfo.aspectRatioCss }}
            >
              {isVideo && currentVideo ? (
                /* Ambient Video Preview for Single Video Creatives */
                <AmbientVideoPreview
                  id={item.id}
                  clusterId={clusterId}
                  originalVideoUrl={currentVideo.mediaUrl}
                  previewLoopUrl={currentVideo.previewLoopUrl}
                  posterUrl={currentPreview?.mediaUrl}
                  title={item.brand.name}
                  isLead={isLead}
                />
              ) : currentDisplayMedia ? (
                <div className="absolute inset-0 w-full h-full flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentDisplayMedia.mediaUrl}
                    alt={item.brand.name}
                    loading="lazy"
                    className="dco-card-crossfade w-full h-full max-w-full max-h-full object-contain object-center"
                  />
                </div>
              ) : (
                <div className="w-full h-full min-h-48 flex items-center justify-center font-mono text-xs text-[#686e7b]">
                  Creative Media
                </div>
              )}

              {/* Date Watermark (Quiet top-right archival annotation) */}
              {dateWatermark && (
                <div
                  className="absolute top-2.5 right-2.5 z-10 font-mono text-[11px] font-medium tracking-wide uppercase text-[#d1d5db] bg-[#07080a]/70 px-1.5 py-0.5 border border-[#ffffff12] rounded-[2px] select-none pointer-events-none"
                  aria-hidden="true"
                >
                  {dateWatermark}
                </div>
              )}
            </div>

            {/* Caption: Brand + Optional Hook (Tightly attached beneath MediaShell) */}
            <div className="flex flex-col gap-0.5 pt-2.5 w-full">
              <Link
                href={`/ads/${item.id}`}
                className="inline-flex items-center text-sm sm:text-base font-medium font-sans text-[#f3f4f6] hover:text-[#e07945] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#e07945] w-fit"
                aria-label={`Inspect ${item.brand.name} creative`}
              >
                <span>{item.brand.name}</span>
              </Link>

              {/* Optional genuine semantic hook */}
              {hook && hook.trim() !== "" && (
                <p className="text-xs text-[#9da2ad] font-sans leading-relaxed line-clamp-2">
                  {hook}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
