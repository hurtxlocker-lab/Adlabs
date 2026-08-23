"use client";

/**
 * FilterRail — Compact primary desktop discovery filter rail.
 *
 * Composes consolidated dropdown groups:
 *  - CREATIVE: Format (Video, Image, DCO) + Shape (Portrait, Square, Landscape, Story)
 *  - RUNNING: Longevity bands (> 30d, > 90d, etc.)
 *  - REUSE: Creative reuse bands (×2+, ×4+, etc.)
 *  - GEOGRAPHY: Reached countries (Delivery) + Target countries (Declared)
 *  - EVIDENCE: EU transparency + contextual EU reach + UK evidence
 *  - MORE FILTERS: Reuse, CTA, Platform, IG followers
 *  - SORT: Current supported sort modes
 *
 * Reduces permanent rail height while keeping interactive multi-select semantics.
 */

import type {
  DiscoveryFacetsResult,
  DiscoveryFilterInput,
  DiscoverySort,
} from "@/discovery/filters/types";
import type { CreativeShapeFamily } from "@/features/discover/utils/creative-shape";
import { BandSelectFilter } from "./band-select-filter";
import { CreativeFilterPopover } from "./creative-filter-popover";
import { BrandFilterPopover } from "./brand-filter-popover";
import { CategoryFilterPopover } from "./category-filter-popover";
import { GeographyFilterPopover } from "./geography-filter-popover";
import { EvidenceFilterPopover } from "./evidence-filter-popover";
import { SortControl } from "./sort-control";
import {
  detectRunningBandKey,
  RUNNING_BANDS,
} from "./bands";

export interface FilterRailProps {
  facets: DiscoveryFacetsResult;
  filter: DiscoveryFilterInput;
  currentSort: DiscoverySort;
  moreFilters: React.ReactNode;
  brandNameMap?: Record<string, string>;
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
  brandNameMap,
  onToggleStringArray,
  onSetBoolean,
  onSetRange,
  onClearRange,
  onSort,
}: FilterRailProps) {
  const runningKey = detectRunningBandKey(filter);

  const handleRunningSelect = (key: string | null) => {
    if (!key) {
      onClearRange("runningMinDays", "runningMaxDays");
      return;
    }
    const band = RUNNING_BANDS.find((b) => b.key === key);
    if (!band) return;
    onSetRange("runningMinDays", "runningMaxDays", band.minDays, band.maxDays);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* 1. CREATIVE (Format + Shape Popover) */}
      <CreativeFilterPopover
        facets={facets}
        filter={filter}
        onToggleFormat={(fmt) => onToggleStringArray("mediaTypes", fmt)}
        onToggleShape={(shape: CreativeShapeFamily) =>
          onToggleStringArray("shapeFamilies", shape)
        }
      />

      {/* 2. BRAND (Searchable Multi-Select Popover) */}
      <BrandFilterPopover
        facets={facets}
        filter={filter}
        brandNameMap={brandNameMap}
        onToggleBrand={(brandId) => onToggleStringArray("brandIds", brandId)}
      />

      {/* 3. CATEGORY (Advertiser Page Category Popover) */}
      <CategoryFilterPopover
        facets={facets}
        filter={filter}
        onToggleCategory={(category) =>
          onToggleStringArray("pageCategories", category)
        }
      />

      {/* 4. RUNNING (Longevity Band Selector) */}
      <BandSelectFilter
        id="running-filter"
        label="Running"
        options={RUNNING_BANDS.map((b) => ({ key: b.key, label: b.label }))}
        selectedKey={runningKey}
        onSelect={handleRunningSelect}
      />

      {/* 5. GEOGRAPHY (Reached + Targeted Countries Popover) */}
      <GeographyFilterPopover
        facets={facets}
        filter={filter}
        onToggleReachedCountry={(c) => onToggleStringArray("reachedCountries", c)}
        onToggleTargetCountry={(c) => onToggleStringArray("targetCountries", c)}
      />

      {/* 6. EVIDENCE (EU / UK Transparency Popover) */}
      <EvidenceFilterPopover
        facets={facets}
        filter={filter}
        onSetBoolean={onSetBoolean}
        onSetRange={onSetRange}
        onClearRange={onClearRange}
      />

      {/* 7. MORE FILTERS (Reuse, CTA, Platform, IG Followers, UK) */}
      {moreFilters}

      {/* 8. SORT (Right-aligned) */}
      <div className="ml-auto">
        <SortControl value={currentSort} onChange={onSort} />
      </div>
    </div>
  );
}
