"use client";

/**
 * SortControl — single-select sort backed by Astryx Selector.
 *
 * Exposes EXPLORE as default brand-diverse exploration alongside strict analytical sorts.
 */

import { Selector } from "@/components/ui/astryx";
import type { DiscoverySort } from "@/discovery/filters/types";
import { FILTER_SECTION_LABEL_CLASS } from "./filter-section";

const SORT_OPTIONS: { label: string; value: DiscoverySort }[] = [
  { label: "Explore (Diverse)", value: "EXPLORE" },
  { label: "Recently seen", value: "RECENTLY_SEEN" },
  { label: "Newest started", value: "NEWEST_STARTED" },
  { label: "EU reach ↓", value: "EU_REACH_DESC" },
  { label: "IG followers ↓", value: "INSTAGRAM_FOLLOWERS_DESC" },
  { label: "Creative reuse ↓", value: "CREATIVE_REUSE_DESC" },
];

export interface SortControlProps {
  value: DiscoverySort;
  onChange: (sort: DiscoverySort) => void;
  className?: string;
}

export function SortControl({ value, onChange, className }: SortControlProps) {
  return (
    <div
      className={
        className
          ? `flex flex-col gap-1.5 ${className}`
          : "flex flex-col gap-1.5"
      }
    >
      <span id="sort" className={FILTER_SECTION_LABEL_CLASS}>
        Sort
      </span>
      <Selector
        label="Sort"
        isLabelHidden
        size="sm"
        variant="input"
        options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        value={value ?? "EXPLORE"}
        onChange={(v) => onChange(v as DiscoverySort)}
        className="min-w-44"
      />
    </div>
  );
}
