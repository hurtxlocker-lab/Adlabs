import type { AdLibraryCreativeVariation } from "@/features/ad-library/types";

export type PsyenceLayoutType = "single" | "duo" | "trio" | "quad" | "overflow";

/**
 * Pure deterministic resolver for Psyence mosaic layouts based strictly on variation count.
 *
 * Rules:
 *  - count <= 1: "single" (bypasses mosaic scaffolding)
 *  - count === 2: "duo" (asymmetric weighted horizontal split: ~62% anchor, ~38% right)
 *  - count === 3: "trio" (large left anchor ~62%, stacked top-right and bottom-right ~38%)
 *  - count === 4: "quad" (balanced 2x2 grid)
 *  - count > 4: "overflow" (2x2 grid with 4th tile carrying +N remaining count)
 *
 * MVP Note on Semantics:
 *  Tile area does NOT represent performance, spend, emotion, or winner.
 *  Variation 1 is the structural anchor strictly because it is first in source-resolved order.
 */
export function resolvePsyenceLayout(variationCount: number): PsyenceLayoutType {
  if (variationCount <= 1) return "single";
  if (variationCount === 2) return "duo";
  if (variationCount === 3) return "trio";
  if (variationCount === 4) return "quad";
  return "overflow";
}

export interface VisiblePsyenceResult {
  visibleVariations: AdLibraryCreativeVariation[];
  remainingCount: number;
  layoutType: PsyenceLayoutType;
}

/**
 * Extracts visible variations bounded by the Discover cap (max 4 visible cells)
 * and computes remaining overflow count.
 */
export function getVisiblePsyenceVariations(
  variations: AdLibraryCreativeVariation[],
  maxVisible = 4,
): VisiblePsyenceResult {
  const count = variations ? variations.length : 0;
  const layoutType = resolvePsyenceLayout(count);

  if (count <= maxVisible) {
    return {
      visibleVariations: variations ?? [],
      remainingCount: 0,
      layoutType,
    };
  }

  return {
    visibleVariations: variations.slice(0, maxVisible),
    remainingCount: count - maxVisible,
    layoutType,
  };
}
