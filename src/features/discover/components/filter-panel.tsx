"use client";

/**
 * FilterPanel — Evidence-driven discovery filter controls.
 *
 * Visual tone: editorial index / archive instrument / cultural catalogue.
 * Not an analytics dashboard. Controls reflect evidence density from facets.
 *
 * Architecture (unchanged):
 * - This component is purely presentational. All filter logic lives in
 *   src/discovery/filters/. This component reads facets, renders controls,
 *   and updates the URL via useRouter.
 * - No SQL, no facet calculations, no client-side corpus queries.
 * - URL remains the source of truth; back/forward reproduces exact state.
 *
 * Interaction primitives:
 * - Multi-select (rail): native checkbox groups (role="group" + aria-labelledby)
 * - Single-select bands: Astryx Selector
 * - Booleans: Astryx Switch
 * - More Filters: Astryx Popover (focus trap, Escape/outside dismiss, restore)
 * - All Astryx imports live behind @/components/ui/astryx
 */

import { useCallback, useTransition } from "react";
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
import { AstryxScope } from "@/components/ui/astryx";
import { FilterRail } from "./filters/filter-rail";
import { MoreFiltersPopover } from "./filters/more-filters";
import { ActiveFilterTokens } from "./filters/active-filter-tokens";
import { deriveActiveTokens } from "./filters/tokens";
import { SortControl } from "./filters/sort-control";

export interface FilterPanelProps {
  facets: DiscoveryFacetsResult;
  totalCount: number;
}

export function FilterPanel({ facets, totalCount }: FilterPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Parse current filter state from URL (source of truth)
  const currentFilter = parseDiscoveryFiltersFromParams(searchParams);
  const currentSort = parseSortFromParams(searchParams) ?? "RECENTLY_SEEN";

  // ---------------------------------------------------------------------------
  // URL mutation helpers
  // ---------------------------------------------------------------------------

  const applyFilter = useCallback(
    (nextFilter: DiscoveryFilterInput, nextSort?: DiscoverySort) => {
      const params = buildDiscoveryFilterParams(
        nextFilter,
        nextSort ?? currentSort,
      );
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    },
    [router, pathname, currentSort],
  );

  const updateFilter = useCallback(
    (patch: Partial<DiscoveryFilterInput>) => {
      applyFilter({ ...currentFilter, ...patch });
    },
    [applyFilter, currentFilter],
  );

  const applySort = useCallback(
    (sort: DiscoverySort) => {
      applyFilter(currentFilter, sort);
    },
    [applyFilter, currentFilter],
  );

  const clearAll = useCallback(() => {
    const params = clearAllDiscoveryFilterParams();
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }, [router, pathname]);

  const toggleStringArray = useCallback(
    (key: keyof DiscoveryFilterInput, value: string) => {
      const current = (currentFilter[key] as string[] | undefined) ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      updateFilter({ [key]: next.length > 0 ? next : undefined });
    },
    [currentFilter, updateFilter],
  );

  const setStringArray = useCallback(
    (key: keyof DiscoveryFilterInput, values: string[]) => {
      updateFilter({ [key]: values.length > 0 ? values : undefined });
    },
    [updateFilter],
  );

  const toggleBoolean = useCallback(
    (key: keyof DiscoveryFilterInput, value: boolean) => {
      const current = currentFilter[key];
      updateFilter({ [key]: current === value ? undefined : value });
    },
    [currentFilter, updateFilter],
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
      const next = { ...currentFilter };
      delete next[minKey as never];
      delete next[maxKey as never];
      applyFilter(next);
    },
    [currentFilter, applyFilter],
  );

  const clearSingle = useCallback(
    (key: keyof DiscoveryFilterInput) => {
      const next = { ...currentFilter };
      delete next[key as never];
      applyFilter(next);
    },
    [currentFilter, applyFilter],
  );

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const tokens = deriveActiveTokens(currentFilter, facets, {
    toggleStringArray,
    toggleBoolean,
    clearRange,
    clearSingle,
  });

  const moreFiltersContentProps = {
    facets,
    filter: currentFilter,
    onSetStringArray: setStringArray,
    onSetBoolean: setBoolean,
    onSetRange: setRange,
    onClearRange: clearRange,
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="w-full font-sans" data-testid="filter-panel">
      <AstryxScope>
        {/* Desktop primary rail */}
        <div className="hidden lg:flex flex-col gap-4">
          <FilterRail
            facets={facets}
            filter={currentFilter}
            currentSort={currentSort}
            onToggleStringArray={toggleStringArray}
            onSetBoolean={setBoolean}
            onSetRange={setRange}
            onClearRange={clearRange}
            onSort={applySort}
            moreFilters={
              <MoreFiltersPopover
                {...moreFiltersContentProps}
                triggerLabel="More filters"
                badgeCount={tokens.length}
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
          onClearAll={clearAll}
        />
      </AstryxScope>
    </div>
  );
}
