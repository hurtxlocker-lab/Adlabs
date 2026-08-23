"use client";

import { useState } from "react";
import type {
  DiscoveryFacetsResult,
  DiscoveryFilterInput,
} from "@/discovery/filters/types";
import { NativePopover } from "./native-popover";

export interface BrandFilterPopoverProps {
  facets: DiscoveryFacetsResult;
  filter: DiscoveryFilterInput;
  onToggleBrand: (brandId: string) => void;
  brandNameMap?: Record<string, string>;
}

function CountBadge({ count }: { count: number }) {
  return <span className="font-mono text-[10px] text-[#686e7b]">{count}</span>;
}

export function BrandFilterPopover({
  facets,
  filter,
  onToggleBrand,
  brandNameMap,
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
    const singleBrand =
      brands.find((b) => b.brandId === activeBrandIds[0])?.brandName ??
      brandNameMap?.[activeBrandIds[0]];
    triggerLabel = singleBrand ? singleBrand : "Brand · 1";
  } else if (totalSelected > 1) {
    triggerLabel = `Brand · ${totalSelected}`;
  }

  if (brands.length === 0 && totalSelected === 0) {
    return null;
  }

  return (
    <NativePopover
      width={300}
      trigger={({ isOpen, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-sans border transition-colors cursor-pointer rounded-[3px] ${
            totalSelected > 0
              ? "border-[#d46b38] bg-[#d46b3810] text-[#f3f4f6]"
              : "border-[#1e222d] text-[#9da2ad] hover:border-[#2a2f3d] hover:text-[#c5c9d4] bg-[#090b10]"
          }`}
          aria-label={`Filter by Brand (${totalSelected} active)`}
        >
          <span className="truncate max-w-[140px]">{triggerLabel}</span>
          <span className="text-[10px] text-[#686e7b]" aria-hidden="true">
            ▾
          </span>
        </button>
      )}
    >
      {() => (
        <div className="flex flex-col gap-2 font-sans">
          {/* Search Input */}
          <div className="pb-1 border-b border-[#16181f]">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search brands..."
              className="w-full bg-[#0c0e14] border border-[#1e222d] rounded-[3px] px-2.5 py-1 text-xs text-[#f3f4f6] placeholder-[#686e7b] focus:outline-none focus:border-[#d46b38]"
              aria-label="Filter brands by name"
              autoFocus
            />
          </div>

          {/* Brand Checkbox List */}
          <div className="overflow-y-auto max-h-[260px] flex flex-col gap-1 pr-1">
            {filteredBrands.length > 0 ? (
              filteredBrands.map((b) => {
                const isChecked = activeBrandIds.includes(b.brandId);
                return (
                  <label
                    key={b.brandId}
                    className="flex items-center justify-between gap-2 px-1.5 py-1 text-xs text-[#9da2ad] hover:text-[#f3f4f6] hover:bg-[#12151c] rounded-[2px] cursor-pointer select-none transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggleBrand(b.brandId)}
                        className="accent-[#d46b38] w-3.5 h-3.5 rounded-[2px] cursor-pointer"
                      />
                      <span
                        className={`truncate ${isChecked ? "text-[#f3f4f6] font-medium" : ""}`}
                      >
                        {b.brandName}
                      </span>
                    </div>
                    <CountBadge count={b.count} />
                  </label>
                );
              })
            ) : (
              <div className="py-4 text-center text-xs text-[#686e7b]">
                No brands matching &quot;{searchTerm}&quot;
              </div>
            )}
          </div>
        </div>
      )}
    </NativePopover>
  );
}
