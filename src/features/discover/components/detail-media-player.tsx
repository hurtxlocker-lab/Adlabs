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

interface DetailMediaPlayerProps {
  item: AdLibraryItem;
}

export function DetailMediaPlayer({ item }: DetailMediaPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const primary = getPrimaryMedia(item);
  const currentVideo: AdLibraryMediaItem | undefined = primary.video;
  const currentPreview: AdLibraryMediaItem | undefined = primary.preview;
  const currentDisplayMedia: AdLibraryMediaItem | undefined = primary.displayMedia ?? undefined;

  const isVideo = item.displayFormat === "VIDEO" || currentVideo !== undefined;

  const formattedFormat = formatDisplayFormat(
    item.displayFormat,
    item.variations ? item.variations.length : 0,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full bg-[#030406] border border-[#161820] flex items-center justify-center min-h-[420px] sm:min-h-[560px] max-h-[760px] overflow-hidden">
        {isVideo && currentVideo ? (
          <div className="absolute inset-0 w-full h-full flex items-center justify-center">
            {isPlaying ? (
              <video
                src={currentVideo.mediaUrl}
                poster={currentPreview?.mediaUrl}
                preload="none"
                controls
                autoPlay
                playsInline
                className="w-full h-full max-w-full max-h-full object-contain object-center"
              />
            ) : (
              <div className="relative w-full h-full flex items-center justify-center">
                {currentPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentPreview.mediaUrl}
                    alt={item.headline || item.brand.name}
                    className="dco-card-crossfade w-full h-full max-w-full max-h-full object-contain object-center"
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
                    aria-label={`Play video for ${item.headline || item.brand.name}`}
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
          <div className="absolute inset-0 w-full h-full flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentDisplayMedia.mediaUrl}
              alt={item.headline || item.brand.name}
              className="dco-card-crossfade w-full h-full max-w-full max-h-full object-contain object-center"
            />
          </div>
        ) : (
          <div className="w-full h-96 flex items-center justify-center text-[#686e7b] font-sans text-xs">
            Creative Media
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
