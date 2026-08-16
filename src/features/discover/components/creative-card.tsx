"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
import {
  getActiveDcoVariationState,
  getNextCardIndex,
  getPrevCardIndex,
} from "../utils/dco-traversal";
import {
  notifyDiscoverVideoPlay,
  subscribeDiscoverVideoPlay,
} from "../utils/video-coordinator";

interface CreativeCardProps {
  item: AdLibraryItem;
  layoutRole?: DiscoverLayoutRole;
}

export function CreativeCard({
  item,
  layoutRole = "supporting",
}: CreativeCardProps) {
  const variations = item.variations ?? [];
  const variationCount = variations.length;
  const hasMultipleVariations = variationCount > 1;
  const isDco = item.displayFormat === "DCO" || hasMultipleVariations;

  const [activeVariationIndex, setActiveVariationIndex] = useState(0);
  const [isTraversing, setIsTraversing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Synchronized DCO variation state or base item state
  const activeDcoState = isDco
    ? getActiveDcoVariationState(
        variations,
        activeVariationIndex,
        item.headline,
        item.primaryText,
        item.ctaText,
      )
    : null;

  // Active variation media or primary item media
  let currentVideo: AdLibraryMediaItem | undefined;
  let currentPreview: AdLibraryMediaItem | undefined;
  let currentDisplayMedia: AdLibraryMediaItem | undefined;

  if (isDco && activeDcoState?.variation) {
    const variation = activeDcoState.variation;
    const variationVideo = variation.media.find(
      (m: AdLibraryMediaItem) => m.mediaType === "VIDEO",
    );
    const variationPreview = variation.media.find(
      (m: AdLibraryMediaItem) => m.role === "preview",
    );
    const variationImage = variation.media.find(
      (m: AdLibraryMediaItem) => m.role !== "preview",
    );

    if (variationVideo) {
      currentVideo = variationVideo;
      currentPreview = variationPreview;
    } else {
      currentDisplayMedia = variationImage ?? variation.media[0];
    }
  } else {
    const primary = getPrimaryMedia(item);
    currentVideo = primary.video;
    currentPreview = primary.preview;
    currentDisplayMedia = primary.displayMedia ?? undefined;
  }

  const isVideo =
    (isDco && currentVideo !== undefined) ||
    (!isDco && (item.displayFormat === "VIDEO" || currentVideo !== undefined));

  const isLead = layoutRole === "lead";
  const isWide = layoutRole === "wide";
  const isOffset = layoutRole === "offset";

  const formattedFormat = formatDisplayFormat(
    item.displayFormat,
    variationCount,
  );

  // Discover single-video playback coordination
  useEffect(() => {
    if (!isPlaying) return;
    return subscribeDiscoverVideoPlay(item.id, () => {
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
    });
  }, [isPlaying, item.id]);

  const handlePlayVideo = () => {
    setIsPlaying(true);
    notifyDiscoverVideoPlay(item.id);
  };

  const handleNextVariation = () => {
    setIsPlaying(false);
    setActiveVariationIndex((prev) => getNextCardIndex(prev, variationCount));
  };

  const handlePrevVariation = () => {
    setIsPlaying(false);
    setActiveVariationIndex((prev) => getPrevCardIndex(prev, variationCount));
  };

  const handleActivateTraversal = () => {
    setIsTraversing(true);
  };

  // Height configurations by presentation role
  const mediaHeightClass = isLead
    ? "min-h-[420px] sm:min-h-[520px] max-h-[640px]"
    : isWide
      ? "min-h-[300px] sm:min-h-[360px] max-h-[460px]"
      : isOffset
        ? "min-h-[320px] sm:min-h-[380px] max-h-[480px]"
        : "min-h-[260px] sm:min-h-[320px] max-h-[390px]";

  const headlineClass = isLead
    ? "text-2xl sm:text-3xl"
    : isWide || isOffset
      ? "text-xl sm:text-2xl"
      : "text-lg sm:text-xl";

  const copyClampClass = isLead
    ? "line-clamp-3 max-w-2xl text-sm sm:text-base"
    : isWide
      ? "line-clamp-4 text-sm"
      : "line-clamp-2 text-xs sm:text-sm";

  const displayedHeadline = isDco
    ? activeDcoState?.headline ?? item.headline
    : item.headline;
  const displayedCopy = isDco
    ? activeDcoState?.body ?? item.primaryText
    : item.primaryText;
  const displayedCta = isDco
    ? activeDcoState?.ctaText ?? item.ctaText
    : item.ctaText;

  return (
    <article
      data-artifact
      className={`group flex flex-col ${
        isWide ? "lg:grid lg:grid-cols-12 lg:gap-8 lg:items-center" : ""
      }`}
    >
      {/* 1. Primary Creative Object (Dominant Hero / Mounted Artifact) */}
      <div className={`relative w-full ${isWide ? "lg:col-span-7" : ""}`}>
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
          {isVideo && currentVideo ? (
            <div className="relative w-full h-full flex items-center justify-center">
              {isPlaying ? (
                <video
                  ref={videoRef}
                  src={currentVideo.mediaUrl}
                  poster={currentPreview?.mediaUrl}
                  preload="none"
                  controls
                  autoPlay
                  playsInline
                  onPlay={() => notifyDiscoverVideoPlay(item.id)}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="relative w-full h-full flex items-center justify-center">
                  {currentPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={currentPreview.mediaUrl}
                      alt={displayedHeadline || item.brand.name}
                      loading="lazy"
                      className="dco-card-crossfade w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-64 flex items-center justify-center font-mono text-xs text-[#686e7b]">
                      Video Creative
                    </div>
                  )}

                  {/* Explicit Play Trigger */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                    <button
                      type="button"
                      aria-label={`Play video for ${displayedHeadline || item.brand.name}`}
                      onClick={handlePlayVideo}
                      className="w-11 h-11 rounded-full bg-[#07080a]/90 border border-[#20242e] hover:border-[#3a4154] focus-visible:border-[#d46b38] text-[#f3f4f6] hover:text-white flex items-center justify-center transition-colors"
                    >
                      <svg
                        className="w-4 h-4 text-current ml-0.5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : currentDisplayMedia ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentDisplayMedia.mediaUrl}
              alt={displayedHeadline || item.brand.name}
              loading="lazy"
              className="dco-card-crossfade w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-64 flex items-center justify-center font-mono text-xs text-[#686e7b]">
              Creative Media
            </div>
          )}

          {/* DCO Traversal Controls & Positional Indicator (only when multiple distinct variations exist) */}
          {hasMultipleVariations && (
            <div className="absolute bottom-3 right-3 z-10 flex items-center">
              {!isTraversing ? (
                <button
                  type="button"
                  aria-label={`Traverse ${variationCount} variations, current variation 1`}
                  onClick={handleActivateTraversal}
                  className="font-mono text-xs text-[#8e95a2] hover:text-[#f3f4f6] bg-[#07080a]/90 border border-[#20242e] hover:border-[#3a4154] px-2 py-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100 transition-opacity"
                >
                  1 / {variationCount}
                </button>
              ) : (
                <div className="flex items-center gap-1.5 bg-[#07080a]/95 border border-[#20242e] px-2 py-1">
                  <button
                    type="button"
                    aria-label="Previous variation"
                    onClick={handlePrevVariation}
                    className="text-xs font-mono text-[#8e95a2] hover:text-[#f3f4f6] px-1 transition-colors"
                  >
                    ←
                  </button>
                  <span className="text-xs font-mono text-[#f3f4f6] tabular-nums px-0.5">
                    {activeVariationIndex + 1} / {variationCount}
                  </span>
                  <button
                    type="button"
                    aria-label="Next variation"
                    onClick={handleNextVariation}
                    className="text-xs font-mono text-[#8e95a2] hover:text-[#f3f4f6] px-1 transition-colors"
                  >
                    →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2. Marginal Evidence & Persuasion Deck */}
      <div
        className={`flex flex-col gap-3 pt-4 ${
          isWide
            ? "lg:col-span-5 lg:pt-0 lg:justify-center"
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

        {/* Action Link & Optional Active Variation CTA */}
        <div className="pt-2 flex items-center justify-between">
          <Link
            href={`/ads/${item.id}`}
            className="artifact-examine-link font-sans text-xs sm:text-sm hover:text-[#e07945] font-medium transition-colors inline-flex items-center gap-1.5"
          >
            <span>Examine creative</span>
            <span aria-hidden="true">→</span>
          </Link>

          {isTraversing && displayedCta && (
            <span className="font-mono text-xs text-[#8e95a2] border border-[#1a1d25] bg-[#0c0e13] px-2 py-0.5">
              {displayedCta}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
