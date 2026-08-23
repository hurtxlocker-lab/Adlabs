"use client";

import type {
  DiscoveryFacetsResult,
  DiscoveryFilterInput,
} from "@/discovery/filters/types";
import {
  currentEuReachBandKey,
  euReachBandToFilterRange,
  type EuReachBandKey,
} from "@/features/discover/utils/url-filters";
import { NativePopover } from "./native-popover";

export interface EvidenceFilterContentProps {
  facets: DiscoveryFacetsResult;
  filter: DiscoveryFilterInput;
  onSetBoolean: (key: keyof DiscoveryFilterInput, checked: boolean) => void;
  onSetRange: (
    minKey: keyof DiscoveryFilterInput,
    maxKey: keyof DiscoveryFilterInput,
    min: number | undefined,
    max: number | undefined,
  ) => void;
  onClearRange: (
    minKey: keyof DiscoveryFilterInput,
    maxKey: keyof DiscoveryFilterInput,
  ) => void;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[10px] font-sans tracking-widest uppercase text-[#686e7b] select-none mb-1.5">
      {children}
    </h4>
  );
}

export function EvidenceFilterContent({
  facets,
  filter,
  onSetBoolean,
  onSetRange,
  onClearRange,
}: EvidenceFilterContentProps) {
  const euCount = facets.transparencyEvidence.EU.true;
  const ukCount = facets.transparencyEvidence.UK.true;

  const hasEuSelected = filter.hasEuTransparencyEvidence === true;
  const hasUkSelected = filter.hasUkTransparencyEvidence === true;
  const euReachKey = currentEuReachBandKey(filter);

  const showEu = euCount > 0 || hasEuSelected;
  const showUk = ukCount > 0 || hasUkSelected;
  const showEuReach = showEu || euReachKey !== null;

  const euReachOptions = facets.euReachBands
    .filter((b) => b.count > 0 || b.key === euReachKey)
    .map((b) => ({ key: b.key, label: b.label }));

  const handleEuReachSelect = (key: string) => {
    if (!key) {
      onClearRange("euReachMin", "euReachMax");
      return;
    }
    const range = euReachBandToFilterRange(key as EuReachBandKey);
    onSetRange("euReachMin", "euReachMax", range.euReachMin, range.euReachMax);
  };

  return (
    <div className="flex flex-col gap-4 font-sans">
      {showEu && (
        <div className="flex flex-col gap-2.5">
          <SectionHeading>European Union (EU)</SectionHeading>
          <label className="flex items-center justify-between gap-2 px-1.5 py-1 text-xs text-[#9da2ad] hover:text-[#f3f4f6] hover:bg-[#12151c] rounded-[2px] cursor-pointer select-none transition-colors">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={hasEuSelected}
                onChange={(e) =>
                  onSetBoolean("hasEuTransparencyEvidence", e.target.checked)
                }
                className="accent-[#d46b38] w-3.5 h-3.5 rounded-[2px] cursor-pointer"
              />
              <span className={hasEuSelected ? "text-[#f3f4f6] font-medium" : ""}>
                EU transparency evidence
              </span>
            </div>
            <span className="font-mono text-[10px] text-[#686e7b]">{euCount}</span>
          </label>

          {showEuReach && euReachOptions.length > 0 && (
            <div className="flex flex-col gap-1 mt-1 pl-1">
              <label htmlFor="eu-reach-select" className="text-[11px] text-[#686e7b]">
                EU reach band
              </label>
              <div className="relative inline-block">
                <select
                  id="eu-reach-select"
                  value={euReachKey ?? ""}
                  onChange={(e) => handleEuReachSelect(e.target.value)}
                  className="w-full appearance-none bg-[#0c0e14] border border-[#1e222d] hover:border-[#2a2f3d] focus:border-[#d46b38] focus:outline-none text-xs text-[#f3f4f6] rounded-[3px] px-2.5 py-1 pr-7 cursor-pointer transition-colors"
                  aria-label="Filter by EU reach band"
                >
                  <option value="" className="bg-[#0c0e14] text-[#9da2ad]">
                    Any reach
                  </option>
                  {euReachOptions.map((o) => (
                    <option key={o.key} value={o.key} className="bg-[#0c0e14] text-[#f3f4f6]">
                      {o.label}
                    </option>
                  ))}
                </select>
                <span
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#686e7b]"
                  aria-hidden="true"
                >
                  ▾
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {showUk && (
        <div className="flex flex-col gap-2">
          <SectionHeading>United Kingdom (UK)</SectionHeading>
          <label className="flex items-center justify-between gap-2 px-1.5 py-1 text-xs text-[#9da2ad] hover:text-[#f3f4f6] hover:bg-[#12151c] rounded-[2px] cursor-pointer select-none transition-colors">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={hasUkSelected}
                onChange={(e) =>
                  onSetBoolean("hasUkTransparencyEvidence", e.target.checked)
                }
                className="accent-[#d46b38] w-3.5 h-3.5 rounded-[2px] cursor-pointer"
              />
              <span className={hasUkSelected ? "text-[#f3f4f6] font-medium" : ""}>
                UK transparency evidence
              </span>
            </div>
            <span className="font-mono text-[10px] text-[#686e7b]">{ukCount}</span>
          </label>
        </div>
      )}
    </div>
  );
}

export function EvidenceFilterPopover({
  facets,
  filter,
  onSetBoolean,
  onSetRange,
  onClearRange,
}: EvidenceFilterContentProps) {
  const euCount = facets.transparencyEvidence.EU.true;
  const ukCount = facets.transparencyEvidence.UK.true;

  const hasEuSelected = filter.hasEuTransparencyEvidence === true;
  const hasUkSelected = filter.hasUkTransparencyEvidence === true;
  const euReachKey = currentEuReachBandKey(filter);

  let activeCount = 0;
  if (hasEuSelected) activeCount++;
  if (hasUkSelected) activeCount++;
  if (euReachKey) activeCount++;

  let triggerLabel = "Evidence";
  if (activeCount === 1) {
    if (hasEuSelected) triggerLabel = "EU Evidence";
    else if (hasUkSelected) triggerLabel = "UK Evidence";
    else if (euReachKey) triggerLabel = `EU Reach`;
  } else if (activeCount > 1) {
    triggerLabel = `Evidence · ${activeCount}`;
  }

  const showEu = euCount > 0 || hasEuSelected;
  const showUk = ukCount > 0 || hasUkSelected;

  if (!showEu && !showUk && activeCount === 0) {
    return null;
  }

  return (
    <NativePopover
      width={300}
      trigger={({ isOpen, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-sans border transition-colors cursor-pointer rounded-[3px] ${
            activeCount > 0
              ? "border-[#d46b38] bg-[#d46b3810] text-[#f3f4f6]"
              : "border-[#1e222d] text-[#9da2ad] hover:border-[#2a2f3d] hover:text-[#c5c9d4] bg-[#090b10]"
          }`}
          aria-label={`Filter by Evidence (${activeCount} active)`}
        >
          <span>{triggerLabel}</span>
          <span className="text-[10px] text-[#686e7b]" aria-hidden="true">
            ▾
          </span>
        </button>
      )}
    >
      {() => (
        <EvidenceFilterContent
          facets={facets}
          filter={filter}
          onSetBoolean={onSetBoolean}
          onSetRange={onSetRange}
          onClearRange={onClearRange}
        />
      )}
    </NativePopover>
  );
}
