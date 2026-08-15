"use client";

import Link from "next/link";
import { useState } from "react";
import type { AdLibraryItem } from "../../ad-library/types";
import { formatFactualDate, getPrimaryMedia } from "../../ad-library/utils";

interface CreativeCardProps {
  item: AdLibraryItem;
  layoutRole?: "lead" | "supporting-tall" | "supporting-compact";
}

export function CreativeCard({
  item,
  layoutRole = "supporting-tall",
}: CreativeCardProps) {
  const { video, preview, displayMedia } = getPrimaryMedia(item);
  const [isPlaying, setIsPlaying] = useState(false);

  const isVideo = item.displayFormat === "VIDEO" || video !== undefined;
  const isLead = layoutRole === "lead";
  const isCompact = layoutRole === "supporting-compact";

  return (
    <article className="group flex flex-col bg-[#0d0f15] border border-[#1a1d24] hover:border-zinc-700 transition-colors duration-200 overflow-hidden">
      {/* 1. Media Viewport: Pure Creative Artifact */}
      <div
        className={`relative w-full bg-[#050608] flex items-center justify-center overflow-hidden ${
          isLead
            ? "min-h-[360px] sm:min-h-[460px] max-h-[580px]"
            : isCompact
              ? "min-h-[220px] sm:min-h-[260px] max-h-[320px]"
              : "min-h-[280px] sm:min-h-[340px] max-h-[420px]"
        }`}
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
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-64 flex items-center justify-center bg-zinc-950 text-zinc-600 font-sans text-xs">
                    Video Creative
                  </div>
                )}

                {/* Subtle Play Overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/15 group-hover/player:bg-black/5 transition-colors">
                  <div className="w-11 h-11 rounded-full bg-black/75 border border-white/20 flex items-center justify-center shadow-lg group-hover/player:scale-105 transition-transform">
                    <svg
                      className="w-4 h-4 text-white ml-0.5"
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
          <div className="w-full h-64 flex items-center justify-center bg-zinc-950 text-zinc-600 font-sans text-xs">
            Creative Media
          </div>
        )}
      </div>

      {/* 2. Typographic Annotations (Integrated Artifact Anatomy, Not a Boxed Footer) */}
      <div className={`flex flex-col gap-2 ${isLead ? "p-5 sm:p-6" : "p-4 sm:p-5"}`}>
        {/* Attribution & Observation Line */}
        <div className="flex items-center justify-between text-xs font-sans">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-amber-400">
              {item.brand.name}
            </span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-400 text-[11px]">
              {formatFactualDate(item.firstSeenAt)}
            </span>
            {item.isActiveObserved === true && (
              <>
                <span className="text-zinc-600">•</span>
                <span className="text-zinc-400 text-[11px]">Active</span>
              </>
            )}
          </div>

          <span className="text-zinc-500 text-[11px]">
            {item.displayFormat || "Video"}
          </span>
        </div>

        {/* Headline */}
        {item.headline && (
          <h3
            className={`font-sans font-medium text-zinc-100 leading-snug ${
              isLead ? "text-base sm:text-lg" : "text-sm sm:text-base"
            } line-clamp-2`}
          >
            <Link
              href={`/ads/${item.id}`}
              className="hover:text-amber-300 transition-colors"
            >
              {item.headline}
            </Link>
          </h3>
        )}

        {/* Copy Snippet */}
        {item.primaryText && (
          <p
            className={`font-sans text-zinc-400 leading-relaxed ${
              isLead
                ? "text-sm line-clamp-3"
                : isCompact
                  ? "text-xs line-clamp-1"
                  : "text-xs line-clamp-2"
            }`}
          >
            {item.primaryText}
          </p>
        )}

        {/* Action Link: Quiet Navigation */}
        <div className="pt-2 flex items-center justify-between text-xs font-sans">
          <Link
            href={`/ads/${item.id}`}
            className="text-zinc-400 hover:text-amber-300 font-medium transition-colors inline-flex items-center gap-1"
          >
            Examine creative
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
