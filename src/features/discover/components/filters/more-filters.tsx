"use client";

/**
 * MoreFiltersPopover — Secondary filter controls in AdLabs Discover.
 *
 * Contains:
 *  - Creative: CTA type, Publisher platform, Exact creative reuse
 *  - Account: Instagram follower bands
 *  - Delivery: Target countries
 *  - Evidence: UK transparency evidence
 *
 * Built with native HTML form controls and AdLabs NativePopover.
 */

import type {
  DiscoveryFacetsResult,
  DiscoveryFilterInput,
} from "@/discovery/filters/types";
import { CREATIVE_REUSE_BANDS } from "@/discovery/filters/bands";
import { countryLabel } from "./country-labels";
import { BandSelectFilter } from "./band-select-filter";
import { detectReuseBandKey, REUSE_BAND_LABELS } from "./bands";
import { NativePopover } from "./native-popover";

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
  const targetCountryOptions = facets.targetCountries;
  const ukCount = facets.transparencyEvidence.UK.true;

  const activeCta = filter.ctaTypes ?? [];
  const activePlatforms = filter.publisherPlatforms ?? [];
  const activeTargetCountries = filter.targetCountries ?? [];

  const toggleStringArrayItem = (
    key: keyof DiscoveryFilterInput,
    value: string,
  ) => {
    const current = (filter[key] as string[] | undefined) ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onSetStringArray(key, next);
  };

  const reuseKey = detectReuseBandKey(filter);
  const reuseOptions = facets.creativeReuseBands
    .filter((b) => b.count > 0 || b.key === reuseKey)
    .map((b) => ({
      key: b.key,
      label: REUSE_BAND_LABELS[b.key] ?? b.label,
    }));

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

  const showCreative =
    ctaOptions.length > 0 ||
    platformOptions.length > 0 ||
    reuseOptions.length > 0;
  const showAccount = igFollowerBands.length > 0;
  const showDelivery = targetCountryOptions.length > 0;
  const showEvidence = ukCount > 0 || filter.hasUkTransparencyEvidence === true;

  return (
    <div className="flex flex-col gap-5 font-sans">
      {/* 1. CREATIVE */}
      {showCreative && (
        <div className="flex flex-col gap-3">
          <GroupHeading>Creative</GroupHeading>

          {ctaOptions.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-[#8e95a2]">CTA type</span>
              <div className="overflow-y-auto max-h-[140px] flex flex-col gap-1 pr-1">
                {ctaOptions.map((c) => {
                  const isChecked = activeCta.includes(c.value);
                  return (
                    <label
                      key={c.value}
                      className="flex items-center justify-between gap-2 px-1.5 py-0.5 text-xs text-[#9da2ad] hover:text-[#f3f4f6] hover:bg-[#12151c] rounded-[2px] cursor-pointer select-none transition-colors"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() =>
                            toggleStringArrayItem("ctaTypes", c.value)
                          }
                          className="accent-[#d46b38] w-3.5 h-3.5 rounded-[2px] cursor-pointer"
                        />
                        <span
                          className={`truncate ${isChecked ? "text-[#f3f4f6] font-medium" : ""}`}
                        >
                          {c.value}
                        </span>
                      </div>
                      <CountBadge count={c.count} />
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {platformOptions.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-[#8e95a2]">Platform</span>
              <div className="flex flex-col gap-1">
                {platformOptions.map((p) => {
                  const isChecked = activePlatforms.includes(p.value);
                  const label =
                    p.value.charAt(0) + p.value.slice(1).toLowerCase();
                  return (
                    <label
                      key={p.value}
                      className="flex items-center justify-between gap-2 px-1.5 py-0.5 text-xs text-[#9da2ad] hover:text-[#f3f4f6] hover:bg-[#12151c] rounded-[2px] cursor-pointer select-none transition-colors"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() =>
                            toggleStringArrayItem("publisherPlatforms", p.value)
                          }
                          className="accent-[#d46b38] w-3.5 h-3.5 rounded-[2px] cursor-pointer"
                        />
                        <span
                          className={`truncate ${isChecked ? "text-[#f3f4f6] font-medium" : ""}`}
                        >
                          {label}
                        </span>
                      </div>
                      <CountBadge count={p.count} />
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {reuseOptions.length > 0 && (
            <BandSelectFilter
              id="more-creative-reuse"
              label="Exact creative reuse"
              options={reuseOptions}
              selectedKey={reuseKey}
              onSelect={handleReuseSelect}
            />
          )}
        </div>
      )}

      {/* 2. ACCOUNT */}
      {showAccount && (
        <div className="flex flex-col gap-3">
          <GroupHeading>Account</GroupHeading>
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

      {/* 3. DELIVERY */}
      {showDelivery && (
        <div className="flex flex-col gap-2">
          <GroupHeading>Delivery</GroupHeading>
          <span className="text-[11px] text-[#8e95a2]">Target country</span>
          <div className="overflow-y-auto max-h-[140px] flex flex-col gap-1 pr-1">
            {targetCountryOptions.map((c) => {
              const isChecked = activeTargetCountries.includes(c.value);
              return (
                <label
                  key={c.value}
                  className="flex items-center justify-between gap-2 px-1.5 py-0.5 text-xs text-[#9da2ad] hover:text-[#f3f4f6] hover:bg-[#12151c] rounded-[2px] cursor-pointer select-none transition-colors"
                >
                  <div className="flex items-center gap-2 truncate">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() =>
                        toggleStringArrayItem("targetCountries", c.value)
                      }
                      className="accent-[#d46b38] w-3.5 h-3.5 rounded-[2px] cursor-pointer"
                    />
                    <span
                      className={`truncate ${isChecked ? "text-[#f3f4f6] font-medium" : ""}`}
                    >
                      {countryLabel(c.value)}
                    </span>
                  </div>
                  <CountBadge count={c.count} />
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. EVIDENCE */}
      {showEvidence && (
        <div className="flex flex-col gap-2">
          <GroupHeading>Evidence</GroupHeading>
          <label className="flex items-center justify-between gap-2 px-1.5 py-1 text-xs text-[#9da2ad] hover:text-[#f3f4f6] hover:bg-[#12151c] rounded-[2px] cursor-pointer select-none transition-colors">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filter.hasUkTransparencyEvidence === true}
                onChange={(e) =>
                  onSetBoolean("hasUkTransparencyEvidence", e.target.checked)
                }
                className="accent-[#d46b38] w-3.5 h-3.5 rounded-[2px] cursor-pointer"
              />
              <span
                className={
                  filter.hasUkTransparencyEvidence === true
                    ? "text-[#f3f4f6] font-medium"
                    : ""
                }
              >
                UK transparency
              </span>
            </div>
            {ukCount > 0 && <CountBadge count={ukCount} />}
          </label>
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
  const isSelected = badgeCount !== undefined && badgeCount > 0;

  return (
    <NativePopover
      width={340}
      trigger={({ isOpen, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          className={
            triggerClassName ??
            `inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-sans border transition-colors cursor-pointer rounded-[3px] ${
              isSelected
                ? "border-[#d46b38] bg-[#d46b3810] text-[#f3f4f6]"
                : "border-[#1e222d] text-[#9da2ad] hover:border-[#2a2f3d] hover:text-[#c5c9d4] bg-[#090b10]"
            }`
          }
          aria-label={`More filters (${badgeCount ?? 0} active)`}
        >
          <span>{triggerLabel}</span>
          {isSelected && (
            <span className="font-mono text-[10px] text-[#d46b38]">
              · {badgeCount}
            </span>
          )}
          <span className="text-[10px] text-[#686e7b]" aria-hidden="true">
            ▾
          </span>
        </button>
      )}
    >
      {() => <MoreFiltersContent {...contentProps} />}
    </NativePopover>
  );
}
