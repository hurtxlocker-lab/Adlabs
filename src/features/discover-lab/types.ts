import type { AdLibraryItem } from "@/features/ad-library/types";
import type { CreativeShapeFamily } from "@/features/discover/utils/creative-shape";

export type SlotWeight = "anchor" | "major" | "support" | "punctuation";
export type HorizontalAlignment = "start" | "center" | "end";
export type VerticalAlignment = "start" | "center" | "end";

export interface PackedFieldSlot {
  id: string; // "H" | "C" | "D" | "E" | "A" | "F" | "B" | "G"
  name: string;
  weight: SlotWeight;
  preferredShapes: CreativeShapeFamily[];
  allowsMultiVariation?: boolean;
  alignment: {
    horizontal: HorizontalAlignment;
    vertical: VerticalAlignment;
  };
  maxMediaHeightClass?: string;
  maxMediaWidthClass?: string;
}

export interface SlotAssignment {
  slot: PackedFieldSlot;
  item: AdLibraryItem | null;
}

export interface PackedPlateAssignment {
  plateIndex: number;
  assignments: SlotAssignment[];
}

export interface PackedFieldCompositionResult {
  plates: PackedPlateAssignment[];
  unassignedItems: AdLibraryItem[];
}
