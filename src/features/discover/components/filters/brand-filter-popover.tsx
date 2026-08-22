"use client";

import { useState } from "react";
import {
  CheckboxList,
  CheckboxListItem,
  Popover,
} from "@/components/ui/astryx";
import type {
  DiscoveryFacetsResult,
  DiscoveryFilterInput,
} from "@/discovery/filters/types";

export interface BrandFilterPopoverProps {
  facets: DiscoveryFacetsResult;
  filter: DiscoveryFilterInput;
  onToggleBrand: (brandId: string) => void;
}

function CountBadge({ count }: { count: number }) {
  return <span className="font-mono text-[10px] text-[#686e7b]">{count}</span>;
}

export function BrandFilterPopover({
  facets,
  filter,
  onToggleBrand,
}: BrandFilterPopoverProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const activeBrandIds = filter.brandIds ?? [];
  const totalSelected = activeBrandIds.length;
  const brands = facets.brands;

  const filteredBrands = brands.filter((b) =>
    b.brandName.toLowerCase().includes(searchTerm.trim().toLowerCase()),
  );

  let triggerLabel = "Brand";
  if (totalSelected === 1) {
    const singleBrand = brands.find((b) => b.brandId === activeBrandIds[0]);
    triggerLabel = singleBrand ? singleBrand.brandName : "Brand · 1";
  } else if (totalSelected > 1) {
    triggerLabel = `Brand · ${totalSelected}`;
  }

  if (brands.length === 0 && totalSelected === 0) {
    return null;
  }

  return (
    <Popover
      label="Brand"
      placement="below"
      alignment="start"
      width={300}
      content={
        <div className="flex flex-col gap-2 p-1 max-h-[70vh] font-sans">
          {/* Search Input for Typeahead / Filtering */}
          <div className="pb-1 border-b border-[#16181f]">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search brands..."
              className="w-full bg-[#0c0e14] border border-[#1e222d] rounded-[3px] px-2.5 py-1 text-xs text-[#f3f4f6] placeholder-[#686e7b] focus:outline-none focus:border-[#d46b38]"
              aria-label="Filter brands by name"
            />
          </div>

          {/* Scrollable Checkbox List */}
          <div className="overflow-y-auto max-h-[260px]">
            {filteredBrands.length > 0 ? (
              <CheckboxList
                label="Brand"
                isLabelHidden
                density="compact"
                value={activeBrandIds}
                onChange={(values) => {
                  const diff = [
                    ...activeBrandIds.filter((v) => !values.includes(v)),
                    ...values.filter((v) => !activeBrandIds.includes(v)),
                  ];
                  diff.forEach((d) => onToggleBrand(d));
                }}
              >
                {filteredBrands.map((b) => (
                  <CheckboxListItem
                    key={b.brandId}
                    label={b.brandName}
                    value={b.brandId}
                    endContent={<CountBadge count={b.count} />}
                  />
                ))}
              </CheckboxList>
            ) : (
              <div className="py-4 text-center text-xs text-[#686e7b]">
                No brands matching &quot;{searchTerm}&quot;
              </div>
            )}
          </div>
        </div>
      }
    >
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-sans border transition-colors cursor-pointer rounded-[3px] ${
          totalSelected > 0
            ? "border-[#d46b38] bg-[#d46b3810] text-[#f3f4f6]"
            : "border-[#1e222d] text-[#9da2ad] hover:border-[#2a2f3d] hover:text-[#c5c9d4] bg-[#090b10]"
        }`}
        aria-label={`Filter by Brand (${totalSelected} active)`}
      >
        <span className="truncate max-w-[140px]">{triggerLabel}</span>
        <span className="text-[10px] text-[#686e7b]" aria-hidden="true">▾</span>
      </button>
    </Popover>
  );
}
