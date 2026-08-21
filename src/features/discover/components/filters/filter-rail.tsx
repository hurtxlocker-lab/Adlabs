"use client";

/**
 * FilterRail — the desktop primary rail.
 *
 * Composes the primary controls (Format, Shape, Running time, Creative reuse,
 * Reached country, Transparency with contextual EU reach, More filters, Sort).
 * EU reach is contextual INSIDE the Transparency interaction and is never a
 * permanent sibling.
 *
 * Visibility is facet-driven: zero-evidence controls/families hide unless an
 * active URL selection requires preserving them.
 */

import type {
  DiscoveryFacetsResult,
  DiscoveryFilterInput,
  DiscoverySort,
} from "@/discovery/filters/types";
import { CREATIVE_REUSE_BANDS } from "@/discovery/filters/bands";
import {
  currentEuReachBandKey,
  euReachBandToFilterRange,
  type EuReachBandKey,
} from "../../utils/url-filters";
import { CheckboxGroupFilter } from "./checkbox-group-filter";
import { BandSelectFilter } from "./band-select-filter";
import { TransparencyFilter } from "./transparency-filter";
import { SortControl } from "./sort-control";
import {
  detectRunningBandKey,
  detectReuseBandKey,
  REUSE_BAND_LABELS,
  RUNNING_BANDS,
} from "./bands";
import { countryLabel } from "./country-labels";

export interface FilterRailProps {
  facets: DiscoveryFacetsResult;
  filter: DiscoveryFilterInput;
  currentSort: DiscoverySort;
  moreFilters: React.ReactNode;
  onToggleStringArray: (key: keyof DiscoveryFilterInput, value: string) => void;
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
  onSort: (sort: DiscoverySort) => void;
}

export function FilterRail({
  facets,
  filter,
  currentSort,
  moreFilters,
  onToggleStringArray,
  onSetBoolean,
  onSetRange,
  onClearRange,
  onSort,
}: FilterRailProps) {
  const activeFormats = filter.mediaTypes ?? [];
  const activeShapes = filter.shapeFamilies ?? [];
  const activeReached = filter.reachedCountries ?? [];

  const euCount = facets.transparencyEvidence.EU.true;
  const showEuTransparency =
    euCount > 0 || filter.hasEuTransparencyEvidence === true;
  const showReached =
    facets.reachedCountries.length > 0 || activeReached.length > 0;

  const runningKey = detectRunningBandKey(filter);
  const reuseKey = detectReuseBandKey(filter);
  const euReachKey = currentEuReachBandKey(filter);

  const reuseOptions = facets.creativeReuseBands
    .filter((b) => b.count > 0 || b.key === reuseKey)
    .map((b) => ({
      key: b.key,
      label: REUSE_BAND_LABELS[b.key] ?? b.label,
    }));

  const euReachOptions = facets.euReachBands
    .filter((b) => b.count > 0 || b.key === euReachKey)
    .map((b) => ({ key: b.key, label: b.label }));

  // EU reach is contextual: shown when EU evidence exists or a reach band is selected.
  const showEuReach = euCount > 0 || euReachKey !== null;

  const handleRunningSelect = (key: string | null) => {
    if (!key) {
      onClearRange("runningMinDays", "runningMaxDays");
      return;
    }
    const band = RUNNING_BANDS.find((b) => b.key === key);
    if (!band) return;
    onSetRange("runningMinDays", "runningMaxDays", band.minDays, band.maxDays);
  };

  const handleReuseSelect = (key: string | null) => {
    if (!key) {
      onClearRange("exactCreativeReuseMin", "exactCreativeReuseMax");
      return;
    }
    const band = CREATIVE_REUSE_BANDS.find((b) => b.key === key);
    if (!band) return;
    const min = Number(band.min);
    const max = band.max === null ? undefined : Number(band.max) - 1;
    onSetRange("exactCreativeReuseMin", "exactCreativeReuseMax", min, max);
  };

  const handleEuReachSelect = (key: string | null) => {
    if (!key) {
      onClearRange("euReachMin", "euReachMax");
      return;
    }
    const range = euReachBandToFilterRange(key as EuReachBandKey);
    onSetRange("euReachMin", "euReachMax", range.euReachMin, range.euReachMax);
  };

  return (
    <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
      <CheckboxGroupFilter
        id="format-filter"
        label="Format"
        options={facets.mediaTypes.map((mt) => ({
          value: mt.value,
          label: mt.value.charAt(0) + mt.value.slice(1).toLowerCase(),
          count: mt.count,
        }))}
        selected={activeFormats}
        onToggle={(v) => onToggleStringArray("mediaTypes", v)}
      />

      <CheckboxGroupFilter
        id="shape-filter"
        label="Shape"
        options={facets.shapeFamilies.map((sf) => ({
          value: sf.value,
          label: sf.value.charAt(0).toUpperCase() + sf.value.slice(1),
          count: sf.count,
        }))}
        selected={activeShapes}
        onToggle={(v) => onToggleStringArray("shapeFamilies", v)}
      />

      <BandSelectFilter
        id="running-filter"
        label="Running time"
        options={RUNNING_BANDS.map((b) => ({ key: b.key, label: b.label }))}
        selectedKey={runningKey}
        onSelect={handleRunningSelect}
      />

      <BandSelectFilter
        id="reuse-filter"
        label="Creative reuse"
        options={reuseOptions}
        selectedKey={reuseKey}
        onSelect={handleReuseSelect}
      />

      {showReached && (
        <CheckboxGroupFilter
          id="reached-filter"
          label="Reached"
          options={[
            ...facets.reachedCountries.map((rc) => ({
              value: rc.value,
              label: countryLabel(rc.value),
              count: rc.count,
            })),
            // Preserve selected countries that fall to 0 under other filters.
            ...activeReached
              .filter((c) => !facets.reachedCountries.some((r) => r.value === c))
              .map((c) => ({ value: c, label: countryLabel(c), count: 0 })),
          ]}
          selected={activeReached}
          onToggle={(v) => onToggleStringArray("reachedCountries", v)}
        />
      )}

      {showEuTransparency && (
        <TransparencyFilter
          euSelected={filter.hasEuTransparencyEvidence === true}
          euCount={euCount}
          showEuReach={showEuReach}
          euReachOptions={euReachOptions}
          euReachSelectedKey={euReachKey}
          onEuToggle={(checked) =>
            onSetBoolean("hasEuTransparencyEvidence", checked)
          }
          onEuReachSelect={handleEuReachSelect}
        />
      )}

      {moreFilters}

      <div className="ml-auto">
        <SortControl value={currentSort} onChange={onSort} />
      </div>
    </div>
  );
}
