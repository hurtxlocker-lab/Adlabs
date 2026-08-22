"use client";

import type { AdLibraryItem } from "../types";
import { formatCompactNumber } from "@/features/discover/utils/formatters";
import { Tooltip } from "@/components/ui/astryx";

export interface HeroFactStripProps {
  item: AdLibraryItem;
}

export function HeroFactStrip({ item }: HeroFactStripProps) {
  const dossier = item.dossier;
  const runningDays = dossier?.runningDays ?? null;
  const reuseCount = dossier?.exactCreativeReuseCount ?? null;
  const pageCategory = dossier?.pageCategory ?? null;
  const hasEu = dossier?.hasEuTransparencyEvidence ?? false;
  const euReach = dossier?.latestEuTotalReach ? Number(dossier.latestEuTotalReach) : null;
  const hasUk = dossier?.hasUkTransparencyEvidence ?? false;
  const reachedCountries = dossier?.reachedCountries ?? [];
  const targetCountries = dossier?.targetCountries ?? [];

  const hasTransparency = hasEu || hasUk || reachedCountries.length > 0 || targetCountries.length > 0;

  return (
    <div className="flex flex-col gap-3 w-full font-sans">
      {/* 1. Core Factual Chips */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* Running Longevity */}
        {runningDays !== null && runningDays > 0 && (
          <div
            className="inline-flex items-center px-2.5 py-1 bg-[#0c0e14] border border-[#1e222d] rounded-[3px] text-[#f3f4f6]"
            title="Observed longevity in source data"
          >
            <span className="text-[#8e95a2] mr-1.5 font-mono">Running</span>
            <span className="font-mono font-medium">{runningDays} {runningDays === 1 ? "day" : "days"}</span>
          </div>
        )}

        {/* Exact Creative Reuse */}
        {reuseCount !== null && reuseCount >= 2 && (
          <div
            className="inline-flex items-center px-2.5 py-1 bg-[#0c0e14] border border-[#1e222d] rounded-[3px] text-[#f3f4f6]"
            title={`Exact representative creative observed across ${reuseCount} ads from this brand`}
          >
            <span className="text-[#8e95a2] mr-1.5 font-mono">Exact reuse</span>
            <span className="font-mono font-medium text-[#d46b38]">×{reuseCount}</span>
          </div>
        )}

        {/* Publisher Platforms */}
        {item.publisherPlatforms.length > 0 && (
          <div className="inline-flex items-center px-2.5 py-1 bg-[#0c0e14] border border-[#1e222d] rounded-[3px] text-[#9da2ad] font-mono">
            {item.publisherPlatforms.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" · ")}
          </div>
        )}

        {/* Advertiser Page Category with Tooltip */}
        {pageCategory && (
          <Tooltip
            content="Advertiser Page Category — the commercial category shown on the advertiser's Meta Page, not a classification of this creative."
            placement="above"
          >
            <div className="inline-flex items-center px-2.5 py-1 bg-[#0c0e14] border border-[#1e222d] rounded-[3px] text-[#9da2ad] cursor-help">
              <span className="text-[#8e95a2] mr-1">Category:</span>
              <span className="text-[#f3f4f6]">{pageCategory}</span>
            </div>
          </Tooltip>
        )}

        {/* EU / UK Transparency Chips */}
        {hasEu && (
          <Tooltip
            content="Regulatory transparency disclosure under EU Digital Services Act."
            placement="above"
          >
            <div className="inline-flex items-center px-2.5 py-1 bg-[#0c0e14] border border-[#2a303f] rounded-[3px] text-[#f3f4f6] cursor-help">
              <span className="text-[#8e95a2] mr-1.5 font-mono">EU transparency</span>
              {euReach !== null && euReach > 0 && (
                <span className="font-mono font-medium text-[#f3f4f6]">
                  · {formatCompactNumber(euReach)} reach
                </span>
              )}
            </div>
          </Tooltip>
        )}

        {hasUk && (
          <div className="inline-flex items-center px-2.5 py-1 bg-[#0c0e14] border border-[#1e222d] rounded-[3px] text-[#9da2ad] font-mono">
            UK transparency
          </div>
        )}
      </div>

      {/* 2. Compact Regional Evidence Strip (Reached vs Targeted) */}
      {hasTransparency && (reachedCountries.length > 0 || targetCountries.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2 border-t border-[#16181f] text-xs font-sans text-[#8e95a2]">
          {reachedCountries.length > 0 && (
            <div className="inline-flex items-center gap-1.5">
              <span className="font-mono uppercase text-[10px] text-[#686e7b] tracking-wider">
                Reached:
              </span>
              <span className="font-mono text-[#f3f4f6]">
                {reachedCountries.slice(0, 8).join(" · ")}
                {reachedCountries.length > 8 ? ` +${reachedCountries.length - 8}` : ""}
              </span>
            </div>
          )}

          {targetCountries.length > 0 && (
            <div className="inline-flex items-center gap-1.5">
              <span className="font-mono uppercase text-[10px] text-[#686e7b] tracking-wider">
                Targeted:
              </span>
              <span className="font-mono text-[#9da2ad]">
                {targetCountries.slice(0, 8).join(" · ")}
                {targetCountries.length > 8 ? ` +${targetCountries.length - 8}` : ""}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
