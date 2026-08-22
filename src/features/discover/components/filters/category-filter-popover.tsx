"use client";

import {
  CheckboxList,
  CheckboxListItem,
  Popover,
} from "@/components/ui/astryx";
import type {
  DiscoveryFacetsResult,
  DiscoveryFilterInput,
} from "@/discovery/filters/types";

export interface CategoryFilterPopoverProps {
  facets: DiscoveryFacetsResult;
  filter: DiscoveryFilterInput;
  onToggleCategory: (category: string) => void;
}

function CountBadge({ count }: { count: number }) {
  return <span className="font-mono text-[10px] text-[#686e7b]">{count}</span>;
}

export function CategoryFilterPopover({
  facets,
  filter,
  onToggleCategory,
}: CategoryFilterPopoverProps) {
  const activeCategories = filter.pageCategories ?? [];
  const totalSelected = activeCategories.length;
  const options = facets.pageCategories;

  let triggerLabel = "Category";
  if (totalSelected === 1) {
    triggerLabel = `Category: ${activeCategories[0]}`;
  } else if (totalSelected > 1) {
    triggerLabel = `Category · ${totalSelected}`;
  }

  if (options.length === 0 && totalSelected === 0) {
    return null;
  }

  return (
    <Popover
      label="Category"
      placement="below"
      alignment="start"
      width={320}
      content={
        <div className="flex flex-col gap-3 p-1 max-h-[70vh] overflow-y-auto font-sans">
          <div className="flex flex-col gap-1 pb-2 border-b border-[#16181f]">
            <h4 className="text-[10px] font-sans tracking-widest uppercase text-[#686e7b] select-none">
              Advertiser Page Category
            </h4>
            <p className="text-[11px] text-[#8e95a2] leading-tight">
              The commercial category shown on the advertiser&apos;s Meta Page, not a classification of this creative.
            </p>
          </div>

          <CheckboxList
            label="Page Category"
            isLabelHidden
            density="compact"
            value={activeCategories}
            onChange={(values) => {
              const diff = [
                ...activeCategories.filter((v) => !values.includes(v)),
                ...values.filter((v) => !activeCategories.includes(v)),
              ];
              diff.forEach((d) => onToggleCategory(d));
            }}
          >
            {options.map((pc) => (
              <CheckboxListItem
                key={pc.value}
                label={pc.value}
                value={pc.value}
                endContent={<CountBadge count={pc.count} />}
              />
            ))}
          </CheckboxList>
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
        aria-label={`Filter by Advertiser Page Category (${totalSelected} active)`}
        title="Advertiser Page Category — the commercial category shown on the advertiser's Meta Page, not a classification of this creative."
      >
        <span className="truncate max-w-[160px]">{triggerLabel}</span>
        <span className="text-[10px] text-[#686e7b]" aria-hidden="true">▾</span>
      </button>
    </Popover>
  );
}
