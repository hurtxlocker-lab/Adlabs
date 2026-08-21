"use client";

/**
 * CheckboxGroupFilter — compact inline multi-select for the primary rail.
 *
 * Semantics: role="group" + aria-labelledby pointing at the section label;
 * each option is a REAL checkbox input (visually hidden) wrapped in a label,
 * so the native checkbox role/checked/keyboard behavior is preserved while the
 * AdLabs pill aesthetic is retained via :has() styling on the label.
 *
 * This is used for multi-select dimensions in the rail (Format, Shape,
 * Reached country). More Filters uses Astryx CheckboxList for the same
 * semantics in a layered surface.
 */

import { FILTER_SECTION_LABEL_CLASS } from "./filter-section";

export interface CheckboxOption {
  value: string;
  label: string;
  count?: number;
}

export interface CheckboxGroupFilterProps {
  id: string;
  label: string;
  options: CheckboxOption[];
  selected: string[];
  onToggle: (value: string) => void;
}

export function CheckboxGroupFilter({
  id,
  label,
  options,
  selected,
  onToggle,
}: CheckboxGroupFilterProps) {
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-1.5">
      <span id={id} className={FILTER_SECTION_LABEL_CLASS}>
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const isSelected = selected.includes(opt.value);
          return (
            <label
              key={opt.value}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-sans transition-colors border cursor-pointer ${
                isSelected
                  ? "border-[#d46b38] text-[#d46b38] bg-[#d46b3812]"
                  : "border-[#1e222d] text-[#9da2ad] hover:border-[#2a2f3d] hover:text-[#c5c9d4]"
              } has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-[#d46b38]`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={isSelected}
                onChange={() => onToggle(opt.value)}
              />
              <span>{opt.label}</span>
              {opt.count !== undefined && opt.count > 0 && (
                <span
                  className={`font-mono text-[10px] ${
                    isSelected ? "text-[#d46b3899]" : "text-[#686e7b]"
                  }`}
                >
                  {opt.count}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
