"use client";

import type {
  DiscoveryFacetsResult,
  DiscoveryFilterInput,
} from "@/discovery/filters/types";
import { countryLabel } from "./country-labels";
import { NativePopover } from "./native-popover";

export interface GeographyFilterContentProps {
  facets: DiscoveryFacetsResult;
  filter: DiscoveryFilterInput;
  onToggleReachedCountry: (country: string) => void;
  onToggleTargetCountry: (country: string) => void;
}

function CountBadge({ count }: { count: number }) {
  return <span className="font-mono text-[10px] text-[#686e7b]">{count}</span>;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[10px] font-sans tracking-widest uppercase text-[#686e7b] select-none mb-1.5">
      {children}
    </h4>
  );
}

export function GeographyFilterContent({
  facets,
  filter,
  onToggleReachedCountry,
  onToggleTargetCountry,
}: GeographyFilterContentProps) {
  const activeReached = filter.reachedCountries ?? [];
  const activeTarget = filter.targetCountries ?? [];

  const reachedOptions = [
    ...facets.reachedCountries.map((rc) => ({
      value: rc.value,
      label: countryLabel(rc.value),
      count: rc.count,
    })),
    ...activeReached
      .filter((c) => !facets.reachedCountries.some((r) => r.value === c))
      .map((c) => ({ value: c, label: countryLabel(c), count: 0 })),
  ];

  const targetOptions = [
    ...facets.targetCountries.map((tc) => ({
      value: tc.value,
      label: countryLabel(tc.value),
      count: tc.count,
    })),
    ...activeTarget
      .filter((c) => !facets.targetCountries.some((t) => t.value === c))
      .map((c) => ({ value: c, label: countryLabel(c), count: 0 })),
  ];

  const showReached = reachedOptions.length > 0;
  const showTarget = targetOptions.length > 0;

  return (
    <div className="flex flex-col gap-4 font-sans">
      {showReached && (
        <div className="flex flex-col gap-1">
          <SectionHeading>Reached Countries (Delivery)</SectionHeading>
          <div className="overflow-y-auto max-h-[200px] flex flex-col gap-1 pr-1">
            {reachedOptions.map((ro) => {
              const isChecked = activeReached.includes(ro.value);
              return (
                <label
                  key={ro.value}
                  className="flex items-center justify-between gap-2 px-1.5 py-1 text-xs text-[#9da2ad] hover:text-[#f3f4f6] hover:bg-[#12151c] rounded-[2px] cursor-pointer select-none transition-colors"
                >
                  <div className="flex items-center gap-2 truncate">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggleReachedCountry(ro.value)}
                      className="accent-[#d46b38] w-3.5 h-3.5 rounded-[2px] cursor-pointer"
                    />
                    <span
                      className={`truncate ${isChecked ? "text-[#f3f4f6] font-medium" : ""}`}
                    >
                      {ro.label}
                    </span>
                  </div>
                  <CountBadge count={ro.count} />
                </label>
              );
            })}
          </div>
        </div>
      )}

      {showTarget && (
        <div className="flex flex-col gap-1">
          <SectionHeading>Targeted Countries (Declared)</SectionHeading>
          <div className="overflow-y-auto max-h-[200px] flex flex-col gap-1 pr-1">
            {targetOptions.map((to) => {
              const isChecked = activeTarget.includes(to.value);
              return (
                <label
                  key={to.value}
                  className="flex items-center justify-between gap-2 px-1.5 py-1 text-xs text-[#9da2ad] hover:text-[#f3f4f6] hover:bg-[#12151c] rounded-[2px] cursor-pointer select-none transition-colors"
                >
                  <div className="flex items-center gap-2 truncate">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggleTargetCountry(to.value)}
                      className="accent-[#d46b38] w-3.5 h-3.5 rounded-[2px] cursor-pointer"
                    />
                    <span
                      className={`truncate ${isChecked ? "text-[#f3f4f6] font-medium" : ""}`}
                    >
                      {to.label}
                    </span>
                  </div>
                  <CountBadge count={to.count} />
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function GeographyFilterPopover({
  facets,
  filter,
  onToggleReachedCountry,
  onToggleTargetCountry,
}: GeographyFilterContentProps) {
  const activeReached = filter.reachedCountries ?? [];
  const activeTarget = filter.targetCountries ?? [];
  const totalSelected = activeReached.length + activeTarget.length;

  let triggerLabel = "Geography";
  if (totalSelected === 1) {
    if (activeReached.length === 1) {
      triggerLabel = `Reached: ${countryLabel(activeReached[0])}`;
    } else if (activeTarget.length === 1) {
      triggerLabel = `Target: ${countryLabel(activeTarget[0])}`;
    }
  } else if (totalSelected > 0) {
    triggerLabel = `Geography · ${totalSelected}`;
  }

  const showReached =
    facets.reachedCountries.length > 0 || activeReached.length > 0;
  const showTarget =
    facets.targetCountries.length > 0 || activeTarget.length > 0;

  if (!showReached && !showTarget && totalSelected === 0) {
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
            totalSelected > 0
              ? "border-[#d46b38] bg-[#d46b3810] text-[#f3f4f6]"
              : "border-[#1e222d] text-[#9da2ad] hover:border-[#2a2f3d] hover:text-[#c5c9d4] bg-[#090b10]"
          }`}
          aria-label={`Filter by Geography (${totalSelected} active)`}
        >
          <span>{triggerLabel}</span>
          <span className="text-[10px] text-[#686e7b]" aria-hidden="true">
            ▾
          </span>
        </button>
      )}
    >
      {() => (
        <GeographyFilterContent
          facets={facets}
          filter={filter}
          onToggleReachedCountry={onToggleReachedCountry}
          onToggleTargetCountry={onToggleTargetCountry}
        />
      )}
    </NativePopover>
  );
}
