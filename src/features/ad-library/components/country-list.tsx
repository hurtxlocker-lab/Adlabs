"use client";

import React from "react";
import { formatCountryNames } from "../utils/country";
import { Popover } from "@/components/ui/astryx";

export interface CountryListProps {
  countryCodes: string[];
  maxInline?: number;
  className?: string;
  emptyLabel?: string;
}

export function CountryList({
  countryCodes,
  maxInline = 4,
  className = "",
  emptyLabel = "Worldwide delivery",
}: CountryListProps) {
  const formattedNames = formatCountryNames(countryCodes);

  if (formattedNames.length === 0) {
    return <span className={`text-[#788296] text-xs font-sans italic ${className}`}>{emptyLabel}</span>;
  }

  // 1-3 countries: clean inline text with subtle dot separation
  if (formattedNames.length <= 3) {
    return (
      <span className={`text-xs sm:text-[13px] font-medium text-[#f1f5f9] font-sans tracking-wide ${className}`}>
        {formattedNames.join(" · ")}
      </span>
    );
  }

  // 4-6 countries: compact wrap with luminous pills
  if (formattedNames.length <= 6) {
    return (
      <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
        {formattedNames.map((name) => (
          <span
            key={name}
            className="px-2 py-0.5 bg-[#141b29] border border-[#222f46] text-xs font-medium text-[#f1f5f9] rounded-[4px] shadow-sm"
          >
            {name}
          </span>
        ))}
      </div>
    );
  }

  // 7+ countries: First maxInline + "+N more" with Popover
  const visible = formattedNames.slice(0, maxInline);
  const remainingCount = formattedNames.length - maxInline;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {visible.map((name) => (
        <span
          key={name}
          className="px-2 py-0.5 bg-[#141b29] border border-[#222f46] text-xs font-medium text-[#f1f5f9] rounded-[4px] shadow-sm"
        >
          {name}
        </span>
      ))}

      <Popover
        label="All Disclosed Markets"
        placement="below"
        alignment="start"
        width={260}
        content={
          <div className="flex flex-col gap-2 p-2.5 bg-[#0f1523] text-xs font-sans text-[#f1f5f9] border border-[#26354d] rounded-[6px] shadow-2xl">
            <div className="flex items-center justify-between pb-1.5 border-b border-[#1c273a]">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#94a3b8] font-semibold">
                All Disclosed Markets ({formattedNames.length})
              </span>
            </div>
            <div className="max-h-56 overflow-y-auto pr-1 flex flex-col gap-1 text-xs">
              {formattedNames.map((name) => (
                <div
                  key={name}
                  className="py-1 px-1.5 rounded-[3px] hover:bg-[#1a2438] text-[#f1f5f9] flex items-center justify-between transition-colors"
                >
                  <span>{name}</span>
                </div>
              ))}
            </div>
          </div>
        }
      >
        <button
          type="button"
          className="px-2 py-0.5 bg-[#172235] hover:bg-[#1f2e47] border border-[#293d5e] text-xs font-mono font-semibold text-[#38bdf8] rounded-[4px] transition-colors cursor-pointer inline-flex items-center gap-0.5 shadow-sm"
          aria-label={`View all ${formattedNames.length} countries`}
        >
          <span>+{remainingCount} more</span>
        </button>
      </Popover>
    </div>
  );
}
