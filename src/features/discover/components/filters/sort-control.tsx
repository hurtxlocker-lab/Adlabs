"use client";

/**
 * SortControl — native accessible sort select control.
 *
 * Exposes EXPLORE as default brand-diverse exploration alongside strict analytical sorts.
 */

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
      <label htmlFor="sort-select" className={FILTER_SECTION_LABEL_CLASS}>
        Sort
      </label>
      <div className="relative inline-block">
        <select
          id="sort-select"
          value={value ?? "EXPLORE"}
          onChange={(e) => onChange(e.target.value as DiscoverySort)}
          className="appearance-none bg-[#090b10] border border-[#1e222d] hover:border-[#2a2f3d] focus:border-[#d46b38] focus:outline-none text-xs text-[#f3f4f6] rounded-[3px] px-2.5 py-1 pr-7 cursor-pointer transition-colors font-sans"
          aria-label="Sort creative gallery"
        >
          {SORT_OPTIONS.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              className="bg-[#090b10] text-[#f3f4f6]"
            >
              {opt.label}
            </option>
          ))}
        </select>
        <span
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#686e7b]"
          aria-hidden="true"
        >
          ▾
        </span>
      </div>
    </div>
  );
}
