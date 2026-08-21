"use client";

import type { AdLibraryItem } from "@/features/ad-library/types";
import { PACKED_FIELD_TEMPLATE_V1 } from "@/features/discover/templates/packed-field-v1";
import { partitionCreativesIntoPlates } from "@/features/discover/utils/seed-assignment";
import { PackedFieldPlate } from "./packed-field-plate";
import { PackedSlotCard } from "./packed-slot-card";

interface PackedFieldProps {
  items: AdLibraryItem[];
  baseSeed?: string;
}

export function PackedField({ items, baseSeed }: PackedFieldProps) {
  const { plates, unassignedItems } = partitionCreativesIntoPlates(
    items,
    PACKED_FIELD_TEMPLATE_V1,
    baseSeed,
  );

  return (
    <div className="w-full flex flex-col gap-16 sm:gap-20 lg:gap-24">
      {/* 1. Sequential Packed Field Plates */}
      {plates.map((plate) => (
        <section
          key={`plate-${plate.plateIndex}`}
          data-composition="packed-field-v1"
          className="w-full"
        >
          <PackedFieldPlate
            plateIndex={plate.plateIndex}
            assignments={plate.assignments}
          />
        </section>
      ))}

      {/* 2. Quiet Continuation Field for remaining unassigned creatives */}
      {unassignedItems.length > 0 && (
        <section className="w-full pt-10 sm:pt-14 border-t border-[#161820] flex flex-col gap-6">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-xs text-[#8e95a2] uppercase tracking-wider">
              Continuation Field
            </span>
            <span className="font-mono text-xs text-[#686e7b]">
              {unassignedItems.length} {unassignedItems.length === 1 ? "creative" : "creatives"}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 items-start">
            {unassignedItems.map((item) => (
              <div key={item.id} className="w-full">
                <PackedSlotCard
                  item={item}
                  slot={{
                    id: `cont-${item.id}`,
                    name: "Continuation",
                    weight: "support",
                    preferredShapes: ["portrait", "landscape", "square", "wide"],
                    alignment: {
                      horizontal: "start",
                      vertical: "start",
                    },
                    maxMediaHeightClass: "max-h-[380px]",
                    maxMediaWidthClass: "w-full max-w-full",
                  }}
                  clusterId="continuation"
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
