import type {
  AdLibraryCardItem,
  AdLibraryCreativeVariation,
} from "@/features/ad-library/types";

/**
 * Calculates the next index in a circular variation list.
 */
export function getNextCardIndex(currentIndex: number, totalVariations: number): number {
  if (totalVariations <= 0) return 0;
  return (currentIndex + 1) % totalVariations;
}

/**
 * Calculates the previous index in a circular variation list.
 */
export function getPrevCardIndex(currentIndex: number, totalVariations: number): number {
  if (totalVariations <= 0) return 0;
  return (currentIndex - 1 + totalVariations) % totalVariations;
}

/**
 * Clamps a given index within valid bounds [0, totalVariations - 1].
 */
export function clampCardIndex(index: number, totalVariations: number): number {
  if (totalVariations <= 0) return 0;
  return Math.max(0, Math.min(index, totalVariations - 1));
}

export interface ActiveDcoVariationState {
  variation: AdLibraryCreativeVariation | AdLibraryCardItem | undefined;
  /**
   * @deprecated Use variation for product representation
   */
  card: AdLibraryCreativeVariation | AdLibraryCardItem | undefined;
  index: number;
  position: number;
  total: number;
  headline?: string | null;
  body?: string | null;
  ctaText?: string | null;
  description?: string | null;
  destinationUrl?: string | null;
}

/**
 * Synchronizes active DCO variation metadata with fallback to parent item fields.
 */
export function getActiveDcoVariationState(
  variations: (AdLibraryCreativeVariation | AdLibraryCardItem)[],
  index: number,
  fallbackHeadline?: string | null,
  fallbackBody?: string | null,
  fallbackCta?: string | null,
): ActiveDcoVariationState {
  if (!variations || variations.length === 0) {
    return {
      variation: undefined,
      card: undefined,
      index: 0,
      position: 1,
      total: 0,
      headline: fallbackHeadline,
      body: fallbackBody,
      ctaText: fallbackCta,
    };
  }

  const validIndex = clampCardIndex(index, variations.length);
  const variation = variations[validIndex];

  return {
    variation,
    card: variation,
    index: validIndex,
    position: variation.position || validIndex + 1,
    total: variations.length,
    headline: variation.headline ?? fallbackHeadline,
    body: variation.body ?? fallbackBody,
    ctaText: variation.ctaText ?? fallbackCta,
    description: variation.description,
    destinationUrl: variation.destinationUrl,
  };
}

export const getActiveDcoCardState = getActiveDcoVariationState;
export type ActiveDcoCardState = ActiveDcoVariationState;
