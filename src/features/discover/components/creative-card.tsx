"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  AdLibraryItem,
  AdLibraryMediaItem,
} from "../../ad-library/types";
import {
  formatDisplayFormat,
  formatFactualDate,
  getPrimaryMedia,
} from "../../ad-library/utils";
import type { DiscoverLayoutRole } from "../utils/cluster-rhythm";
import { PsyenceMosaic } from "./psyence-mosaic";
import { AmbientVideoPreview } from "./ambient-video-preview";

interface CreativeCardProps {
  item: AdLibraryItem;
  layoutRole?: DiscoverLayoutRole;
  clusterId?: string;
}

export function CreativeCard({
  item,
  layoutRole = "supporting",
  clusterId,
}: CreativeCardProps) {
  const variations = item.variations ?? [];
  const variationCount = variations.length;
  const hasMultipleVariations = variationCount > 1;
  const isDco = item.displayFormat === "DCO" || hasMultipleVariations;

  const [hoveredVariationIndex, setHoveredVariationIndex] = useState<number | null>(null);

  // Synchronized active variation state (scrub on hover/focus) or base item state
  const activeVariation =
    hasMultipleVariations && hoveredVariationIndex !== null && variations[hoveredVariationIndex]
      ? variations[hoveredVariationIndex]
      : hasMultipleVariations && variations.length > 0
        ? variations[0]
        : null;

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

  const formattedFormat = formatDisplayFormat(
    item.displayFormat,
    variationCount,
  );

  // Height configurations by presentation role (controlled growth for desktop research density)
  const mediaHeightClass = isLead
    ? "min-h-[420px] sm:min-h-[500px] lg:min-h-[540px] 2xl:min-h-[580px] max-h-[660px]"
    : isWide
      ? "min-h-[300px] sm:min-h-[360px] lg:min-h-[400px] max-h-[480px]"
      : isOffset
        ? "min-h-[320px] sm:min-h-[380px] lg:min-h-[420px] max-h-[500px]"
        : "min-h-[260px] sm:min-h-[300px] lg:min-h-[330px] max-h-[390px]";

  const headlineClass = isLead
    ? "text-2xl sm:text-3xl lg:text-[32px] max-w-2xl"
    : isWide || isOffset
      ? "text-xl sm:text-2xl max-w-xl"
      : "text-lg sm:text-xl max-w-lg";

  const copyClampClass = isLead
    ? "line-clamp-3 max-w-2xl text-sm sm:text-base leading-relaxed"
    : isWide
      ? "line-clamp-4 max-w-xl text-sm leading-relaxed"
      : isOffset
        ? "line-clamp-3 max-w-lg text-xs sm:text-sm leading-relaxed"
        : "line-clamp-2 max-w-lg text-xs sm:text-sm leading-relaxed";

  const displayedHeadline = isDco
    ? activeVariation?.headline ?? item.headline
    : item.headline;
  const displayedCopy = isDco
    ? activeVariation?.body ?? item.primaryText
    : item.primaryText;
  const displayedCta = isDco
    ? activeVariation?.ctaText ?? item.ctaText
    : item.ctaText;

  return (
    <article
      data-artifact
      className={`group flex flex-col ${
        isWide ? "lg:grid lg:grid-cols-12 lg:gap-8 xl:gap-12 2xl:gap-16 lg:items-center" : ""
      }`}
    >
      {/* 1. Primary Creative Object (Dominant Hero / Mounted Psyence Artifact) */}
      <div className={`relative w-full ${isWide ? "lg:col-span-7 2xl:col-span-8" : ""}`}>
        {/* Restrained DCO Plurality Cue (Stepped Card Backing) */}
        {hasMultipleVariations && (
          <div
            className="dco-stacked-edge absolute -top-1.5 -right-1.5 w-full h-full border border-[#1b1e2a] bg-[#050609] -z-10"
            aria-hidden="true"
          />
        )}

        <div
          className={`artifact-media-frame relative w-full bg-[#030406] border border-[#161820] flex items-center justify-center overflow-hidden ${mediaHeightClass}`}
        >
          {/* Psyence Dynamic Creative Mosaic (when variations > 1) */}
          {hasMultipleVariations ? (
            <PsyenceMosaic
              variations={variations}
              selectedIndex={hoveredVariationIndex ?? undefined}
              onHoverVariation={setHoveredVariationIndex}
              maxVisible={4}
            />
          ) : isVideo && currentVideo ? (
            /* Ambient Video Preview for Single Video Creatives */
            <AmbientVideoPreview
              id={item.id}
              clusterId={clusterId}
              originalVideoUrl={currentVideo.mediaUrl}
              previewLoopUrl={currentVideo.previewLoopUrl}
              posterUrl={currentPreview?.mediaUrl}
              title={displayedHeadline || item.brand.name}
              isLead={isLead}
            />
          ) : currentDisplayMedia ? (
            <div className="absolute inset-0 w-full h-full flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentDisplayMedia.mediaUrl}
                alt={displayedHeadline || item.brand.name}
                loading="lazy"
                className="dco-card-crossfade w-full h-full max-w-full max-h-full object-contain object-center"
              />
            </div>
          ) : (
            <div className="w-full h-64 flex items-center justify-center font-mono text-xs text-[#686e7b]">
              Creative Media
            </div>
          )}
        </div>
      </div>

      {/* 2. Marginal Evidence & Persuasion Deck */}
      <div
        className={`flex flex-col gap-3 pt-4 ${
          isWide
            ? "lg:col-span-5 2xl:col-span-4 lg:pt-0 lg:justify-center"
            : isLead
              ? "sm:pt-5"
              : "sm:pt-4"
        }`}
      >
        {/* Factual Marginalia Line (Role-calibrated evidence density) */}
        <div className="flex flex-wrap items-baseline justify-between gap-y-1 text-xs border-b border-[#14161f] pb-2">
          <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
            <span className="font-sans font-medium text-[#f3f4f6] tracking-tight text-sm sm:text-base">
              {item.brand.name}
            </span>
            <span className="text-[#3a3f4c] select-none">•</span>
            <span className="artifact-evidence font-mono text-xs tabular-nums">
              First seen {formatFactualDate(item.firstSeenAt)}
            </span>
            {/* Active observation fact displayed on Lead role */}
            {isLead && item.isActiveObserved === true && (
              <>
                <span className="text-[#3a3f4c] select-none">•</span>
                <span className="artifact-evidence font-mono text-xs">
                  Active when observed
                </span>
              </>
            )}
          </div>

          <span className="artifact-evidence font-mono text-xs uppercase">
            {formattedFormat}
          </span>
        </div>

        {/* Headline (Editorial Presence) */}
        {displayedHeadline && (
          <h3
            className={`font-editorial font-medium text-[#f3f4f6] leading-snug ${headlineClass} line-clamp-2`}
          >
            <Link
              href={`/ads/${item.id}`}
              className="hover:text-[#e07945] transition-colors"
            >
              {displayedHeadline}
            </Link>
          </h3>
        )}

        {/* Primary Copy Prose */}
        {displayedCopy && (
          <p
            className={`font-sans text-[#9da2ad] leading-[1.7] ${copyClampClass}`}
          >
            {displayedCopy}
          </p>
        )}

        {/* Action Link & Optional Synchronized Variation CTA */}
        <div className="pt-2 flex items-center justify-between">
          <Link
            href={`/ads/${item.id}`}
            className="artifact-examine-link font-sans text-xs sm:text-sm hover:text-[#e07945] font-medium transition-colors inline-flex items-center gap-1.5"
          >
            <span>Examine creative</span>
            <span aria-hidden="true">→</span>
          </Link>

          {displayedCta && (
            <span className="font-mono text-xs text-[#8e95a2] border border-[#1a1d25] bg-[#0c0e13] px-2 py-0.5">
              {displayedCta}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
