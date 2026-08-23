"use client";

import type {
  DiscoveryFacetsResult,
  DiscoveryFilterInput,
} from "@/discovery/filters/types";
import type { CreativeShapeFamily } from "@/features/discover/utils/creative-shape";
import { NativePopover } from "./native-popover";

export interface CreativeFilterContentProps {
  facets: DiscoveryFacetsResult;
  filter: DiscoveryFilterInput;
  onToggleFormat: (format: string) => void;
  onToggleShape: (shape: CreativeShapeFamily) => void;
}

function CountBadge({ count }: { count: number }) {
  return <span className="font-mono text-[10px] text-[#686e7b]">{count}</span>;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[10px] font-sans tracking-widest uppercase text-[#686e7b] select-none mb-1.5">
      {children}
    </h4>
  );
}

export function CreativeFilterContent({
  facets,
  filter,
  onToggleFormat,
  onToggleShape,
}: CreativeFilterContentProps) {
  const activeFormats = filter.mediaTypes ?? [];
  const activeShapes = filter.shapeFamilies ?? [];
  const hasFormats = facets.mediaTypes.length > 0;
  const hasShapes = facets.shapeFamilies.length > 0;

  return (
    <div className="flex flex-col gap-4 font-sans">
      {hasFormats && (
        <div className="flex flex-col gap-1">
          <SectionHeading>Format</SectionHeading>
          <div className="flex flex-col gap-1">
            {facets.mediaTypes.map((mt) => {
              const isChecked = activeFormats.includes(mt.value);
              const label =
                mt.value.charAt(0) + mt.value.slice(1).toLowerCase();
              return (
                <label
                  key={mt.value}
                  className="flex items-center justify-between gap-2 px-1.5 py-1 text-xs text-[#9da2ad] hover:text-[#f3f4f6] hover:bg-[#12151c] rounded-[2px] cursor-pointer select-none transition-colors"
                >
                  <div className="flex items-center gap-2 truncate">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggleFormat(mt.value)}
                      className="accent-[#d46b38] w-3.5 h-3.5 rounded-[2px] cursor-pointer"
                    />
                    <span
                      className={`truncate ${isChecked ? "text-[#f3f4f6] font-medium" : ""}`}
                    >
                      {label}
                    </span>
                  </div>
                  <CountBadge count={mt.count} />
                </label>
              );
            })}
          </div>
        </div>
      )}

      {hasShapes && (
        <div className="flex flex-col gap-1">
          <SectionHeading>Shape</SectionHeading>
          <div className="flex flex-col gap-1">
            {facets.shapeFamilies.map((sf) => {
              const isChecked = activeShapes.includes(
                sf.value as CreativeShapeFamily,
              );
              const label =
                sf.value.charAt(0).toUpperCase() + sf.value.slice(1);
              return (
                <label
                  key={sf.value}
                  className="flex items-center justify-between gap-2 px-1.5 py-1 text-xs text-[#9da2ad] hover:text-[#f3f4f6] hover:bg-[#12151c] rounded-[2px] cursor-pointer select-none transition-colors"
                >
                  <div className="flex items-center gap-2 truncate">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() =>
                        onToggleShape(sf.value as CreativeShapeFamily)
                      }
                      className="accent-[#d46b38] w-3.5 h-3.5 rounded-[2px] cursor-pointer"
                    />
                    <span
                      className={`truncate ${isChecked ? "text-[#f3f4f6] font-medium" : ""}`}
                    >
                      {label}
                    </span>
                  </div>
                  <CountBadge count={sf.count} />
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function CreativeFilterPopover({
  facets,
  filter,
  onToggleFormat,
  onToggleShape,
}: CreativeFilterContentProps) {
  const activeFormats = filter.mediaTypes ?? [];
  const activeShapes = filter.shapeFamilies ?? [];
  const totalSelected = activeFormats.length + activeShapes.length;

  let triggerLabel = "Creative";
  if (totalSelected === 1) {
    if (activeFormats.length === 1) {
      const f = activeFormats[0];
      triggerLabel = f.charAt(0) + f.slice(1).toLowerCase();
    } else if (activeShapes.length === 1) {
      const s = activeShapes[0];
      triggerLabel = s.charAt(0).toUpperCase() + s.slice(1);
    }
  } else if (
    totalSelected === 2 &&
    activeFormats.length === 1 &&
    activeShapes.length === 1
  ) {
    const f =
      activeFormats[0].charAt(0) + activeFormats[0].slice(1).toLowerCase();
    const s = activeShapes[0].charAt(0).toUpperCase() + activeShapes[0].slice(1);
    triggerLabel = `${f} · ${s}`;
  } else if (totalSelected > 0) {
    triggerLabel = `Creative · ${totalSelected}`;
  }

  const hasFormats = facets.mediaTypes.length > 0;
  const hasShapes = facets.shapeFamilies.length > 0;

  if (!hasFormats && !hasShapes && totalSelected === 0) {
    return null;
  }

  return (
    <NativePopover
      width={280}
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
          aria-label={`Filter by Creative properties (${totalSelected} active)`}
        >
          <span>{triggerLabel}</span>
          <span className="text-[10px] text-[#686e7b]" aria-hidden="true">
            ▾
          </span>
        </button>
      )}
    >
      {() => (
        <CreativeFilterContent
          facets={facets}
          filter={filter}
          onToggleFormat={onToggleFormat}
          onToggleShape={onToggleShape}
        />
      )}
    </NativePopover>
  );
}
