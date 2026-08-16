"use client";

import { useState } from "react";
import type {
  AdLibraryItem,
  AdLibraryMediaItem,
} from "@/features/ad-library/types";
import {
  formatDisplayFormat,
  formatFactualDate,
  getPrimaryMedia,
} from "@/features/ad-library/utils";
import {
  getActiveDcoVariationState,
  getNextCardIndex,
  getPrevCardIndex,
} from "../utils/dco-traversal";

interface DetailMediaPlayerProps {
  item: AdLibraryItem;
}

export function DetailMediaPlayer({ item }: DetailMediaPlayerProps) {
  const variations = item.variations ?? [];
  const variationCount = variations.length;
  const hasMultipleVariations = variationCount > 1;
  const isDco = item.displayFormat === "DCO" || hasMultipleVariations;

  const [activeVariationIndex, setActiveVariationIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const activeDcoState = isDco
    ? getActiveDcoVariationState(
        variations,
        activeVariationIndex,
        item.headline,
        item.primaryText,
        item.ctaText,
      )
    : null;

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

  const formattedFormat = formatDisplayFormat(
    item.displayFormat,
    variationCount,
  );

  const handleNextVariation = () => {
    setIsPlaying(false);
    setActiveVariationIndex((prev) => getNextCardIndex(prev, variationCount));
  };

  const handlePrevVariation = () => {
    setIsPlaying(false);
    setActiveVariationIndex((prev) => getPrevCardIndex(prev, variationCount));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full bg-[#030406] border border-[#161820] flex items-center justify-center min-h-[420px] sm:min-h-[560px] max-h-[760px] overflow-hidden">
        {isVideo && currentVideo ? (
          <div className="relative w-full h-full flex items-center justify-center">
            {isPlaying ? (
              <video
                src={currentVideo.mediaUrl}
                poster={currentPreview?.mediaUrl}
                preload="none"
                controls
                autoPlay
                playsInline
                className="w-full h-full max-h-[760px] object-contain"
              />
            ) : (
              <div className="relative w-full h-full flex items-center justify-center">
                {currentPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentPreview.mediaUrl}
                    alt={activeDcoState?.headline || item.headline || item.brand.name}
                    className="dco-card-crossfade w-full h-full max-h-[760px] object-contain"
                  />
                ) : (
                  <div className="w-full h-96 flex items-center justify-center text-[#686e7b] font-sans text-xs">
                    Video Creative
                  </div>
                )}

                {/* Explicit Play Trigger */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                  <button
                    type="button"
                    aria-label={`Play video for ${activeDcoState?.headline || item.headline || item.brand.name}`}
                    onClick={() => setIsPlaying(true)}
                    className="w-12 h-12 rounded-full bg-[#07080a]/90 border border-[#20242e] hover:border-[#3a4154] focus-visible:border-[#d46b38] text-[#f3f4f6] hover:text-white flex items-center justify-center transition-colors"
                  >
                    <svg
                      className="w-5 h-5 text-current ml-0.5"
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
            alt={activeDcoState?.headline || item.headline || item.brand.name}
            className="dco-card-crossfade w-full h-full max-h-[760px] object-contain"
          />
        ) : (
          <div className="w-full h-96 flex items-center justify-center text-[#686e7b] font-sans text-xs">
            Creative Media
          </div>
        )}

        {/* DCO Traversal Controls on Detail Hero (only when multiple distinct variations exist) */}
        {hasMultipleVariations && (
          <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2 bg-[#07080a]/95 border border-[#20242e] px-2.5 py-1.5">
            <button
              type="button"
              aria-label="Previous variation"
              onClick={handlePrevVariation}
              className="text-xs font-mono text-[#8e95a2] hover:text-[#f3f4f6] px-1 transition-colors"
            >
              ←
            </button>
            <span className="text-xs font-mono text-[#f3f4f6] tabular-nums px-1">
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

      <div className="font-mono text-xs text-[#8e95a2] flex items-center justify-between pt-1">
        <span>{formattedFormat}</span>
        <span className="tabular-nums">
          Observed {formatFactualDate(item.firstSeenAt)}
        </span>
      </div>
    </div>
  );
}
