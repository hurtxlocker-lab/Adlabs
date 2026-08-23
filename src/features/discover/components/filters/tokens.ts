/**
 * Active filter token derivation for the Discover filter panel.
 *
 * Pure presentation mapping: converts the current URL-derived filter state +
 * facets into removable tokens. Removal handlers mutate URL state through the
 * existing codec utilities (never directly).
 */

import type {
  DiscoveryFacetsResult,
  DiscoveryFilterInput,
} from "@/discovery/filters/types";
import { EU_REACH_BANDS } from "@/discovery/filters/bands";
import { countryLabel } from "./country-labels";
import {
  detectRunningBandKey,
  detectReuseBandKey,
  REUSE_BAND_LABELS,
  RUNNING_BANDS,
} from "./bands";

export interface ActiveToken {
  label: string;
  onRemove: () => void;
}

export interface TokenHandlers {
  toggleStringArray: (key: keyof DiscoveryFilterInput, value: string) => void;
  toggleBoolean: (key: keyof DiscoveryFilterInput, value: boolean) => void;
  clearRange: (
    minKey: keyof DiscoveryFilterInput,
    maxKey: keyof DiscoveryFilterInput,
  ) => void;
  clearSingle: (key: keyof DiscoveryFilterInput) => void;
}

export function deriveActiveTokens(
  filter: DiscoveryFilterInput,
  facets: DiscoveryFacetsResult,
  handlers: TokenHandlers,
  brandNameMap?: Record<string, string>,
): ActiveToken[] {
  const tokens: ActiveToken[] = [];

  (filter.mediaTypes ?? []).forEach((f) =>
    tokens.push({
      label: f.charAt(0) + f.slice(1).toLowerCase(),
      onRemove: () => handlers.toggleStringArray("mediaTypes", f),
    }),
  );

  (filter.shapeFamilies ?? []).forEach((s) =>
    tokens.push({
      label: s.charAt(0).toUpperCase() + s.slice(1),
      onRemove: () => handlers.toggleStringArray("shapeFamilies", s),
    }),
  );

  const runningKey = detectRunningBandKey(filter);
  if (runningKey) {
    const band = RUNNING_BANDS.find((b) => b.key === runningKey);
    tokens.push({
      label: `Running ${band?.label ?? ""}`,
      onRemove: () => handlers.clearRange("runningMinDays", "runningMaxDays"),
    });
  }

  const reuseKey = detectReuseBandKey(filter);
  if (reuseKey) {
    tokens.push({
      label: `Reuse ${REUSE_BAND_LABELS[reuseKey] ?? reuseKey}`,
      onRemove: () =>
        handlers.clearRange("exactCreativeReuseMin", "exactCreativeReuseMax"),
    });
  }

  (filter.reachedCountries ?? []).forEach((c) =>
    tokens.push({
      label: countryLabel(c),
      onRemove: () => handlers.toggleStringArray("reachedCountries", c),
    }),
  );

  if (filter.hasEuTransparencyEvidence) {
    tokens.push({
      label: "EU evidence",
      onRemove: () => handlers.toggleBoolean("hasEuTransparencyEvidence", true),
    });
  }

  if (filter.hasUkTransparencyEvidence) {
    tokens.push({
      label: "UK evidence",
      onRemove: () => handlers.toggleBoolean("hasUkTransparencyEvidence", true),
    });
  }

  const euReachMin = filter.euReachMin !== undefined ? Number(filter.euReachMin) : undefined;
  const euReachMax = filter.euReachMax !== undefined ? Number(filter.euReachMax) : undefined;
  if (euReachMin !== undefined || euReachMax !== undefined) {
    const band = EU_REACH_BANDS.find((b) => {
      const bMin = typeof b.min === "bigint" ? Number(b.min) : Number(b.min);
      const bMax = b.max === null ? undefined : typeof b.max === "bigint" ? Number(b.max) : Number(b.max);
      return (
        euReachMin === (bMin > 0 ? bMin : undefined) && euReachMax === bMax
      );
    });
    tokens.push({
      label: band ? `EU reach ${band.label}` : `EU reach ${euReachMin ?? ""}+`,
      onRemove: () => handlers.clearRange("euReachMin", "euReachMax"),
    });
  }

  (filter.brandIds ?? []).forEach((id) => {
    const brandName =
      brandNameMap?.[id] ?? facets.brands.find((b) => b.brandId === id)?.brandName;
    if (brandName) {
      tokens.push({
        label: brandName,
        onRemove: () => handlers.toggleStringArray("brandIds", id),
      });
    }
  });

  (filter.ctaTypes ?? []).forEach((c) =>
    tokens.push({
      label: c.charAt(0).toUpperCase() + c.slice(1).toLowerCase().replace(/_/g, " "),
      onRemove: () => handlers.toggleStringArray("ctaTypes", c),
    }),
  );

  (filter.publisherPlatforms ?? []).forEach((p) =>
    tokens.push({
      label: p.charAt(0) + p.slice(1).toLowerCase(),
      onRemove: () => handlers.toggleStringArray("publisherPlatforms", p),
    }),
  );

  (filter.pageCategories ?? []).forEach((pc) =>
    tokens.push({
      label: `Category: ${pc}`,
      onRemove: () => handlers.toggleStringArray("pageCategories", pc),
    }),
  );

  (filter.targetCountries ?? []).forEach((c) =>
    tokens.push({
      label: countryLabel(c),
      onRemove: () => handlers.toggleStringArray("targetCountries", c),
    }),
  );

  if (filter.instagramFollowersMin !== undefined) {
    tokens.push({
      label: `IG ≥${Number(filter.instagramFollowersMin).toLocaleString()}`,
      onRemove: () =>
        handlers.clearRange("instagramFollowersMin", "instagramFollowersMax"),
    });
  }

  if (filter.isActive !== undefined) {
    tokens.push({
      label: filter.isActive ? "Active" : "Inactive",
      onRemove: () => handlers.clearSingle("isActive"),
    });
  }

  return tokens;
}
