"use client";

import { useState } from "react";
import Link from "next/link";
import { TabList, Tab } from "@/components/ui/astryx";
import type { AdLibraryItem } from "../types";
import { formatFactualDate } from "../utils";
import { formatCommonAspectRatio } from "../utils/aspect-ratio";
import { formatCompactNumber, formatVideoDuration } from "@/features/discover/utils/formatters";

export interface InspectDossierProps {
  item: AdLibraryItem;
}

export function InspectDossier({ item }: InspectDossierProps) {
  const [activeTab, setActiveTab] = useState<string>("delivery");
  const dossier = item.dossier;

  const hasEu = dossier?.hasEuTransparencyEvidence ?? false;
  const euReach = dossier?.latestEuTotalReach ? Number(dossier.latestEuTotalReach) : null;
  const hasUk = dossier?.hasUkTransparencyEvidence ?? false;
  const ukReach = dossier?.latestUkTotalReach ? Number(dossier.latestUkTotalReach) : null;
  const reachedCountries = dossier?.reachedCountries ?? [];
  const targetCountries = dossier?.targetCountries ?? [];
  const targetAgeMin = dossier?.latestEuTargetAgeMin ?? dossier?.latestUkTargetAgeMin ?? null;
  const targetAgeMax = dossier?.latestEuTargetAgeMax ?? dossier?.latestUkTargetAgeMax ?? null;
  const targetGender = dossier?.latestEuTargetGender ?? dossier?.latestUkTargetGender ?? null;

  const pageCategory = dossier?.pageCategory ?? null;
  const instagramFollowers = dossier?.instagramFollowers ? Number(dossier.instagramFollowers) : null;
  const instagramUsername = dossier?.instagramUsername ?? null;
  const instagramVerified = dossier?.instagramVerified ?? null;
  const facebookLikes = dossier?.facebookLikes ? Number(dossier.facebookLikes) : null;
  const facebookVerified = dossier?.facebookVerified ?? null;
  const aboutText = dossier?.aboutText ?? null;

  const siblings = dossier?.siblingDeployments ?? [];
  const reuseCount = dossier?.exactCreativeReuseCount ?? null;

  const width = dossier?.width ?? null;
  const height = dossier?.height ?? null;
  const durationText = formatVideoDuration(dossier?.videoDurationMs);
  const commonRatio = formatCommonAspectRatio(width, height, dossier?.aspectRatio);

  return (
    <div className="flex flex-col gap-8 w-full font-sans">
      {/* 1. Dossier Tab Strip */}
      <div className="flex flex-col gap-6">
        <div className="border-b border-[#16181f]">
          <TabList
            value={activeTab}
            onChange={(tab) => setActiveTab(tab)}
            size="sm"
            className="w-full flex gap-4"
          >
            <Tab value="delivery" label="Delivery" />
            <Tab value="transparency" label="Transparency" />
            <Tab value="advertiser" label="Advertiser" />
          </TabList>
        </div>

        {/* Tab 1: Delivery */}
        {activeTab === "delivery" && (
          <div className="flex flex-col gap-6 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1 p-3 bg-[#0c0e14] border border-[#161820] rounded-[3px]">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[#8e95a2] uppercase tracking-wider text-[10px]">
                    First Seen
                  </span>
                  <span className="text-[10px] text-[#686e7b]">Earliest observed</span>
                </div>
                <span className="font-mono text-sm text-[#f3f4f6] tabular-nums">
                  {formatFactualDate(item.firstSeenAt)}
                </span>
              </div>

              <div className="flex flex-col gap-1 p-3 bg-[#0c0e14] border border-[#161820] rounded-[3px]">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[#8e95a2] uppercase tracking-wider text-[10px]">
                    Last Seen
                  </span>
                  <span className="text-[10px] text-[#686e7b]">Latest observed</span>
                </div>
                <span className="font-mono text-sm text-[#f3f4f6] tabular-nums">
                  {formatFactualDate(item.lastSeenAt)}
                </span>
              </div>
            </div>

            {/* Observation State & Platforms */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5 p-3 bg-[#0c0e14] border border-[#161820] rounded-[3px]">
                <span className="font-mono text-[#8e95a2] uppercase tracking-wider text-[10px]">
                  Observed Status
                </span>
                <span className="text-xs text-[#f3f4f6]">
                  {item.isActiveObserved ? "Active when observed" : "Inactive when observed"}
                </span>
              </div>

              <div className="flex flex-col gap-1.5 p-3 bg-[#0c0e14] border border-[#161820] rounded-[3px]">
                <span className="font-mono text-[#8e95a2] uppercase tracking-wider text-[10px]">
                  Publisher Platforms
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {item.publisherPlatforms.map((p) => (
                    <span
                      key={p}
                      className="px-2 py-0.5 bg-[#12151b] border border-[#1e222d] font-mono text-[11px] text-[#f3f4f6] rounded-[2px]"
                    >
                      {p.charAt(0) + p.slice(1).toLowerCase()}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Sibling Canonical Deployments */}
            {siblings.length > 0 && (
              <div className="flex flex-col gap-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-mono text-xs text-[#8e95a2] uppercase tracking-wider">
                    Exact Creative Deployments ({reuseCount ?? siblings.length + 1})
                  </h4>
                  <span className="text-[11px] text-[#686e7b]">
                    Same creative binary by {item.brand.name}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {siblings.map((sib) => (
                    <Link
                      key={sib.id}
                      href={`/ads/${sib.id}`}
                      className="flex flex-col gap-1.5 p-2.5 bg-[#090b10] border border-[#161820] hover:border-[#2a2f3d] transition-colors rounded-[3px] group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-[#f3f4f6] group-hover:text-[#e07945] transition-colors">
                          Meta Ad {sib.sourceAdId}
                        </span>
                        <div className="flex items-center gap-1">
                          {sib.hasEuEvidence && (
                            <span className="px-1 py-0.2 bg-[#12151b] border border-[#2a303f] font-mono text-[9px] text-[#8e95a2] rounded-[2px]">
                              EU
                            </span>
                          )}
                          {sib.hasUkEvidence && (
                            <span className="px-1 py-0.2 bg-[#12151b] border border-[#1e222d] font-mono text-[9px] text-[#686e7b] rounded-[2px]">
                              UK
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-[#686e7b]">
                        <span>{formatFactualDate(sib.firstSeenAt)}</span>
                        <span>→</span>
                        <span>{formatFactualDate(sib.lastSeenAt)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Transparency */}
        {activeTab === "transparency" && (
          <div className="flex flex-col gap-6 text-xs">
            {hasEu || hasUk || reachedCountries.length > 0 || targetCountries.length > 0 ? (
              <>
                {/* Regional Reach Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {hasEu && (
                    <div className="flex flex-col gap-1.5 p-3.5 bg-[#0c0e14] border border-[#202636] rounded-[3px]">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[#f3f4f6] font-medium text-xs">
                          EU Transparency Disclosure
                        </span>
                        <span className="px-1.5 py-0.5 bg-[#12151b] border border-[#2a303f] font-mono text-[10px] text-[#8e95a2] rounded-[2px]">
                          EU Disclosure
                        </span>
                      </div>
                      <div className="pt-2">
                        <span className="text-[10px] font-mono text-[#8e95a2] uppercase tracking-wider block">
                          Total Regional Reach
                        </span>
                        <span className="font-mono text-lg text-[#f3f4f6] font-medium">
                          {euReach !== null && euReach > 0
                            ? formatCompactNumber(euReach)
                            : "Disclosed (Reach unavailable)"}
                        </span>
                      </div>
                    </div>
                  )}

                  {hasUk && (
                    <div className="flex flex-col gap-1.5 p-3.5 bg-[#0c0e14] border border-[#1e222d] rounded-[3px]">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[#f3f4f6] font-medium text-xs">
                          UK Transparency Disclosure
                        </span>
                        <span className="px-1.5 py-0.5 bg-[#12151b] border border-[#1e222d] font-mono text-[10px] text-[#8e95a2] rounded-[2px]">
                          UK Disclosure
                        </span>
                      </div>
                      <div className="pt-2">
                        <span className="text-[10px] font-mono text-[#8e95a2] uppercase tracking-wider block">
                          Total Regional Reach
                        </span>
                        <span className="font-mono text-lg text-[#f3f4f6] font-medium">
                          {ukReach !== null && ukReach > 0
                            ? formatCompactNumber(ukReach)
                            : "Disclosed (Reach unavailable)"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Demographics & Targeting */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(targetAgeMin !== null || targetAgeMax !== null || targetGender) && (
                    <div className="flex flex-col gap-1.5 p-3 bg-[#0c0e14] border border-[#161820] rounded-[3px]">
                      <span className="font-mono text-[#8e95a2] uppercase tracking-wider text-[10px]">
                        Target Demographics
                      </span>
                      <div className="flex flex-col gap-1 text-xs text-[#f3f4f6]">
                        {(targetAgeMin !== null || targetAgeMax !== null) && (
                          <span>
                            Age: {targetAgeMin ?? "Any"}–{targetAgeMax ?? "120+"}
                          </span>
                        )}
                        {targetGender && (
                          <span className="capitalize">Gender: {targetGender.toLowerCase()}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {reachedCountries.length > 0 && (
                    <div className="flex flex-col gap-1.5 p-3 bg-[#0c0e14] border border-[#161820] rounded-[3px]">
                      <span className="font-mono text-[#8e95a2] uppercase tracking-wider text-[10px]">
                        Reached Countries ({reachedCountries.length})
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {reachedCountries.map((c) => (
                          <span
                            key={c}
                            className="px-1.5 py-0.5 bg-[#12151b] border border-[#1a1d25] font-mono text-[10px] text-[#f3f4f6] rounded-[2px]"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="p-6 text-center text-xs text-[#686e7b] bg-[#0c0e14] border border-[#161820] rounded-[3px]">
                No regional regulatory transparency disclosures were recorded for this ad.
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Advertiser */}
        {activeTab === "advertiser" && (
          <div className="flex flex-col gap-6 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {pageCategory && (
                <div className="flex flex-col gap-1 p-3 bg-[#0c0e14] border border-[#161820] rounded-[3px]">
                  <span className="font-mono text-[#8e95a2] uppercase tracking-wider text-[10px]">
                    Meta Page Category
                  </span>
                  <span className="text-sm font-medium text-[#f3f4f6]">{pageCategory}</span>
                  <span className="text-[10px] text-[#686e7b] leading-tight pt-1">
                    Advertiser Page category, not an ad classification.
                  </span>
                </div>
              )}

              {(instagramFollowers !== null || instagramUsername) && (
                <div className="flex flex-col gap-1 p-3 bg-[#0c0e14] border border-[#161820] rounded-[3px]">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[#8e95a2] uppercase tracking-wider text-[10px]">
                      Instagram Profile
                    </span>
                    {instagramVerified && (
                      <span className="px-1.5 py-0.2 bg-[#12151b] border border-[#202636] font-mono text-[9px] text-[#8e95a2] rounded-[2px]">
                        Verified
                      </span>
                    )}
                  </div>
                  {instagramUsername && (
                    <span className="text-xs text-[#9da2ad] font-mono">@{instagramUsername}</span>
                  )}
                  {instagramFollowers !== null && (
                    <span className="font-mono text-sm text-[#f3f4f6] font-medium tabular-nums">
                      {formatCompactNumber(instagramFollowers)} followers
                    </span>
                  )}
                </div>
              )}

              {facebookLikes !== null && (
                <div className="flex flex-col gap-1 p-3 bg-[#0c0e14] border border-[#161820] rounded-[3px]">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[#8e95a2] uppercase tracking-wider text-[10px]">
                      Facebook Page
                    </span>
                    {facebookVerified && (
                      <span className="px-1.5 py-0.2 bg-[#12151b] border border-[#202636] font-mono text-[9px] text-[#8e95a2] rounded-[2px]">
                        Verified
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-sm text-[#f3f4f6] font-medium tabular-nums">
                    {formatCompactNumber(facebookLikes)} page likes
                  </span>
                </div>
              )}
            </div>

            {aboutText && (
              <div className="flex flex-col gap-1.5 p-3.5 bg-[#0c0e14] border border-[#161820] rounded-[3px]">
                <span className="font-mono text-[#8e95a2] uppercase tracking-wider text-[10px]">
                  About Advertiser
                </span>
                <p className="text-xs text-[#9da2ad] leading-relaxed whitespace-pre-line font-sans">
                  {aboutText}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Quiet Source & Media Details Section */}
      <div className="pt-6 border-t border-[#16181f] flex flex-col gap-4">
        <h4 className="font-mono text-xs text-[#8e95a2] uppercase tracking-wider">
          Source & Media Specifications
        </h4>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-mono text-[#686e7b] uppercase">Format</span>
            <span className="font-mono text-[#f3f4f6]">{item.displayFormat || "Unknown"}</span>
          </div>

          {width && height && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-mono text-[#686e7b] uppercase">Resolution</span>
              <span className="font-mono text-[#f3f4f6]">{width} × {height} px</span>
            </div>
          )}

          {commonRatio && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-mono text-[#686e7b] uppercase">Aspect Ratio</span>
              <span className="font-mono text-[#f3f4f6]">{commonRatio}</span>
            </div>
          )}

          {durationText && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-mono text-[#686e7b] uppercase">Duration</span>
              <span className="font-mono text-[#f3f4f6]">{durationText}</span>
            </div>
          )}
        </div>

        {item.adLibraryUrl && (
          <div className="pt-2">
            <a
              href={item.adLibraryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-sans text-[#8e95a2] hover:text-[#e07945] transition-colors"
            >
              <span>View Source in Meta Ad Library</span>
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
