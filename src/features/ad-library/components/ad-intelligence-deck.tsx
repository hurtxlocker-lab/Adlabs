"use client";

import React from "react";
import type { AdLibraryItem } from "../types";
import { formatFactualDate } from "../utils";
import { formatCommonAspectRatio } from "../utils/aspect-ratio";
import { formatCompactNumber, formatVideoDuration } from "@/features/discover/utils/formatters";
import {
  ClockIcon,
  RepeatIcon,
  GlobeIcon,
  TargetIcon,
  LayersIcon,
  VideoIcon,
  ImageIcon,
  FrameIcon,
  ShareNetworkIcon,
  TagIcon,
  InstagramIcon,
  FacebookIcon,
  ExternalLinkIcon,
  CheckCircleIcon,
} from "@/components/ui/icons";
import { Tooltip } from "@/components/ui/astryx";

export const PLATFORM_HUMAN_NAMES: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  messenger: "Messenger",
  audience_network: "Audience Network",
  whatsapp: "WhatsApp",
  threads: "Threads",
};

export function humanizePlatformName(p: string): string {
  const key = p.toLowerCase();
  return PLATFORM_HUMAN_NAMES[key] ?? (p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
}

export interface AdIntelligenceDeckProps {
  item: AdLibraryItem;
  className?: string;
}

export function AdIntelligenceDeck({ item, className = "" }: AdIntelligenceDeckProps) {
  const dossier = item.dossier;

  // 1. Deployment
  const runningDays = dossier?.runningDays ?? null;
  const firstSeen = item.firstSeenAt;
  const lastSeen = item.lastSeenAt;
  const isActive = item.isActiveObserved;
  const reuseCount = dossier?.exactCreativeReuseCount ?? null;

  // 2. Transparency
  const hasEu = dossier?.hasEuTransparencyEvidence ?? false;
  const euReach = dossier?.latestEuTotalReach ? Number(dossier.latestEuTotalReach) : null;
  const hasUk = dossier?.hasUkTransparencyEvidence ?? false;
  const ukReach = dossier?.latestUkTotalReach ? Number(dossier.latestUkTotalReach) : null;
  const reachedCountries = dossier?.reachedCountries ?? [];
  const targetCountries = dossier?.targetCountries ?? [];
  const targetAgeMin = dossier?.latestEuTargetAgeMin ?? dossier?.latestUkTargetAgeMin ?? null;
  const targetAgeMax = dossier?.latestEuTargetAgeMax ?? dossier?.latestUkTargetAgeMax ?? null;
  const targetGender = dossier?.latestEuTargetGender ?? dossier?.latestUkTargetGender ?? null;

  // 3. Creative Structure & Media
  const variations = item.variations ?? [];
  const sourceCards = item.sourceCards ?? [];
  const isDco = variations.length > 1;
  const isCarousel = !isDco && sourceCards.length > 1;
  const primaryMedia = item.media.find((m) => m.role !== "preview") ?? item.media[0];
  const isVideo = primaryMedia?.mediaType === "VIDEO";
  const durationText = formatVideoDuration(dossier?.videoDurationMs);
  const width = dossier?.width ?? primaryMedia?.width ?? null;
  const height = dossier?.height ?? primaryMedia?.height ?? null;
  const commonRatio = formatCommonAspectRatio(width, height, dossier?.aspectRatio);

  // 4. Distribution
  const platforms = (item.publisherPlatforms ?? []).map(humanizePlatformName);

  // 5. Advertiser
  const pageCategory = dossier?.pageCategory ?? null;
  const instagramUsername = dossier?.instagramUsername ?? null;
  const instagramFollowers = dossier?.instagramFollowers ? Number(dossier.instagramFollowers) : null;
  const instagramVerified = dossier?.instagramVerified ?? null;
  const facebookLikes = dossier?.facebookLikes ? Number(dossier.facebookLikes) : null;
  const facebookVerified = dossier?.facebookVerified ?? null;

  // 6. Action / CTA
  const ctaText = item.ctaText ?? null;
  const destinationUrl = item.destinationUrl ?? null;
  const adLibraryUrl = item.adLibraryUrl ?? null;

  return (
    <div
      className={`w-full bg-[#090b10] border border-[#161820] rounded-[6px] p-3.5 sm:p-4 text-xs font-sans text-[#f3f4f6] shadow-sm ${className}`}
      data-testid="ad-intelligence-deck"
    >
      {/* Header bar / Title */}
      <div className="flex items-center justify-between pb-3 mb-3.5 border-b border-[#161820]">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[#8e95a2] font-medium">
            Ad Intelligence Deck
          </span>
          <span className="text-[10px] text-[#686e7b] font-mono">
            Source ID: {item.sourceAdId}
          </span>
        </div>

        {isActive !== null && (
          <span
            className={`px-2 py-0.5 rounded-[2px] font-mono text-[10px] border ${
              isActive
                ? "bg-[#111815] border-[#1e3328] text-[#4ade80]"
                : "bg-[#12141a] border-[#1e222d] text-[#8e95a2]"
            }`}
          >
            {isActive ? "Active when observed" : "Inactive"}
          </span>
        )}
      </div>

      {/* Main Dense Matrix Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
        {/* CELL: Running Longevity */}
        {runningDays !== null && runningDays > 0 && (
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#8e95a2]">
              <ClockIcon size={13} className="text-[#686e7b]" />
              Running Longevity
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-base font-mono font-medium text-[#f3f4f6] tabular-nums">
                {runningDays} {runningDays === 1 ? "day" : "days"}
              </span>
            </div>
            <span className="text-[10px] text-[#686e7b] font-mono tabular-nums">
              {formatFactualDate(firstSeen)} → {formatFactualDate(lastSeen)}
            </span>
          </div>
        )}

        {/* CELL: Exact Creative Reuse */}
        {reuseCount !== null && reuseCount >= 2 && (
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#8e95a2]">
              <RepeatIcon size={13} className="text-[#686e7b]" />
              Creative Deployments
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-mono font-medium text-[#d46b38] tabular-nums">
                ×{reuseCount}
              </span>
              <span className="text-xs text-[#9da2ad]">ads by {item.brand.name}</span>
            </div>
            <span className="text-[10px] text-[#686e7b]">
              Exact same creative binary
            </span>
          </div>
        )}

        {/* CELL: EU Transparency Reach */}
        {hasEu && (
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#8e95a2]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#d46b38] inline-block" />
              EU Transparency
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-mono font-medium text-[#f3f4f6] tabular-nums">
                {euReach !== null && euReach > 0
                  ? formatCompactNumber(euReach)
                  : "Disclosed"}
              </span>
              {euReach !== null && euReach > 0 && (
                <span className="text-xs text-[#9da2ad] font-mono">reach</span>
              )}
            </div>
            <span className="text-[10px] text-[#686e7b]">
              EU Digital Services Act disclosure
            </span>
          </div>
        )}

        {/* CELL: UK Transparency Reach */}
        {hasUk && (
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#8e95a2]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#8e95a2] inline-block" />
              UK Transparency
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-mono font-medium text-[#f3f4f6] tabular-nums">
                {ukReach !== null && ukReach > 0
                  ? formatCompactNumber(ukReach)
                  : "Disclosed"}
              </span>
              {ukReach !== null && ukReach > 0 && (
                <span className="text-xs text-[#9da2ad] font-mono">reach</span>
              )}
            </div>
            <span className="text-[10px] text-[#686e7b]">
              UK regulatory disclosure
            </span>
          </div>
        )}

        {/* CELL: Creative Structure & Media */}
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#8e95a2]">
            {isDco || isCarousel ? (
              <LayersIcon size={13} className="text-[#686e7b]" />
            ) : isVideo ? (
              <VideoIcon size={13} className="text-[#686e7b]" />
            ) : (
              <ImageIcon size={13} className="text-[#686e7b]" />
            )}
            Creative Structure
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-medium text-[#f3f4f6]">
              {isDco
                ? `DCO · ${variations.length} variations`
                : isCarousel
                ? `Carousel · ${sourceCards.length} cards`
                : isVideo
                ? `Video${durationText ? ` · ${durationText}` : ""}`
                : "Single Image"}
            </span>
          </div>
          {(width && height) || commonRatio ? (
            <span className="text-[10px] text-[#686e7b] font-mono inline-flex items-center gap-1">
              <FrameIcon size={11} className="text-[#686e7b]" />
              {width && height ? `${width}×${height}` : ""}{" "}
              {commonRatio ? `(${commonRatio})` : ""}
            </span>
          ) : null}
        </div>

        {/* CELL: Geographic Reach & Targeting */}
        {(reachedCountries.length > 0 || targetCountries.length > 0) && (
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#8e95a2]">
              <GlobeIcon size={13} className="text-[#686e7b]" />
              Geography
            </span>
            <div className="flex flex-col gap-0.5 text-xs">
              {reachedCountries.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-[#686e7b] uppercase">Reached</span>
                  <span className="font-mono text-[#f3f4f6]">
                    {reachedCountries.slice(0, 6).join(" · ")}
                    {reachedCountries.length > 6 ? ` +${reachedCountries.length - 6}` : ""}
                  </span>
                </div>
              )}
              {targetCountries.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-[#686e7b] uppercase">Targeted</span>
                  <span className="font-mono text-[#9da2ad]">
                    {targetCountries.slice(0, 6).join(" · ")}
                    {targetCountries.length > 6 ? ` +${targetCountries.length - 6}` : ""}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CELL: Demographics (only if meaningful) */}
        {(targetAgeMin !== null || targetAgeMax !== null || targetGender) && (
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#8e95a2]">
              <TargetIcon size={13} className="text-[#686e7b]" />
              Target Demographics
            </span>
            <span className="text-sm font-medium text-[#f3f4f6]">
              {targetAgeMin !== null || targetAgeMax !== null
                ? `Age ${targetAgeMin ?? "Any"}–${targetAgeMax ?? "120+"}`
                : "All Ages"}
              {targetGender ? ` · ${targetGender.toLowerCase()}` : ""}
            </span>
            <span className="text-[10px] text-[#686e7b]">
              Advertiser declared audience
            </span>
          </div>
        )}

        {/* CELL: Distribution Platforms */}
        {platforms.length > 0 && (
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#8e95a2]">
              <ShareNetworkIcon size={13} className="text-[#686e7b]" />
              Distribution
            </span>
            <span className="text-sm font-medium text-[#f3f4f6]">
              {platforms.join(" · ")}
            </span>
            <span className="text-[10px] text-[#686e7b]">
              Meta publisher placements
            </span>
          </div>
        )}

        {/* CELL: Advertiser Profile */}
        {(pageCategory || instagramUsername || instagramFollowers !== null || facebookLikes !== null) && (
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#8e95a2]">
              <TagIcon size={13} className="text-[#686e7b]" />
              Advertiser
            </span>
            <div className="flex flex-col gap-0.5">
              {pageCategory && (
                <Tooltip
                  content="Advertiser Page Category — commercial category on the advertiser's Meta Page, not an ad classification."
                  placement="above"
                >
                  <span className="text-xs text-[#f3f4f6] cursor-help hover:text-[#e07945] transition-colors">
                    {pageCategory}
                  </span>
                </Tooltip>
              )}

              {instagramUsername && (
                <div className="flex items-center gap-1 text-[11px] text-[#9da2ad] font-mono">
                  <InstagramIcon size={11} className="text-[#8e95a2]" />
                  <span>@{instagramUsername}</span>
                  {instagramVerified && (
                    <CheckCircleIcon size={11} className="text-[#3b82f6]" title="Verified profile" />
                  )}
                  {instagramFollowers !== null && (
                    <span className="text-[#686e7b]">· {formatCompactNumber(instagramFollowers)}</span>
                  )}
                </div>
              )}

              {facebookLikes !== null && (
                <div className="flex items-center gap-1 text-[11px] text-[#9da2ad] font-mono">
                  <FacebookIcon size={11} className="text-[#8e95a2]" />
                  <span>{formatCompactNumber(facebookLikes)} likes</span>
                  {facebookVerified && (
                    <CheckCircleIcon size={11} className="text-[#3b82f6]" title="Verified page" />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* CELL: Action & Destination */}
        {(ctaText || destinationUrl || adLibraryUrl) && (
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#8e95a2]">
              <ExternalLinkIcon size={13} className="text-[#686e7b]" />
              Action & Destination
            </span>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {ctaText && (
                <span className="px-2 py-0.5 bg-[#12151b] border border-[#1e222d] rounded-[2px] font-medium text-[11px] text-[#f3f4f6]">
                  {ctaText}
                </span>
              )}
              {destinationUrl && (
                <a
                  href={destinationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-[#9da2ad] hover:text-[#e07945] transition-colors truncate max-w-[150px] inline-flex items-center gap-0.5"
                >
                  <span className="truncate">{destinationUrl.replace(/^https?:\/\//, "")}</span>
                  <span aria-hidden="true">↗</span>
                </a>
              )}
              {adLibraryUrl && (
                <a
                  href={adLibraryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-mono text-[#8e95a2] hover:text-[#e07945] transition-colors inline-flex items-center gap-0.5"
                >
                  <span>Meta Ad</span>
                  <span aria-hidden="true">↗</span>
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
