"use client";

/**
 * FilterPanel — Evidence-driven discovery filter controls.
 *
 * Visual tone: editorial index / archive instrument / cultural catalogue.
 * Controls reflect evidence density from facets.
 */

import { useCallback, useOptimistic, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type {
  DiscoveryFacetsResult,
  DiscoveryFilterInput,
  DiscoverySort,
} from "@/discovery/filters/types";
import {
  buildDiscoveryFilterParams,
  clearAllDiscoveryFilterParams,
  parseDiscoveryFiltersFromParams,
  parseSortFromParams,
} from "../utils/url-filters";
import { FilterRail } from "./filters/filter-rail";
import { MoreFiltersPopover } from "./filters/more-filters";
import { ActiveFilterTokens } from "./filters/active-filter-tokens";
import { deriveActiveTokens } from "./filters/tokens";
import { SortControl } from "./filters/sort-control";

export interface FilterPanelProps {
  facets: DiscoveryFacetsResult;
  totalCount: number;
  totalAdsCount?: number;
  brandNameMap?: Record<string, string>;
}

export function FilterPanel({
  facets,
  totalCount,
  totalAdsCount,
  brandNameMap,
}: FilterPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Parse canonical filter state from URL (source of truth)
  const urlFilter = parseDiscoveryFiltersFromParams(searchParams);
  const urlSort = parseSortFromParams(searchParams) ?? "EXPLORE";

  // React 19 native useOptimistic for immediate control responsiveness (<5ms)
  const [optimisticFilter, setOptimisticFilter] = useOptimistic(
    urlFilter,
    (_current, next: DiscoveryFilterInput) => next,
  );
  const [optimisticSort, setOptimisticSort] = useOptimistic(
    urlSort,
    (_current, next: DiscoverySort) => next,
  );

  // ---------------------------------------------------------------------------
  // URL mutation helpers with immediate optimistic update
  // ---------------------------------------------------------------------------

  const applyFilter = useCallback(
    (nextFilter: DiscoveryFilterInput, nextSort?: DiscoverySort) => {
      const targetSort = nextSort ?? optimisticSort;
      const params = buildDiscoveryFilterParams(nextFilter, targetSort);
      startTransition(() => {
        setOptimisticFilter(nextFilter);
        if (nextSort) setOptimisticSort(nextSort);
        router.replace(`${pathname}?${params.toString()}`);
      });
    },
    [router, pathname, optimisticSort, setOptimisticFilter, setOptimisticSort],
  );

  const updateFilter = useCallback(
    (patch: Partial<DiscoveryFilterInput>) => {
      applyFilter({ ...optimisticFilter, ...patch });
    },
    [applyFilter, optimisticFilter],
  );

  const applySort = useCallback(
    (sort: DiscoverySort) => {
      applyFilter(optimisticFilter, sort);
    },
    [applyFilter, optimisticFilter],
  );

  const clearAll = useCallback(() => {
    const params = clearAllDiscoveryFilterParams();
    startTransition(() => {
      setOptimisticFilter({});
      router.replace(`${pathname}?${params.toString()}`);
    });
  }, [router, pathname, setOptimisticFilter]);

  const toggleStringArray = useCallback(
    (key: keyof DiscoveryFilterInput, value: string) => {
      const current = (optimisticFilter[key] as string[] | undefined) ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      updateFilter({ [key]: next.length > 0 ? next : undefined });
    },
    [optimisticFilter, updateFilter],
  );

  const setStringArray = useCallback(
    (key: keyof DiscoveryFilterInput, values: string[]) => {
      updateFilter({ [key]: values.length > 0 ? values : undefined });
    },
    [updateFilter],
  );

  const toggleBoolean = useCallback(
    (key: keyof DiscoveryFilterInput, value: boolean) => {
      const current = optimisticFilter[key];
      updateFilter({ [key]: current === value ? undefined : value });
    },
    [optimisticFilter, updateFilter],
  );

  const setBoolean = useCallback(
    (key: keyof DiscoveryFilterInput, checked: boolean) => {
      updateFilter({ [key]: checked ? true : undefined });
    },
    [updateFilter],
  );

  const setRange = useCallback(
    (
      minKey: keyof DiscoveryFilterInput,
      maxKey: keyof DiscoveryFilterInput,
      min: number | undefined,
      max: number | undefined,
    ) => {
      updateFilter({ [minKey]: min, [maxKey]: max });
    },
    [updateFilter],
  );

  const clearRange = useCallback(
    (minKey: keyof DiscoveryFilterInput, maxKey: keyof DiscoveryFilterInput) => {
      const next = { ...optimisticFilter };
      delete next[minKey as never];
      delete next[maxKey as never];
      applyFilter(next);
    },
    [optimisticFilter, applyFilter],
  );

  const clearSingle = useCallback(
    (key: keyof DiscoveryFilterInput) => {
      const next = { ...optimisticFilter };
      delete next[key as never];
      applyFilter(next);
    },
    [optimisticFilter, applyFilter],
  );

  const currentFilter = optimisticFilter;
  const currentSort = optimisticSort;

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const tokens = deriveActiveTokens(
    currentFilter,
    facets,
    {
      toggleStringArray,
      toggleBoolean,
      clearRange,
      clearSingle,
    },
    brandNameMap,
  );

  const moreFiltersContentProps = {
    facets,
    filter: currentFilter,
    onSetStringArray: setStringArray,
    onSetBoolean: setBoolean,
    onSetRange: setRange,
    onClearRange: clearRange,
  };

  const moreActiveCount =
    (currentFilter.ctaTypes?.length ?? 0) +
    (currentFilter.publisherPlatforms?.length ?? 0) +
    (currentFilter.targetCountries?.length ?? 0) +
    (currentFilter.exactCreativeReuseMin !== undefined ? 1 : 0) +
    (currentFilter.instagramFollowersMin !== undefined ? 1 : 0) +
    (currentFilter.hasUkTransparencyEvidence === true ? 1 : 0);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="w-full font-sans" data-testid="filter-panel">
      {/* Desktop primary rail */}
      <div className="hidden lg:flex flex-col gap-4">
        <FilterRail
          facets={facets}
          filter={currentFilter}
          currentSort={currentSort}
          brandNameMap={brandNameMap}
          onToggleStringArray={toggleStringArray}
          onSetBoolean={setBoolean}
          onSetRange={setRange}
          onClearRange={clearRange}
          onSort={applySort}
          moreFilters={
            <MoreFiltersPopover
              {...moreFiltersContentProps}
              triggerLabel="More filters"
              badgeCount={moreActiveCount}
            />
          }
        />
      </div>

      {/* Mobile compact row */}
      <div className="lg:hidden flex flex-wrap items-center gap-3 mb-4">
        <MoreFiltersPopover
          {...moreFiltersContentProps}
          triggerLabel="Filters"
          badgeCount={tokens.length}
        />
        <span className="text-[11px] font-mono text-[#686e7b]">
          Showing {totalCount.toLocaleString()}
        </span>
        <div className="ml-auto">
          <SortControl value={currentSort} onChange={applySort} />
        </div>
      </div>

      {/* Active filter tokens + count */}
      <ActiveFilterTokens
        tokens={tokens}
        totalCount={totalCount}
        totalAdsCount={totalAdsCount}
        onClearAll={clearAll}
      />
    </div>
  );
}
