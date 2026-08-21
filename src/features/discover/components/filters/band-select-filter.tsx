"use client";

/**
 * BandSelectFilter — single-select band control backed by Astryx Selector.
 *
 * Used for Running time, Creative reuse, EU reach (contextual), and sort-like
 * single-choice band dimensions. The visible section label is rendered by the
 * caller via FilterSection; the Selector's own label stays accessible
 * (isLabelHidden) and names the control for assistive technology.
 *
 * Astryx provides the combobox/listbox interaction, keyboard navigation,
 * focus management, and Escape/outside-click dismissal. All visuals come from
 * AdLabs tokens/className via the .adlabs-astryx scope.
 */

import { Selector } from "@/components/ui/astryx";
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
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className={FILTER_SECTION_LABEL_CLASS}>
        {label}
      </span>
      <Selector
        label={label}
        isLabelHidden
        size="sm"
        variant="input"
        hasClear
        placeholder={placeholder}
        isDisabled={disabled}
        options={options.map((o) => ({ value: o.key, label: o.label }))}
        value={selectedKey}
        onChange={(value) => onSelect(value as string | null)}
        className="min-w-32"
      />
    </div>
  );
}
