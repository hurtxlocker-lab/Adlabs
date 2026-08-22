"use client";

import {
  Popover,
  Selector,
  Switch,
} from "@/components/ui/astryx";
import type {
  DiscoveryFacetsResult,
  DiscoveryFilterInput,
} from "@/discovery/filters/types";
import {
  currentEuReachBandKey,
  euReachBandToFilterRange,
  type EuReachBandKey,
} from "@/features/discover/utils/url-filters";

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

  const handleEuReachSelect = (key: string | null) => {
    if (!key) {
      onClearRange("euReachMin", "euReachMax");
      return;
    }
    const range = euReachBandToFilterRange(key as EuReachBandKey);
    onSetRange("euReachMin", "euReachMax", range.euReachMin, range.euReachMax);
  };

  return (
    <div className="flex flex-col gap-4 p-1 max-h-[70vh] overflow-y-auto font-sans">
      {showEu && (
        <div className="flex flex-col gap-2.5">
          <SectionHeading>European Union (EU)</SectionHeading>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#9da2ad]">
              EU transparency evidence ({euCount})
            </span>
            <Switch
              label={`EU evidence (${euCount})`}
              isLabelHidden
              size="sm"
              value={hasEuSelected}
              onChange={(checked) =>
                onSetBoolean("hasEuTransparencyEvidence", checked)
              }
            />
          </div>

          {showEuReach && euReachOptions.length > 0 && (
            <div className="flex flex-col gap-1 mt-1">
              <span className="text-[11px] text-[#686e7b]">
                EU reach band
              </span>
              <Selector
                label="EU reach band"
                isLabelHidden
                size="sm"
                variant="input"
                hasClear
                placeholder="Any reach"
                options={euReachOptions.map((o) => ({
                  value: o.key,
                  label: o.label,
                }))}
                value={euReachKey}
                onChange={(val) => handleEuReachSelect(val as string | null)}
                className="w-full"
              />
            </div>
          )}
        </div>
      )}

      {showUk && (
        <div className="flex flex-col gap-2">
          <SectionHeading>United Kingdom (UK)</SectionHeading>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#9da2ad]">
              UK transparency evidence ({ukCount})
            </span>
            <Switch
              label={`UK evidence (${ukCount})`}
              isLabelHidden
              size="sm"
              value={hasUkSelected}
              onChange={(checked) =>
                onSetBoolean("hasUkTransparencyEvidence", checked)
              }
            />
          </div>
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
    <Popover
      label="Evidence"
      placement="below"
      alignment="start"
      width={300}
      content={
        <EvidenceFilterContent
          facets={facets}
          filter={filter}
          onSetBoolean={onSetBoolean}
          onSetRange={onSetRange}
          onClearRange={onClearRange}
        />
      }
    >
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-sans border transition-colors cursor-pointer rounded-[3px] ${
          activeCount > 0
            ? "border-[#d46b38] bg-[#d46b3810] text-[#f3f4f6]"
            : "border-[#1e222d] text-[#9da2ad] hover:border-[#2a2f3d] hover:text-[#c5c9d4] bg-[#090b10]"
        }`}
        aria-label={`Filter by Evidence (${activeCount} active)`}
      >
        <span>{triggerLabel}</span>
        <span className="text-[10px] text-[#686e7b]" aria-hidden="true">▾</span>
      </button>
    </Popover>
  );
}
