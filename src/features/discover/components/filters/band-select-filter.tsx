"use client";

/**
 * BandSelectFilter — single-select band control backed by native HTML select.
 *
 * Used for Running time, Creative reuse, EU reach, and single-choice band dimensions.
 */

import { FILTER_SECTION_LABEL_CLASS } from "./filter-section";

export interface BandSelectOption {
  key: string;
  label: string;
}

export interface BandSelectFilterProps {
  id: string;
  label: string;
  options: BandSelectOption[];
  selectedKey: string | null;
  placeholder?: string;
  disabled?: boolean;
  onSelect: (key: string | null) => void;
}

export function BandSelectFilter({
  id,
  label,
  options,
  selectedKey,
  placeholder = "Any",
  disabled,
  onSelect,
}: BandSelectFilterProps) {
  const isSelected = selectedKey !== null && selectedKey !== "";

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={FILTER_SECTION_LABEL_CLASS}>
        {label}
      </label>
      <div className="relative inline-block">
        <select
          id={id}
          value={selectedKey ?? ""}
          disabled={disabled}
          onChange={(e) => onSelect(e.target.value ? e.target.value : null)}
          className={`appearance-none bg-[#090b10] border rounded-[3px] px-2.5 py-1 pr-7 text-xs font-sans cursor-pointer transition-colors focus:outline-none focus:border-[#d46b38] ${
            isSelected
              ? "border-[#d46b38] bg-[#d46b3810] text-[#f3f4f6]"
              : "border-[#1e222d] text-[#9da2ad] hover:border-[#2a2f3d] hover:text-[#c5c9d4]"
          }`}
          aria-label={`Filter by ${label}`}
        >
          <option value="" className="bg-[#090b10] text-[#9da2ad]">
            {placeholder}
          </option>
          {options.map((opt) => (
            <option
              key={opt.key}
              value={opt.key}
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
