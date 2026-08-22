"use client";

import {
  CheckboxList,
  CheckboxListItem,
  Popover,
} from "@/components/ui/astryx";
import type {
  DiscoveryFacetsResult,
  DiscoveryFilterInput,
} from "@/discovery/filters/types";
import { countryLabel } from "./country-labels";

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
    <div className="flex flex-col gap-4 p-1 max-h-[70vh] overflow-y-auto font-sans">
      {showReached && (
        <div className="flex flex-col">
          <SectionHeading>Reached Countries (Delivery)</SectionHeading>
          <CheckboxList
            label="Reached Countries"
            isLabelHidden
            density="compact"
            value={activeReached}
            onChange={(values) => {
              const diff = [
                ...activeReached.filter((v) => !values.includes(v)),
                ...values.filter((v) => !activeReached.includes(v)),
              ];
              diff.forEach((d) => onToggleReachedCountry(d));
            }}
          >
            {reachedOptions.map((ro) => (
              <CheckboxListItem
                key={ro.value}
                label={ro.label}
                value={ro.value}
                endContent={<CountBadge count={ro.count} />}
              />
            ))}
          </CheckboxList>
        </div>
      )}

      {showTarget && (
        <div className="flex flex-col">
          <SectionHeading>Targeted Countries (Declared)</SectionHeading>
          <CheckboxList
            label="Targeted Countries"
            isLabelHidden
            density="compact"
            value={activeTarget}
            onChange={(values) => {
              const diff = [
                ...activeTarget.filter((v) => !values.includes(v)),
                ...values.filter((v) => !activeTarget.includes(v)),
              ];
              diff.forEach((d) => onToggleTargetCountry(d));
            }}
          >
            {targetOptions.map((to) => (
              <CheckboxListItem
                key={to.value}
                label={to.label}
                value={to.value}
                endContent={<CountBadge count={to.count} />}
              />
            ))}
          </CheckboxList>
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

  const showReached = facets.reachedCountries.length > 0 || activeReached.length > 0;
  const showTarget = facets.targetCountries.length > 0 || activeTarget.length > 0;

  if (!showReached && !showTarget && totalSelected === 0) {
    return null;
  }

  return (
    <Popover
      label="Geography"
      placement="below"
      alignment="start"
      width={300}
      content={
        <GeographyFilterContent
          facets={facets}
          filter={filter}
          onToggleReachedCountry={onToggleReachedCountry}
          onToggleTargetCountry={onToggleTargetCountry}
        />
      }
    >
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-sans border transition-colors cursor-pointer rounded-[3px] ${
          totalSelected > 0
            ? "border-[#d46b38] bg-[#d46b3810] text-[#f3f4f6]"
            : "border-[#1e222d] text-[#9da2ad] hover:border-[#2a2f3d] hover:text-[#c5c9d4] bg-[#090b10]"
        }`}
        aria-label={`Filter by Geography (${totalSelected} active)`}
      >
        <span>{triggerLabel}</span>
        <span className="text-[10px] text-[#686e7b]" aria-hidden="true">▾</span>
      </button>
    </Popover>
  );
}
