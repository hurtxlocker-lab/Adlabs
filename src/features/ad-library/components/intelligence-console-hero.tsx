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
  ShareNetworkIcon,
  TagIcon,
  InstagramIcon,
  FacebookIcon,
  MessengerIcon,
  WhatsAppIcon,
  CheckCircleIcon,
  ShieldEvidenceIcon,
  UserIcon,
} from "@/components/ui/icons";
import { Tooltip } from "@/components/ui/astryx";
import { CountryList } from "./country-list";

export const PLATFORM_NAMES: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  messenger: "Messenger",
  audience_network: "Audience Network",
  whatsapp: "WhatsApp",
  threads: "Threads",
};

export function humanizePlatform(p: string): string {
  const key = p.toLowerCase().trim();
  return PLATFORM_NAMES[key] ?? (p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
}

export function PlatformIcon({ platform, size = 13, className = "" }: { platform: string; size?: number; className?: string }) {
  const key = platform.toLowerCase().trim();
  if (key === "instagram") return <InstagramIcon size={size} className={className || "text-sky-400"} />;
  if (key === "facebook") return <FacebookIcon size={size} className={className || "text-sky-400"} />;
  if (key === "messenger") return <MessengerIcon size={size} className={className || "text-sky-400"} />;
  if (key === "whatsapp") return <WhatsAppIcon size={size} className={className || "text-sky-400"} />;
  return <ShareNetworkIcon size={size} className={className || "text-sky-400"} />;
}

export function humanizeCategory(cat: string | null): string | null {
  if (!cat) return null;
  return cat
    .split("/")
    .map((s) => s.trim())
    .map((s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s))
    .join(" / ")
    .replace(/\s*&\s*/g, " & ");
}

export interface IntelligenceConsoleHeroProps {
  item: AdLibraryItem;
  className?: string;
}

export function IntelligenceConsoleHero({ item, className = "" }: IntelligenceConsoleHeroProps) {
  const dossier = item.dossier;

  // 1. Deployment / Longevity
  const runningDays = dossier?.runningDays ?? null;
  const firstSeen = item.firstSeenAt;
  const lastSeen = item.lastSeenAt;
  const isActive = item.isActiveObserved;
  const reuseCount = dossier?.exactCreativeReuseCount ?? null;

  // 2. Transparency Evidence & Regional Facts
  const hasEu = dossier?.hasEuTransparencyEvidence ?? false;
  const euReach = dossier?.latestEuTotalReach ? Number(dossier.latestEuTotalReach) : null;
  const euReached = dossier?.euReachedCountries ?? dossier?.reachedCountries ?? [];
  const euTargeted = dossier?.euTargetCountries ?? dossier?.targetCountries ?? [];
  const euAgeMin = dossier?.latestEuTargetAgeMin ?? null;
  const euAgeMax = dossier?.latestEuTargetAgeMax ?? null;
  const euGender = dossier?.latestEuTargetGender ?? null;

  const hasUk = dossier?.hasUkTransparencyEvidence ?? false;
  const ukReach = dossier?.latestUkTotalReach ? Number(dossier.latestUkTotalReach) : null;
  const ukReached = dossier?.ukReachedCountries ?? [];
  const ukTargeted = dossier?.ukTargetCountries ?? [];
  const ukAgeMin = dossier?.latestUkTargetAgeMin ?? null;
  const ukAgeMax = dossier?.latestUkTargetAgeMax ?? null;
  const ukGender = dossier?.latestUkTargetGender ?? null;

  // Combined fallback / legacy geography
  const reachedCountries = dossier?.reachedCountries?.length ? dossier.reachedCountries : euReached.length ? euReached : ukReached;
  const targetCountries = dossier?.targetCountries?.length ? dossier.targetCountries : euTargeted.length ? euTargeted : ukTargeted;
  const targetAgeMin = euAgeMin ?? ukAgeMin ?? null;
  const targetAgeMax = euAgeMax ?? ukAgeMax ?? null;
  const targetGender = euGender ?? ukGender ?? null;

  // 3. Creative Structure & Media Specs
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

  // 4. Distribution (Flattened: All channels)
  const rawPlatforms = item.publisherPlatforms ?? [];
  const humanPlatforms = rawPlatforms.map(humanizePlatform);

  // 5. Advertiser
  const pageCategory = humanizeCategory(dossier?.pageCategory ?? null);
  const instagramUsername = dossier?.instagramUsername ?? null;
  const instagramFollowers = dossier?.instagramFollowers ? Number(dossier.instagramFollowers) : null;
  const instagramVerified = dossier?.instagramVerified ?? null;
  const facebookLikes = dossier?.facebookLikes ? Number(dossier.facebookLikes) : null;
  const facebookVerified = dossier?.facebookVerified ?? null;

  // 6. Action / CTA
  const ctaText = item.ctaText ?? null;
  const destinationUrl = item.destinationUrl ?? null;
  const adLibraryUrl = item.adLibraryUrl ?? null;

  // Exact reuse display condition (OMIT if exact reuse < 2 per CTO rule)
  const hasMultipleReuse = reuseCount !== null && reuseCount >= 2;

  // Concrete disclosure indicators for EU
  const euPills: string[] = [];
  if (euReach !== null && euReach > 0) euPills.push("Reach");
  if (euReached.length > 0) euPills.push("Delivery");
  if (euTargeted.length > 0) euPills.push("Targeting");
  if (euAgeMin !== null || (euGender !== null && euGender.toUpperCase() !== "ALL")) euPills.push("Demographics");

  // Concrete disclosure indicators for UK
  const ukPills: string[] = [];
  if (ukReach !== null && ukReach > 0) ukPills.push("Reach");
  if (ukReached.length > 0) ukPills.push("Delivery");
  if (ukTargeted.length > 0) ukPills.push("Targeting");
  if (ukAgeMin !== null || (ukGender !== null && ukGender.toUpperCase() !== "ALL")) ukPills.push("Demographics");

  const hasAnyTransparency = (hasEu && euPills.length > 0) || (hasUk && ukPills.length > 0);

  return (
    <div
      className={`w-full bg-gradient-to-b from-[#0d131f] via-[#0c101a] to-[#090c14] border border-[#222f46] rounded-[10px] overflow-hidden text-xs font-sans text-[#f1f5f9] shadow-2xl ${className}`}
      data-testid="intelligence-console-hero"
    >
      {/* =========================================================================
          COCKPIT COMMAND BAR (Luminous & Elevated)
          ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3 bg-[#111726]/80 backdrop-blur-md border-b border-[#202c42]">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-mono text-[10px] uppercase tracking-wider bg-[#162338] border border-[#2a4066] text-[#38bdf8] font-semibold shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] animate-pulse" />
            AdLabs Intelligence Cockpit
          </span>

          <span className="text-base sm:text-lg font-medium text-white font-editorial tracking-tight">
            {item.brand.name}
          </span>
        </div>

        <div className="flex items-center gap-3 font-mono text-[11px]">
          {isActive !== null && (
            <span
              className={`px-2.5 py-0.5 rounded-[4px] border font-medium ${
                isActive
                  ? "bg-[#0d1e14] border-[#1d472c] text-[#4ade80] shadow-sm"
                  : "bg-[#141822] border-[#222c3e] text-[#94a3b8]"
              }`}
            >
              {isActive ? "Active when observed" : "Inactive"}
            </span>
          )}

          {adLibraryUrl && (
            <a
              href={adLibraryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-0.5 bg-[#141b29] border border-[#23314d] hover:border-[#38bdf8] text-[#94a3b8] hover:text-[#38bdf8] transition-colors rounded-[4px] inline-flex items-center gap-1 shadow-sm"
            >
              <span>Meta Ad {item.sourceAdId}</span>
              <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </div>

      {/* =========================================================================
          LEVEL A: MICRO METRIC STRIP (Height ~64-96px, Larger Luminous Typography)
          ========================================================================= */}
      <div className="flex flex-wrap items-stretch border-b border-[#202c42] divide-x divide-[#202c42] bg-[#0c1018]">
        {/* Cell 1: Longevity (Amber) */}
        <Tooltip
          content={`First seen: ${formatFactualDate(firstSeen)} · Last seen: ${formatFactualDate(lastSeen)}\nEarliest/latest date observed in available source data.`}
          placement="above"
        >
          <div className="flex-1 min-w-[125px] max-w-[170px] p-3.5 sm:px-4.5 flex flex-col justify-center bg-gradient-to-b from-[#f59e0b12] to-transparent hover:from-[#f59e0b20] transition-colors cursor-help group">
            <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-amber-400 font-semibold mb-0.5">
              <ClockIcon size={12} className="text-amber-400" />
              <span>Longevity</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-mono font-bold text-amber-400 tabular-nums tracking-tight">
                {runningDays !== null && runningDays > 0 ? `${runningDays}d` : "Active"}
              </span>
              <span className="text-[11px] text-[#94a3b8] font-mono">running</span>
            </div>
          </div>
        </Tooltip>

        {/* Cell 2: Exact Reuse (Orange) - OMITTED if reuse < 2 */}
        {hasMultipleReuse && (
          <Tooltip
            content={`Exact representative creative binary observed across ${reuseCount} Meta ads from ${item.brand.name}.`}
            placement="above"
          >
            <div className="flex-1 min-w-[125px] max-w-[170px] p-3.5 sm:px-4.5 flex flex-col justify-center bg-gradient-to-b from-[#ea580c12] to-transparent hover:from-[#ea580c20] transition-colors cursor-help group">
              <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-orange-400 font-semibold mb-0.5">
                <RepeatIcon size={12} className="text-orange-400" />
                <span>Exact Reuse</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-mono font-bold text-orange-400 tabular-nums tracking-tight">
                  ↻ ×{reuseCount}
                </span>
                <span className="text-[11px] text-[#94a3b8] font-mono">ads</span>
              </div>
            </div>
          </Tooltip>
        )}

        {/* Cell 3: Creative Structure (Purple) */}
        <div className="flex-1 min-w-[150px] max-w-[220px] p-3.5 sm:px-4.5 flex flex-col justify-center bg-gradient-to-b from-[#8b5cf612] to-transparent">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-purple-300 font-semibold mb-0.5">
            <span className="flex items-center gap-1.5">
              {isDco || isCarousel ? (
                <LayersIcon size={12} className="text-purple-300" />
              ) : isVideo ? (
                <VideoIcon size={12} className="text-purple-300" />
              ) : (
                <ImageIcon size={12} className="text-purple-300" />
              )}
              <span>Structure</span>
            </span>
            <span className="text-[11px] font-mono text-purple-300 lowercase">
              {isVideo ? "video" : "image"}
            </span>
          </div>

          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-mono font-bold text-purple-300 tracking-tight">
              {isDco
                ? `DCO · ${variations.length}`
                : isCarousel
                ? `Carousel · ${sourceCards.length}`
                : "Single"}
            </span>
            <span className="text-[11px] text-[#94a3b8] font-mono">
              {commonRatio ? `(${commonRatio})` : width && height ? `${width}×${height}` : ""}
              {isVideo && durationText ? ` · ${durationText}` : ""}
            </span>
          </div>
        </div>

        {/* Cell 4: Distribution Channels (Flattened: All Channels Shown) */}
        <div className="flex-2 min-w-[220px] p-3.5 sm:px-4.5 flex flex-col justify-center bg-gradient-to-b from-[#0284c712] to-transparent">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-sky-400 font-semibold mb-1">
            <span className="flex items-center gap-1.5">
              <ShareNetworkIcon size={12} className="text-sky-400" />
              <span>Distribution</span>
            </span>
            <span className="text-[11px] font-mono text-[#94a3b8] tabular-nums">
              {humanPlatforms.length > 0 ? `${humanPlatforms.length} active` : "Meta Feed"}
            </span>
          </div>

          {/* All channels rendered inline without truncation */}
          <div className="flex flex-wrap items-center gap-1.5">
            {humanPlatforms.length > 0 ? (
              humanPlatforms.map((hp) => (
                <span
                  key={hp}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[#131c2d] border border-[#22334f] font-sans text-xs font-medium text-[#f1f5f9] rounded-[4px] shadow-sm"
                >
                  <PlatformIcon platform={hp} size={12} />
                  <span>{hp}</span>
                </span>
              ))
            ) : (
              <span className="text-xs text-[#94a3b8]">Meta Network</span>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
          LEVEL B: GROUPED BODY CANVAS (Artistic, Dominant Reach, Flattened Footprint)
          ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-[#202c42] border-b border-[#202c42]">
        {/* PANEL 2A: DELIVERY & AUDIENCE (Grand Visual Anchor — 8 cols) */}
        <div className="md:col-span-7 lg:col-span-8 p-5 sm:p-6 bg-gradient-to-b from-[#0c121e] to-[#090d16] flex flex-col justify-between gap-5">
          {/* Header & Dramatic Reach Focal Point */}
          <div className="flex flex-col gap-2 pb-3 border-b border-[#1c273a]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-sky-400 font-bold">
                <GlobeIcon size={14} className="text-sky-400" />
                Delivery & Audience
              </span>
            </div>

            {/* Dramatic Reach Headline */}
            {euReach !== null && euReach > 0 ? (
              <div className="flex flex-wrap items-baseline gap-3 pt-1">
                <span className="text-3xl sm:text-4xl lg:text-5xl font-mono font-extrabold text-white tracking-tight drop-shadow-sm">
                  {formatCompactNumber(euReach)}
                </span>
                <span className="text-xs sm:text-sm font-sans text-[#38bdf8] font-medium tracking-wide">
                  EU Disclosed Statutory Reach
                </span>
              </div>
            ) : ukReach !== null && ukReach > 0 ? (
              <div className="flex flex-wrap items-baseline gap-3 pt-1">
                <span className="text-3xl sm:text-4xl lg:text-5xl font-mono font-extrabold text-white tracking-tight drop-shadow-sm">
                  {formatCompactNumber(ukReach)}
                </span>
                <span className="text-xs sm:text-sm font-sans text-[#38bdf8] font-medium tracking-wide">
                  UK Disclosed Statutory Reach
                </span>
              </div>
            ) : (
              <div className="pt-1">
                <span className="text-lg sm:text-xl font-sans font-medium text-[#f1f5f9]">
                  Worldwide Commercial Delivery
                </span>
              </div>
            )}
          </div>

          {/* Markets Hierarchy (Full English Names) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Reached Markets */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-mono text-[#94a3b8] uppercase tracking-wider font-semibold">
                Reached Markets {reachedCountries.length > 0 ? `(${reachedCountries.length})` : ""}
              </span>
              <CountryList countryCodes={reachedCountries} emptyLabel="Worldwide delivery" />
            </div>

            {/* Targeted Markets */}
            {targetCountries.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-mono text-[#94a3b8] uppercase tracking-wider font-semibold inline-flex items-center gap-1">
                  <TargetIcon size={12} className="text-[#94a3b8]" />
                  <span>Targeted Markets ({targetCountries.length})</span>
                </span>
                <CountryList countryCodes={targetCountries} />
              </div>
            )}
          </div>

          {/* Demographic Audience Targeting */}
          {(targetAgeMin !== null || (targetGender && targetGender.toUpperCase() !== "ALL")) && (
            <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-[#1c273a] text-xs font-mono">
              {targetAgeMin !== null && (
                <div className="flex items-center gap-1.5 text-[#f1f5f9]">
                  <UserIcon size={13} className="text-sky-400" />
                  <span className="text-[#94a3b8]">Target Age:</span>
                  <span className="font-semibold text-sky-300">
                    {targetAgeMin}–{targetAgeMax ?? "65+"}
                  </span>
                </div>
              )}

              {targetGender && targetGender.toUpperCase() !== "ALL" && (
                <div className="flex items-center gap-1.5 text-[#f1f5f9]">
                  <span className="text-[#94a3b8]">Target Gender:</span>
                  <span className="font-semibold text-sky-300 capitalize">
                    {targetGender.toLowerCase()}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* PANEL 2B: ADVERTISER FOOTPRINT (Flattened & Airy — 4 cols) */}
        <div className="md:col-span-5 lg:col-span-4 p-5 sm:p-6 bg-gradient-to-b from-[#0c1412] to-[#09100e] flex flex-col justify-between gap-4">
          <div className="flex flex-col gap-1 pb-3 border-b border-[#1c2e24]">
            <span className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-emerald-400 font-bold">
              <TagIcon size={14} className="text-emerald-400" />
              Advertiser Footprint
            </span>

            {pageCategory ? (
              <Tooltip
                content="Advertiser Meta Page Category — commercial category on the advertiser's Meta Page, not an ad classification."
                placement="above"
              >
                <span className="text-sm font-sans font-medium text-emerald-300 cursor-help pt-0.5">
                  {pageCategory}
                </span>
              </Tooltip>
            ) : (
              <span className="text-xs text-[#788296] italic pt-0.5">Commercial Brand Footprint</span>
            )}
          </div>

          {/* Flattened Social Stats (Fluid & Airy without boxed borders) */}
          <div className="flex flex-col gap-3 py-1">
            {instagramUsername && (
              <Tooltip
                content={`Instagram Profile @${instagramUsername}${instagramVerified ? " (Verified)" : ""}`}
                placement="above"
              >
                <div className="flex items-center justify-between text-xs font-mono cursor-help">
                  <div className="flex items-center gap-2 text-[#f1f5f9]">
                    <InstagramIcon size={14} className="text-emerald-400" />
                    <span className="font-medium text-white">@{instagramUsername}</span>
                    {instagramVerified && (
                      <CheckCircleIcon size={12} className="text-sky-400" title="Verified profile" />
                    )}
                  </div>
                  {instagramFollowers !== null && (
                    <span className="text-sm font-mono font-bold text-emerald-300 tabular-nums">
                      {formatCompactNumber(instagramFollowers)} <span className="text-[10px] font-normal text-[#94a3b8]">followers</span>
                    </span>
                  )}
                </div>
              </Tooltip>
            )}

            {facebookLikes !== null && (
              <Tooltip
                content={`Facebook Page${facebookVerified ? " (Verified)" : ""}`}
                placement="above"
              >
                <div className="flex items-center justify-between text-xs font-mono cursor-help">
                  <div className="flex items-center gap-2 text-[#f1f5f9]">
                    <FacebookIcon size={14} className="text-emerald-400" />
                    <span className="font-medium text-white">Facebook Page</span>
                    {facebookVerified && (
                      <CheckCircleIcon size={12} className="text-sky-400" title="Verified page" />
                    )}
                  </div>
                  <span className="text-sm font-mono font-bold text-emerald-300 tabular-nums">
                    {formatCompactNumber(facebookLikes)} <span className="text-[10px] font-normal text-[#94a3b8]">likes</span>
                  </span>
                </div>
              </Tooltip>
            )}

            {!instagramUsername && facebookLikes === null && (
              <div className="text-xs text-[#94a3b8] py-1">
                Meta page verification and audience scale metrics.
              </div>
            )}
          </div>

          <div className="text-[10px] text-[#788296] font-mono pt-1">
            Meta Page Verification & Scale
          </div>
        </div>
      </div>

      {/* =========================================================================
          LEVEL C1: TRANSPARENCY EVIDENCE STRIP
          Omitted completely if no EU or UK transparency data exists.
          Factual indicators instead of dimension count.
          ========================================================================= */}
      {hasAnyTransparency && (
        <div className="px-4 sm:px-5 py-2.5 bg-[#0e121c] border-b border-[#202c42] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <ShieldEvidenceIcon size={14} className="text-[#d46b38] shrink-0" />
            <span className="font-mono text-[11px] uppercase tracking-wider text-[#d46b38] font-bold">
              Transparency Evidence
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {hasEu && euPills.length > 0 && (
              <Tooltip
                content={`EU Digital Services Act statutory transparency disclosure.\nDisclosed dimensions: ${euPills.join(", ")}.`}
                placement="above"
              >
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-[#1a110a] border border-[#3b2014] text-[#ea580c] rounded-[4px] font-mono text-[11px] font-medium cursor-help shadow-sm">
                  <span>EU Transparency</span>
                  <span className="text-[#788296]">·</span>
                  <span className="text-[#fdba74]">{euPills.join(" · ")}</span>
                </div>
              </Tooltip>
            )}

            {hasUk && ukPills.length > 0 && (
              <Tooltip
                content={`UK statutory transparency disclosure.\nDisclosed dimensions: ${ukPills.join(", ")}.`}
                placement="above"
              >
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-[#0d1624] border border-[#1e3352] text-[#38bdf8] rounded-[4px] font-mono text-[11px] font-medium cursor-help shadow-sm">
                  <span>UK Transparency</span>
                  <span className="text-[#788296]">·</span>
                  <span className="text-[#bae6fd]">{ukPills.join(" · ")}</span>
                </div>
              </Tooltip>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          LEVEL C2: STREAMLINED UTILITY STRIP
          CTA + Destination Domain + Open in Meta (Removed "Observed:")
          ========================================================================= */}
      <div className="px-4 sm:px-5 py-2.5 bg-[#0a0d14] flex flex-wrap items-center justify-between gap-3 text-xs font-sans">
        <div className="flex flex-wrap items-center gap-3">
          {ctaText && (
            <span className="px-3 py-1 bg-[#151c2a] border border-[#26354d] rounded-[4px] font-medium text-xs text-white shadow-sm">
              CTA: {ctaText}
            </span>
          )}
          {destinationUrl && (
            <a
              href={destinationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#94a3b8] hover:text-[#38bdf8] transition-colors truncate max-w-sm inline-flex items-center gap-1 font-mono"
            >
              <span>{destinationUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
              <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          {adLibraryUrl && (
            <a
              href={adLibraryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#94a3b8] hover:text-[#e07945] transition-colors inline-flex items-center gap-1"
            >
              <span>Open in Meta</span>
              <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
