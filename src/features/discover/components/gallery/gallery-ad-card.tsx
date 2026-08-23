"use client";

import Link from "next/link";
import type { AdLibraryItem } from "@/features/ad-library/types";
import { AmbientVideoPreview } from "@/features/discover/components/ambient-video-preview";
import { resolveDiscoverRepresentativeCreative } from "@/features/discover/utils/representative-creative";
import { formatVideoDuration, formatCreativeReuse } from "@/features/discover/utils/formatters";
import { EvidenceOverlay } from "./evidence-overlay";
import type { DiscoveryGalleryFacts } from "@/features/discover/queries/gallery-facts";

export interface GalleryAdCardProps {
  item: AdLibraryItem;
  facts?: DiscoveryGalleryFacts;
  clusterId?: string;
}

/**
 * GalleryAdCard — Minimal, creative-first card for the Canonical Discover Gallery.
 *
 * Design Doctrine:
 * - Natural creative aspect ratio defines the card silhouette.
 * - No oversized shells, no letterboxing/pillaring, no crop.
 * - Persistent chrome is strictly limited to brand name and factual annotations.
 * - Zero vanity KPIs, zero dates, zero CTA labels in gallery view.
 * - Primary click navigates to `/ads/[canonical-ad-id]`.
 */
export function GalleryAdCard({ item, facts, clusterId }: GalleryAdCardProps) {
  const rep = resolveDiscoverRepresentativeCreative(item);

  const durationText = formatVideoDuration(facts?.videoDurationMs);
  const reuseInfo = formatCreativeReuse(facts?.exactCreativeReuseCount);

  return (
    <article
      data-artifact
      data-testid="gallery-ad-card"
      className="group relative flex flex-col w-full select-none transition-[transform,filter,box-shadow,border-color] duration-180 ease-out motion-safe:hover:scale-[1.04] motion-safe:hover:-translate-y-0.5 hover:brightness-[1.03] hover:z-20 focus-within:z-20"
    >
      {/* 1. Creative Silhouette Container */}
      <div className="relative w-full overflow-hidden bg-[#030406] border border-[#161820] rounded-[5px] transition-[border-color,box-shadow] duration-180 ease-out group-hover:border-[#323846] group-hover:shadow-[0_10px_28px_rgba(0,0,0,0.55)]">
        <Link
          href={`/ads/${item.id}`}
          className="block relative w-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#e07945]"
          tabIndex={0}
          aria-label={`Inspect ${item.brand.name} ad creative`}
        >
          <div
            className="relative w-full flex items-center justify-center overflow-hidden"
            style={{ aspectRatio: rep.aspectRatioCss }}
          >
            {rep.isVideo && rep.video ? (
              <AmbientVideoPreview
                id={item.id}
                clusterId={clusterId ?? `gallery-${item.id}`}
                originalVideoUrl={rep.video.mediaUrl}
                previewLoopUrl={rep.video.previewLoopUrl}
                posterUrl={rep.preview?.browseImageUrl ?? rep.preview?.mediaUrl}
                title={item.brand.name}
                isLead={false}
              />
            ) : rep.displayMedia ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={rep.displayMedia.browseImageUrl ?? rep.displayMedia.mediaUrl}
                alt={item.brand.name}
                loading="lazy"
                className="w-full h-full object-cover object-center"
              />
            ) : null}

            {/* Non-obscuring Hover Inspect Micro-Affordance */}
            <div
              className="absolute bottom-2.5 left-2.5 z-15 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 pointer-events-none"
              aria-hidden="true"
            >
              <span className="px-2 py-0.5 bg-[#0c0e14]/90 border border-white/15 rounded-[3px] text-[10px] font-sans font-medium text-[#f3f4f6] tracking-wide shadow-sm">
                Inspect
              </span>
            </div>
          </div>
        </Link>

        {/* 2. Overlays directly ON Creative */}
        {/* Top-Left: EU / UK Evidence Overlay */}
        <EvidenceOverlay
          hasEuEvidence={facts?.hasEuTransparencyEvidence}
          euReach={facts?.latestEuTotalReach}
          hasUkEvidence={facts?.hasUkTransparencyEvidence}
          ukReach={facts?.latestUkTotalReach}
        />

        {/* Top-Right: Exact Creative Reuse Marker (only if >= 2) */}
        {reuseInfo && (
          <div
            className="absolute top-2 right-2 z-10 px-1.5 py-0.5 bg-[#07080a]/90 border border-white/10 rounded-[3px] font-mono text-[10px] sm:text-[11px] text-[#e5e7eb] select-none"
            title={reuseInfo.label}
            aria-label={reuseInfo.label}
          >
            <span>{reuseInfo.badge}</span>
          </div>
        )}

        {/* Bottom-Right: Video Duration Micro-Annotation */}
        {rep.isVideo && durationText && (
          <div
            className="absolute bottom-2 right-2 z-10 px-1.5 py-0.5 bg-[#07080a]/90 border border-white/10 rounded-[3px] font-mono text-[10px] text-[#d1d5db] select-none pointer-events-none"
            aria-label={`Video duration: ${durationText}`}
          >
            <span>{durationText}</span>
          </div>
        )}
      </div>

      {/* 3. Persistent Brand Label Immediately Beneath Creative */}
      <div className="pt-2 px-0.5 w-full">
        <Link
          href={`/ads/${item.id}`}
          className="inline-block text-xs sm:text-[13px] font-medium font-sans text-[#e5e7eb] hover:text-[#e07945] transition-colors truncate max-w-full"
          aria-label={`Brand: ${item.brand.name}`}
        >
          {item.brand.name}
        </Link>
      </div>
    </article>
  );
}
