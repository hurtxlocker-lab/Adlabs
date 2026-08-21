"use client";

/**
 * MoreFiltersPopover — ONE Astryx-backed popover surface with four labeled
 * groups (Creative / Account / Delivery / Evidence).
 *
 * Group visibility is facet-driven: a group renders only when its dimensions
 * have evidence (or an active selection to preserve). Nothing is hard-coded to
 * corpus counts.
 *
 * Astryx owns the popover layer: focus trapping, keyboard navigation, Escape
 * and outside-click dismissal, focus restoration, and positioning. AdLabs owns
 * all visuals through the .adlabs-astryx token scope + className.
 */

import {
  CheckboxList,
  CheckboxListItem,
  MultiSelector,
  Popover,
  Switch,
} from "@/components/ui/astryx";
import type {
  DiscoveryFacetsResult,
  DiscoveryFilterInput,
} from "@/discovery/filters/types";
import { countryLabel } from "./country-labels";
import { BandSelectFilter } from "./band-select-filter";

const IG_FOLLOWER_BAND_MIN: Record<string, number> = {
  LT_10K: 0,
  "10K_50K": 10000,
  "50K_100K": 50000,
  "100K_500K": 100000,
  "500K_PLUS": 500000,
};

export interface MoreFiltersContentProps {
  facets: DiscoveryFacetsResult;
  filter: DiscoveryFilterInput;
  onSetStringArray: (key: keyof DiscoveryFilterInput, values: string[]) => void;
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

function CountBadge({ count }: { count: number }) {
  return <span className="font-mono text-[10px] text-[#686e7b]">{count}</span>;
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-sans tracking-widest uppercase text-[#686e7b] select-none">
      {children}
    </h3>
  );
}

export function MoreFiltersContent({
  facets,
  filter,
  onSetStringArray,
  onSetBoolean,
  onSetRange,
  onClearRange,
}: MoreFiltersContentProps) {
  const ctaOptions = facets.ctaTypes;
  const platformOptions = facets.publisherPlatforms;
  const pageCategoryOptions = facets.pageCategories;
  const targetCountryOptions = facets.targetCountries;
  const ukCount = facets.transparencyEvidence.UK.true;

  const igFollowerBands = facets.instagramFollowerBands.filter(
    (b) =>
      b.count > 0 ||
      (filter.instagramFollowersMin !== undefined &&
        Number(filter.instagramFollowersMin) === IG_FOLLOWER_BAND_MIN[b.key]),
  );

  const igSelectedKey =
    filter.instagramFollowersMin !== undefined
      ? (Object.entries(IG_FOLLOWER_BAND_MIN).find(
          ([, min]) => Number(filter.instagramFollowersMin) === min,
        )?.[0] ?? null)
      : null;

  const handleIgBand = (key: string | null) => {
    if (!key) {
      onClearRange("instagramFollowersMin", "instagramFollowersMax");
      return;
    }
    onSetRange(
      "instagramFollowersMin",
      "instagramFollowersMax",
      IG_FOLLOWER_BAND_MIN[key],
      undefined,
    );
  };

  const showCreative = ctaOptions.length > 0 || platformOptions.length > 0;
  const showAccount =
    facets.brands.length > 0 ||
    pageCategoryOptions.length > 0 ||
    igFollowerBands.length > 0;
  const showDelivery = targetCountryOptions.length > 0;
  const showEvidence = ukCount > 0 || filter.hasUkTransparencyEvidence === true;

  return (
    <div className="flex flex-col gap-5">
      {showCreative && (
        <div className="flex flex-col gap-3">
          <GroupHeading>Creative</GroupHeading>
          {ctaOptions.length > 0 && (
            <CheckboxList
              label="CTA type"
              isLabelHidden
              density="compact"
              value={filter.ctaTypes ?? []}
              onChange={(v) => onSetStringArray("ctaTypes", v)}
            >
              {ctaOptions.map((c) => (
                <CheckboxListItem
                  key={c.value}
                  label={c.value}
                  value={c.value}
                  endContent={<CountBadge count={c.count} />}
                />
              ))}
            </CheckboxList>
          )}
          {platformOptions.length > 0 && (
            <CheckboxList
              label="Platform"
              isLabelHidden
              density="compact"
              value={filter.publisherPlatforms ?? []}
              onChange={(v) => onSetStringArray("publisherPlatforms", v)}
            >
              {platformOptions.map((p) => (
                <CheckboxListItem
                  key={p.value}
                  label={p.value.charAt(0) + p.value.slice(1).toLowerCase()}
                  value={p.value}
                  endContent={<CountBadge count={p.count} />}
                />
              ))}
            </CheckboxList>
          )}
        </div>
      )}

      {showAccount && (
        <div className="flex flex-col gap-3">
          <GroupHeading>Account</GroupHeading>
          {facets.brands.length > 0 && (
            <MultiSelector
              label="Brand"
              isLabelHidden
              size="sm"
              variant="input"
              triggerDisplay="labels"
              maxBadges={2}
              options={facets.brands.map((b) => ({
                value: b.brandId,
                label: b.brandName,
              }))}
              value={filter.brandIds ?? []}
              onChange={(v) => onSetStringArray("brandIds", v)}
            />
          )}
          {pageCategoryOptions.length > 0 && (
            <CheckboxList
              label="Page category"
              isLabelHidden
              density="compact"
              value={filter.pageCategories ?? []}
              onChange={(v) => onSetStringArray("pageCategories", v)}
            >
              {pageCategoryOptions.map((pc) => (
                <CheckboxListItem
                  key={pc.value}
                  label={pc.value}
                  value={pc.value}
                  endContent={<CountBadge count={pc.count} />}
                />
              ))}
            </CheckboxList>
          )}
          {igFollowerBands.length > 0 && (
            <BandSelectFilter
              id="ig-followers"
              label="IG followers"
              options={igFollowerBands.map((b) => ({
                key: b.key,
                label: b.label,
              }))}
              selectedKey={igSelectedKey}
              onSelect={handleIgBand}
            />
          )}
        </div>
      )}

      {showDelivery && (
        <div className="flex flex-col gap-3">
          <GroupHeading>Delivery</GroupHeading>
          <MultiSelector
            label="Target country"
            isLabelHidden
            size="sm"
            variant="input"
            triggerDisplay="labels"
            maxBadges={2}
            options={targetCountryOptions.map((c) => ({
              value: c.value,
              label: countryLabel(c.value),
            }))}
            value={filter.targetCountries ?? []}
            onChange={(v) => onSetStringArray("targetCountries", v)}
          />
        </div>
      )}

      {showEvidence && (
        <div className="flex flex-col gap-3">
          <GroupHeading>Evidence</GroupHeading>
          <div className="flex items-center gap-2">
            <Switch
              label={`UK evidence${ukCount > 0 ? ` · ${ukCount}` : ""}`}
              size="sm"
              value={filter.hasUkTransparencyEvidence === true}
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

export interface MoreFiltersPopoverProps extends MoreFiltersContentProps {
  triggerLabel: string;
  badgeCount?: number;
  triggerClassName?: string;
}

export function MoreFiltersPopover({
  triggerLabel,
  badgeCount,
  triggerClassName,
  ...contentProps
}: MoreFiltersPopoverProps) {
  return (
    <Popover
      label={triggerLabel}
      placement="below"
      alignment="start"
      width={360}
      content={
        <div className="max-h-[70vh] overflow-y-auto">
          <MoreFiltersContent {...contentProps} />
        </div>
      }
    >
      <button
        type="button"
        className={
          triggerClassName ??
          "inline-flex items-center gap-1 px-2.5 py-1 text-xs font-sans border border-[#1e222d] text-[#9da2ad] hover:border-[#2a2f3d] hover:text-[#c5c9d4] transition-colors cursor-pointer"
        }
      >
        {triggerLabel}
        {badgeCount !== undefined && badgeCount > 0 && (
          <span className="font-mono text-[10px] text-[#d46b38]">
            {badgeCount}
          </span>
        )}
      </button>
    </Popover>
  );
}
