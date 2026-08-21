"use client";

import type { SlotAssignment } from "@/features/discover/types/packed-field";
import { PackedSlotCard } from "./packed-slot-card";
import styles from "./packed-field.module.css";

interface PackedFieldPlateProps {
  plateIndex: number;
  assignments: SlotAssignment[];
}

const slotClassMap: Record<string, string> = {
  H: styles.slotH,
  C: styles.slotC,
  D: styles.slotD,
  E: styles.slotE,
  A: styles.slotA,
  F: styles.slotF,
  B: styles.slotB,
  G: styles.slotG,
};

export function PackedFieldPlate({
  plateIndex,
  assignments,
}: PackedFieldPlateProps) {
  return (
    <div
      data-plate-index={plateIndex}
      className={styles.plateGrid}
    >
      {assignments.map(({ slot, item }) => {
        const areaClass = slotClassMap[slot.id] ?? "";

        if (!item) {
          // Intentional authored negative space on desktop
          return (
            <div
              key={slot.id}
              data-slot-id={slot.id}
              data-weight={slot.weight}
              className={`${areaClass} hidden lg:block`}
              aria-hidden="true"
            />
          );
        }

        return (
          <div
            key={slot.id}
            data-slot-id={slot.id}
            data-weight={slot.weight}
            className={`w-full ${areaClass}`}
          >
            <PackedSlotCard
              item={item}
              slot={slot}
              clusterId={`plate-${plateIndex}-${slot.id}`}
            />
          </div>
        );
      })}
    </div>
  );
}
