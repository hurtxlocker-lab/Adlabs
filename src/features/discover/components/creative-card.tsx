"use client";

import Link from "next/link";
import { useState } from "react";
import type { AdLibraryItem } from "../../ad-library/types";
import {
  formatDisplayFormat,
  formatFactualDate,
  getPrimaryMedia,
} from "../../ad-library/utils";
import type { DiscoverLayoutRole } from "../utils/cluster-rhythm";

interface CreativeCardProps {
  item: AdLibraryItem;
  layoutRole?: DiscoverLayoutRole;
}

export function CreativeCard({
  item,
  layoutRole = "supporting",
}: CreativeCardProps) {
  const { video, preview, displayMedia } = getPrimaryMedia(item);
  const [isPlaying, setIsPlaying] = useState(false);

  const isVideo = item.displayFormat === "VIDEO" || video !== undefined;
  const isLead = layoutRole === "lead";
  const isWide = layoutRole === "wide";
  const isOffset = layoutRole === "offset";
  const isDco = item.displayFormat === "DCO" || item.cards.length > 1;

  const formattedFormat = formatDisplayFormat(
    item.displayFormat,
    item.cards.length,
  );

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

  return (
    <article
      className={`group flex flex-col transition-all duration-200 ${
        isWide ? "lg:grid lg:grid-cols-12 lg:gap-8 lg:items-center" : ""
      }`}
    >
      {/* 1. Primary Creative Object (Dominant Hero / Mounted Artifact) */}
      <div
        className={`relative w-full ${isWide ? "lg:col-span-7" : ""}`}
      >
        {/* Restrained DCO Plurality Cue (Stepped Card Backing) */}
        {isDco && (
          <div
            className="absolute -top-1.5 -right-1.5 w-full h-full border border-[#1b1e2a] bg-[#050609] -z-10"
            aria-hidden="true"
          />
        )}

        <div
          className={`relative w-full bg-[#030406] border border-[#161820] flex items-center justify-center overflow-hidden ${mediaHeightClass}`}
        >
          {isVideo && video ? (
            <div className="relative w-full h-full flex items-center justify-center">
              {isPlaying ? (
                <video
                  src={video.mediaUrl}
                  poster={preview?.mediaUrl}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
              ) : (
                <div
                  className="relative w-full h-full flex items-center justify-center cursor-pointer group/player"
                  onClick={() => setIsPlaying(true)}
                >
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preview.mediaUrl}
                      alt={item.headline || item.brand.name}
                      loading="lazy"
                      className="w-full h-full object-contain transition-transform duration-300 group-hover/player:scale-[1.01]"
                    />
                  ) : (
                    <div className="w-full h-64 flex items-center justify-center font-mono text-xs text-[#686e7b]">
                      Video Creative
                    </div>
                  )}

                  {/* Play Trigger */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover/player:bg-black/0 transition-colors">
                    <div className="w-12 h-12 rounded-full bg-[#07080a]/90 border border-white/20 flex items-center justify-center shadow-lg group-hover/player:scale-105 group-hover/player:border-[#d46b38] transition-all">
                      <svg
                        className="w-4 h-4 text-[#f3f4f6] ml-0.5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : displayMedia ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayMedia.mediaUrl}
              alt={item.headline || item.brand.name}
              loading="lazy"
              className="w-full h-full object-contain"
            />
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
            <span className="font-mono text-xs text-[#8e95a2] tabular-nums">
              First seen {formatFactualDate(item.firstSeenAt)}
            </span>
            {/* Active observation fact displayed on Lead role for reduced evidence density across stream */}
            {isLead && item.isActiveObserved === true && (
              <>
                <span className="text-[#3a3f4c] select-none">•</span>
                <span className="font-mono text-xs text-[#8e95a2]">
                  Active when observed
                </span>
              </>
            )}
          </div>

          <span className="font-mono text-xs text-[#8e95a2] uppercase">
            {formattedFormat}
          </span>
        </div>

        {/* Headline (Editorial Presence) */}
        {item.headline && (
          <h3
            className={`font-editorial font-medium text-[#f3f4f6] leading-snug ${headlineClass} line-clamp-2`}
          >
            <Link
              href={`/ads/${item.id}`}
              className="hover:text-[#e07945] transition-colors"
            >
              {item.headline}
            </Link>
          </h3>
        )}

        {/* Primary Copy Prose */}
        {item.primaryText && (
          <p
            className={`font-sans text-[#9da2ad] leading-[1.7] ${copyClampClass}`}
          >
            {item.primaryText}
          </p>
        )}

        {/* Action Link */}
        <div className="pt-2 flex items-center justify-between">
          <Link
            href={`/ads/${item.id}`}
            className="font-sans text-xs sm:text-sm text-[#f3f4f6] hover:text-[#e07945] font-medium transition-colors inline-flex items-center gap-1.5 group/link"
          >
            <span>Examine creative</span>
            <span
              className="group-hover/link:translate-x-0.5 transition-transform"
              aria-hidden="true"
            >
              →
            </span>
          </Link>
        </div>
      </div>
    </article>
  );
}
