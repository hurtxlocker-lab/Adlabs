"use client";

/**
 * TransparencyFilter — evidence-quality gate.
 *
 * EU transparency is the primary toggle. EU reach is CONTEXTUAL: it is exposed
 * only when EU transparency is selected or when EU evidence exists in the
 * corpus (facet-driven). UK evidence is surfaced in More Filters (secondary).
 * BR stays hidden while zero evidence exists.
 */

import { Switch } from "@/components/ui/astryx";
import { FILTER_SECTION_LABEL_CLASS } from "./filter-section";
import { BandSelectFilter, type BandSelectOption } from "./band-select-filter";

export interface TransparencyFilterProps {
  euSelected: boolean;
  euCount: number;
  showEuReach: boolean;
  euReachOptions: BandSelectOption[];
  euReachSelectedKey: string | null;
  onEuToggle: (checked: boolean) => void;
  onEuReachSelect: (key: string | null) => void;
}

export function TransparencyFilter({
  euSelected,
  euCount,
  showEuReach,
  euReachOptions,
  euReachSelectedKey,
  onEuToggle,
  onEuReachSelect,
}: TransparencyFilterProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span id="transparency" className={FILTER_SECTION_LABEL_CLASS}>
        Transparency
      </span>
      <div className="flex items-center gap-2">
        <Switch
          label="EU"
          size="sm"
          value={euSelected}
          onChange={(checked) => onEuToggle(checked)}
        />
        {euCount > 0 && (
          <span className="font-mono text-[10px] text-[#686e7b]">{euCount}</span>
        )}
      </div>
      {showEuReach && (
        <BandSelectFilter
          id="eu-reach"
          label="EU reach"
          options={euReachOptions}
          selectedKey={euReachSelectedKey}
          onSelect={onEuReachSelect}
        />
      )}
    </div>
  );
}
