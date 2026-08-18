"use client";

/**
 * FilterPanel — Evidence-driven discovery filter controls.
 *
 * Visual tone: editorial index / archive instrument / cultural catalogue.
 * Not an analytics dashboard. Controls reflect evidence density from facets.
 *
 * Architecture:
 * - This component is purely presentational. All filter logic lives in
 *   src/discovery/filters/. This component reads facets, renders controls,
 *   and updates the URL via useRouter.
 * - No SQL, no facet calculations, no client-side corpus queries.
 */

import { useCallback, useState, useTransition, useId } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { DiscoveryFacetsResult } from "@/discovery/filters/types";
import type { DiscoveryFilterInput } from "@/discovery/filters/types";
import type { DiscoverySort } from "@/discovery/filters/types";
import {
  buildDiscoveryFilterParams,
  clearAllDiscoveryFilterParams,
  parseDiscoveryFiltersFromParams,
  parseSortFromParams,
} from "../utils/url-filters";
import { EU_REACH_BANDS, CREATIVE_REUSE_BANDS } from "@/discovery/filters/bands";

// ---------------------------------------------------------------------------
// Country label map (ISO → human label for current corpus countries)
// ---------------------------------------------------------------------------
const COUNTRY_LABELS: Record<string, string> = {
  ES: "Spain",
  FR: "France",
  GB: "United Kingdom",
  DE: "Germany",
  IT: "Italy",
  NL: "Netherlands",
  BE: "Belgium",
  PT: "Portugal",
  SE: "Sweden",
  PL: "Poland",
  AT: "Austria",
  DK: "Denmark",
  FI: "Finland",
  NO: "Norway",
  CH: "Switzerland",
  US: "United States",
  BR: "Brazil",
  IN: "India",
  AU: "Australia",
  CA: "Canada",
  MX: "Mexico",
  AR: "Argentina",
  CL: "Chile",
  CO: "Colombia",
  ZA: "South Africa",
  NG: "Nigeria",
  JP: "Japan",
  KR: "South Korea",
  SG: "Singapore",
  TH: "Thailand",
  PH: "Philippines",
  ID: "Indonesia",
  MY: "Malaysia",
  AE: "UAE",
  SA: "Saudi Arabia",
  EG: "Egypt",
  TR: "Turkey",
  IL: "Israel",
};

function countryLabel(code: string): string {
  return COUNTRY_LABELS[code.toUpperCase()] ?? code.toUpperCase();
}

// ---------------------------------------------------------------------------
// Sort options (user-facing labels → internal enum values)
// ---------------------------------------------------------------------------
const SORT_OPTIONS: { label: string; value: DiscoverySort }[] = [
  { label: "Recently seen", value: "RECENTLY_SEEN" },
  { label: "Newest started", value: "NEWEST_STARTED" },
  { label: "EU reach ↓", value: "EU_REACH_DESC" },
  { label: "IG followers ↓", value: "INSTAGRAM_FOLLOWERS_DESC" },
  { label: "Creative reuse ↓", value: "CREATIVE_REUSE_DESC" },
];

// ---------------------------------------------------------------------------
// Pill toggle button (shared primitive)
// ---------------------------------------------------------------------------
function PillToggle({
  label,
  count,
  selected,
  onClick,
  disabled,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-sans transition-colors border ${
        selected
          ? "border-[#d46b38] text-[#d46b38] bg-[#d46b3812]"
          : "border-[#1e222d] text-[#9da2ad] hover:border-[#2a2f3d] hover:text-[#c5c9d4]"
      } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={`font-mono text-[10px] ${selected ? "text-[#d46b3899]" : "text-[#686e7b]"}`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Section label
// ---------------------------------------------------------------------------
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-sans tracking-widest uppercase text-[#686e7b] select-none whitespace-nowrap">
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Active filter token (removable chip)
// ---------------------------------------------------------------------------
function FilterToken({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-sans border border-[#d46b3840] text-[#d46b38] bg-[#d46b380c]">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="hover:text-[#f3f4f6] transition-colors ml-0.5 text-[#d46b3880]"
      >
        ×
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface FilterPanelProps {
  facets: DiscoveryFacetsResult;
  totalCount: number;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function FilterPanel({ facets, totalCount }: FilterPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();

  // Parse current filter state from URL
  const currentFilter = parseDiscoveryFiltersFromParams(searchParams);
  const currentSort = parseSortFromParams(searchParams) ?? "RECENTLY_SEEN";

  // ---------------------------------------------------------------------------
  // URL mutation helper
  // ---------------------------------------------------------------------------
  const applyFilter = useCallback(
    (nextFilter: DiscoveryFilterInput, nextSort?: DiscoverySort) => {
      const params = buildDiscoveryFilterParams(nextFilter, nextSort ?? currentSort);
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    },
    [router, pathname, currentSort],
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

  // ---------------------------------------------------------------------------
  // Toggle helpers
  // ---------------------------------------------------------------------------
  function toggleStringArray<K extends keyof DiscoveryFilterInput>(
    key: K,
    value: string,
  ) {
    const current = (currentFilter[key] as string[] | undefined) ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    applyFilter({ ...currentFilter, [key]: next.length > 0 ? next : undefined });
  }

  function toggleBoolean(key: keyof DiscoveryFilterInput, value: boolean) {
    const current = currentFilter[key];
    applyFilter({
      ...currentFilter,
      [key]: current === value ? undefined : value,
    });
  }

  function setRange(
    minKey: keyof DiscoveryFilterInput,
    maxKey: keyof DiscoveryFilterInput,
    min: number | undefined,
    max: number | undefined,
  ) {
    applyFilter({ ...currentFilter, [minKey]: min, [maxKey]: max });
  }

  function clearRange(
    minKey: keyof DiscoveryFilterInput,
    maxKey: keyof DiscoveryFilterInput,
  ) {
    const next = { ...currentFilter };
    delete next[minKey as never];
    delete next[maxKey as never];
    applyFilter(next);
  }

  // ---------------------------------------------------------------------------
  // Derive current state for display
  // ---------------------------------------------------------------------------
  const activeFormats = currentFilter.mediaTypes ?? [];
  const activeShapes = currentFilter.shapeFamilies ?? [];
  const activeReached = currentFilter.reachedCountries ?? [];
  const activeBrands = currentFilter.brandIds ?? [];
  const activePlatforms = currentFilter.publisherPlatforms ?? [];
  const activeCategories = currentFilter.pageCategories ?? [];

  // EU Reach band detection
  const euReachMin = currentFilter.euReachMin !== undefined ? Number(currentFilter.euReachMin) : undefined;
  const euReachMax = currentFilter.euReachMax !== undefined ? Number(currentFilter.euReachMax) : undefined;
  function isEuReachBandActive(bandKey: string): boolean {
    const band = EU_REACH_BANDS.find((b) => b.key === bandKey);
    if (!band) return false;
    const bMin = typeof band.min === "bigint" ? Number(band.min) : Number(band.min);
    const bMax = band.max === null ? undefined : typeof band.max === "bigint" ? Number(band.max) : Number(band.max);
    return euReachMin === (bMin > 0 ? bMin : undefined) && euReachMax === bMax;
  }

  // Reuse band detection
  const reuseMin = currentFilter.exactCreativeReuseMin;
  const reuseMax = currentFilter.exactCreativeReuseMax;
  function isReuseBandActive(bandKey: string): boolean {
    const band = CREATIVE_REUSE_BANDS.find((b) => b.key === bandKey);
    if (!band) return false;
    const bMin = typeof band.min === "bigint" ? Number(band.min) : Number(band.min);
    const bMax = band.max === null ? undefined : (typeof band.max === "bigint" ? Number(band.max) : Number(band.max)) - 1;
    return reuseMin === bMin && reuseMax === bMax;
  }

  // Active token list for the token bar
  type ActiveToken = { label: string; onRemove: () => void };
  const activeTokens: ActiveToken[] = [];

  activeFormats.forEach((f) =>
    activeTokens.push({
      label: f.charAt(0) + f.slice(1).toLowerCase(),
      onRemove: () => toggleStringArray("mediaTypes", f),
    }),
  );
  activeShapes.forEach((s) =>
    activeTokens.push({
      label: s.charAt(0).toUpperCase() + s.slice(1),
      onRemove: () => toggleStringArray("shapeFamilies", s),
    }),
  );
  if (currentFilter.runningMinDays !== undefined || currentFilter.runningMaxDays !== undefined) {
    const parts = [];
    if (currentFilter.runningMinDays !== undefined) parts.push(`≥${currentFilter.runningMinDays}d`);
    if (currentFilter.runningMaxDays !== undefined) parts.push(`≤${currentFilter.runningMaxDays}d`);
    activeTokens.push({
      label: `Running ${parts.join(" ")}`,
      onRemove: () => clearRange("runningMinDays", "runningMaxDays"),
    });
  }
  if (reuseMin !== undefined || reuseMax !== undefined) {
    const reuseBand = CREATIVE_REUSE_BANDS.find((b) => isReuseBandActive(b.key));
    activeTokens.push({
      label: reuseBand ? `Reuse ${reuseBand.label}` : `Reuse ${reuseMin ?? ""}–${reuseMax ?? ""}`,
      onRemove: () => clearRange("exactCreativeReuseMin", "exactCreativeReuseMax"),
    });
  }
  activeReached.forEach((c) =>
    activeTokens.push({
      label: countryLabel(c),
      onRemove: () => toggleStringArray("reachedCountries", c),
    }),
  );
  if (currentFilter.hasEuTransparencyEvidence)
    activeTokens.push({
      label: "EU transparency",
      onRemove: () => toggleBoolean("hasEuTransparencyEvidence", true),
    });
  if (currentFilter.hasUkTransparencyEvidence)
    activeTokens.push({
      label: "UK transparency",
      onRemove: () => toggleBoolean("hasUkTransparencyEvidence", true),
    });
  if (euReachMin !== undefined || euReachMax !== undefined) {
    const reachBand = EU_REACH_BANDS.find((b) => isEuReachBandActive(b.key));
    activeTokens.push({
      label: reachBand ? `EU reach ${reachBand.label}` : `EU reach ${euReachMin ?? ""}+`,
      onRemove: () => clearRange("euReachMin", "euReachMax"),
    });
  }
  activeBrands.forEach((id) => {
    const brand = facets.brands.find((b) => b.brandId === id);
    if (brand)
      activeTokens.push({
        label: brand.brandName,
        onRemove: () => toggleStringArray("brandIds", id),
      });
  });
  activePlatforms.forEach((p) =>
    activeTokens.push({
      label: p.charAt(0) + p.slice(1).toLowerCase(),
      onRemove: () => toggleStringArray("publisherPlatforms", p),
    }),
  );
  if (currentFilter.instagramFollowersMin !== undefined || currentFilter.instagramFollowersMax !== undefined) {
    activeTokens.push({
      label: `IG ${currentFilter.instagramFollowersMin !== undefined ? `≥${Number(currentFilter.instagramFollowersMin).toLocaleString()}` : ""}`,
      onRemove: () => clearRange("instagramFollowersMin", "instagramFollowersMax"),
    });
  }
  if (currentFilter.isActive !== undefined) {
    activeTokens.push({
      label: currentFilter.isActive ? "Active" : "Inactive",
      onRemove: () => {
        const next = { ...currentFilter };
        delete next.isActive;
        applyFilter(next);
      },
    });
  }

  const hasActiveFilters = activeTokens.length > 0;

  // ---------------------------------------------------------------------------
  // Corpus-aware visibility
  // ---------------------------------------------------------------------------
  const euTransparencyCount = facets.transparencyEvidence.EU.true;
  const ukTransparencyCount = facets.transparencyEvidence.UK.true;
  const showEuTransparency = euTransparencyCount > 0 || currentFilter.hasEuTransparencyEvidence;
  const showUkTransparency = ukTransparencyCount > 0 || currentFilter.hasUkTransparencyEvidence;
  const showReached = facets.reachedCountries.length > 0 || activeReached.length > 0;
  const showEuReach = facets.euReachBands.some((b) => b.count > 0) || euReachMin !== undefined;

  // Running time presets
  const RUNNING_PRESETS = [
    { label: "< 7d", minDays: undefined, maxDays: 7 },
    { label: "7–14d", minDays: 7, maxDays: 14 },
    { label: "14–30d", minDays: 14, maxDays: 30 },
    { label: "30–90d", minDays: 30, maxDays: 90 },
    { label: "90d+", minDays: 90, maxDays: undefined },
  ] as const;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="w-full font-sans" data-testid="filter-panel">
      {/* ——— Primary filter rail ——— */}
      <div className="flex flex-col gap-4">
        {/* Rail row */}
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          {/* FORMAT */}
          <div className="flex flex-col gap-1.5">
            <SectionLabel>Format</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {facets.mediaTypes.map((mt) => (
                <PillToggle
                  key={mt.value}
                  label={mt.value.charAt(0) + mt.value.slice(1).toLowerCase()}
                  count={mt.count}
                  selected={activeFormats.includes(mt.value)}
                  onClick={() => toggleStringArray("mediaTypes", mt.value)}
                />
              ))}
            </div>
          </div>

          {/* SHAPE */}
          <div className="flex flex-col gap-1.5">
            <SectionLabel>Shape</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {facets.shapeFamilies.map((sf) => (
                <PillToggle
                  key={sf.value}
                  label={sf.value.charAt(0).toUpperCase() + sf.value.slice(1)}
                  count={sf.count}
                  selected={activeShapes.includes(sf.value as never)}
                  onClick={() => toggleStringArray("shapeFamilies", sf.value)}
                />
              ))}
            </div>
          </div>

          {/* RUNNING TIME */}
          <div className="flex flex-col gap-1.5">
            <SectionLabel>Running</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {RUNNING_PRESETS.map((preset) => {
                const active =
                  currentFilter.runningMinDays === preset.minDays &&
                  currentFilter.runningMaxDays === preset.maxDays;
                return (
                  <PillToggle
                    key={preset.label}
                    label={preset.label}
                    selected={active}
                    onClick={() => {
                      if (active) {
                        clearRange("runningMinDays", "runningMaxDays");
                      } else {
                        setRange("runningMinDays", "runningMaxDays", preset.minDays, preset.maxDays);
                      }
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* CREATIVE REUSE */}
          <div className="flex flex-col gap-1.5">
            <SectionLabel>Reuse</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {CREATIVE_REUSE_BANDS.map((band) => {
                const facetBand = facets.creativeReuseBands.find((b) => b.key === band.key);
                const count = facetBand?.count ?? 0;
                const active = isReuseBandActive(band.key);
                if (!active && count === 0) return null;
                const bMin = typeof band.min === "bigint" ? Number(band.min) : Number(band.min);
                const bMax = band.max === null ? undefined : (typeof band.max === "bigint" ? Number(band.max) : Number(band.max)) - 1;
                return (
                  <PillToggle
                    key={band.key}
                    label={band.label}
                    count={count}
                    selected={active}
                    onClick={() => {
                      if (active) {
                        clearRange("exactCreativeReuseMin", "exactCreativeReuseMax");
                      } else {
                        setRange("exactCreativeReuseMin", "exactCreativeReuseMax", bMin, bMax);
                      }
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* REACHED COUNTRY */}
          {showReached && (
            <div className="flex flex-col gap-1.5">
              <SectionLabel>Reached</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {facets.reachedCountries.map((rc) => (
                  <PillToggle
                    key={rc.value}
                    label={countryLabel(rc.value)}
                    count={rc.count}
                    selected={activeReached.includes(rc.value)}
                    onClick={() => toggleStringArray("reachedCountries", rc.value)}
                  />
                ))}
                {/* Show selected countries that may have 0 count after other filters */}
                {activeReached
                  .filter((c) => !facets.reachedCountries.some((r) => r.value === c))
                  .map((c) => (
                    <PillToggle
                      key={c}
                      label={countryLabel(c)}
                      count={0}
                      selected={true}
                      onClick={() => toggleStringArray("reachedCountries", c)}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* TRANSPARENCY */}
          {(showEuTransparency || showUkTransparency) && (
            <div className="flex flex-col gap-1.5">
              <SectionLabel>Transparency</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {showEuTransparency && (
                  <PillToggle
                    label="EU"
                    count={euTransparencyCount}
                    selected={currentFilter.hasEuTransparencyEvidence === true}
                    onClick={() => toggleBoolean("hasEuTransparencyEvidence", true)}
                  />
                )}
                {showUkTransparency && (
                  <PillToggle
                    label="UK"
                    count={ukTransparencyCount}
                    selected={currentFilter.hasUkTransparencyEvidence === true}
                    onClick={() => toggleBoolean("hasUkTransparencyEvidence", true)}
                  />
                )}
              </div>
            </div>
          )}

          {/* EU REACH */}
          {showEuReach && (
            <div className="flex flex-col gap-1.5">
              <SectionLabel>EU Reach</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {facets.euReachBands.map((band) => {
                  const active = isEuReachBandActive(band.key);
                  if (!active && band.count === 0) return null;
                  const domainBand = EU_REACH_BANDS.find((b) => b.key === band.key);
                  if (!domainBand) return null;
                  const bMin = typeof domainBand.min === "bigint" ? Number(domainBand.min) : Number(domainBand.min);
                  const bMax = domainBand.max === null ? undefined : typeof domainBand.max === "bigint" ? Number(domainBand.max) : Number(domainBand.max);
                  return (
                    <PillToggle
                      key={band.key}
                      label={band.label}
                      count={band.count}
                      selected={active}
                      onClick={() => {
                        if (active) {
                          clearRange("euReachMin", "euReachMax");
                        } else {
                          setRange("euReachMin", "euReachMax", bMin > 0 ? bMin : undefined, bMax);
                        }
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* ACTIVE STATUS */}
          <div className="flex flex-col gap-1.5">
            <SectionLabel>Status</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              <PillToggle
                label="Active"
                selected={currentFilter.isActive === true}
                onClick={() => toggleBoolean("isActive", true)}
              />
              <PillToggle
                label="Inactive"
                selected={currentFilter.isActive === false}
                onClick={() => toggleBoolean("isActive", false)}
              />
            </div>
          </div>

          {/* MORE FILTERS toggle */}
          <div className="flex flex-col gap-1.5">
            <SectionLabel>&nbsp;</SectionLabel>
            <button
              type="button"
              id={`${moreId}-toggle`}
              aria-controls={`${moreId}-panel`}
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-sans border border-[#1e222d] text-[#9da2ad] hover:border-[#2a2f3d] hover:text-[#c5c9d4] transition-colors cursor-pointer"
            >
              More
              <span className="font-mono text-[10px] text-[#686e7b]">{moreOpen ? "−" : "+"}</span>
            </button>
          </div>

          {/* SORT */}
          <div className="flex flex-col gap-1.5 ml-auto">
            <SectionLabel>Sort</SectionLabel>
            <select
              id="discover-sort"
              value={currentSort}
              onChange={(e) => applySort(e.target.value as DiscoverySort)}
              className="px-2.5 py-1 text-xs font-sans bg-[#0c0e13] border border-[#1e222d] text-[#9da2ad] hover:border-[#2a2f3d] focus:border-[#d46b38] focus:outline-none transition-colors cursor-pointer"
              aria-label="Sort results"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ——— More Filters panel ——— */}
        {moreOpen && (
          <div
            id={`${moreId}-panel`}
            role="region"
            aria-label="More filters"
            className="border-t border-[#16181f] pt-4"
          >
            <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
              {/* BRAND */}
              {facets.brands.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <SectionLabel>Brand</SectionLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {facets.brands.map((brand) => (
                      <PillToggle
                        key={brand.brandId}
                        label={brand.brandName}
                        count={brand.count}
                        selected={activeBrands.includes(brand.brandId)}
                        onClick={() => toggleStringArray("brandIds", brand.brandId)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* PLATFORM */}
              {facets.publisherPlatforms.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <SectionLabel>Platform</SectionLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {facets.publisherPlatforms.map((p) => {
                      // Only show if count > 0 or currently selected
                      if (p.count === 0 && !activePlatforms.includes(p.value)) return null;
                      return (
                        <PillToggle
                          key={p.value}
                          label={p.value.charAt(0) + p.value.slice(1).toLowerCase()}
                          count={p.count}
                          selected={activePlatforms.includes(p.value)}
                          onClick={() => toggleStringArray("publisherPlatforms", p.value)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* PAGE CATEGORY */}
              {facets.pageCategories.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <SectionLabel>Page type</SectionLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {facets.pageCategories.map((pc) => (
                      <PillToggle
                        key={pc.value}
                        label={pc.value}
                        count={pc.count}
                        selected={activeCategories.includes(pc.value)}
                        onClick={() => toggleStringArray("pageCategories", pc.value)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* INSTAGRAM FOLLOWERS */}
              {facets.instagramFollowerBands.some((b) => b.count > 0) && (
                <div className="flex flex-col gap-1.5">
                  <SectionLabel>IG Followers</SectionLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {facets.instagramFollowerBands.map((band) => {
                      if (band.count === 0) return null;
                      // Map band key to ig_followers_min value
                      const BAND_MIN_MAP: Record<string, number> = {
                        LT_10K: 0,
                        "10K_50K": 10000,
                        "50K_100K": 50000,
                        "100K_500K": 100000,
                        "500K_PLUS": 500000,
                      };
                      const min = BAND_MIN_MAP[band.key];
                      const active =
                        currentFilter.instagramFollowersMin !== undefined &&
                        Number(currentFilter.instagramFollowersMin) === min;
                      return (
                        <PillToggle
                          key={band.key}
                          label={band.label}
                          count={band.count}
                          selected={active}
                          onClick={() => {
                            if (active) {
                              clearRange("instagramFollowersMin", "instagramFollowersMax");
                            } else {
                              applyFilter({
                                ...currentFilter,
                                instagramFollowersMin: min,
                                instagramFollowersMax: undefined,
                              });
                            }
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* UK TRANSPARENCY + REACH (if evidence exists) */}
              {showUkTransparency && (
                <div className="flex flex-col gap-1.5">
                  <SectionLabel>UK evidence</SectionLabel>
                  <div className="flex flex-wrap gap-1.5">
                    <PillToggle
                      label={`UK transparency (${ukTransparencyCount})`}
                      selected={currentFilter.hasUkTransparencyEvidence === true}
                      onClick={() => toggleBoolean("hasUkTransparencyEvidence", true)}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ——— Active filter tokens + count ——— */}
        {(hasActiveFilters || totalCount < 99999) && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#16181f]/60">
            {/* Result count */}
            <span className="text-[11px] font-mono text-[#686e7b] mr-1" aria-live="polite">
              {totalCount.toLocaleString()} {totalCount === 1 ? "ad" : "ads"}
            </span>

            {/* Active tokens */}
            {activeTokens.map((token, i) => (
              <FilterToken key={i} label={token.label} onRemove={token.onRemove} />
            ))}

            {/* Clear all */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAll}
                className="text-[11px] font-sans text-[#686e7b] hover:text-[#9da2ad] transition-colors underline underline-offset-2 ml-1"
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
