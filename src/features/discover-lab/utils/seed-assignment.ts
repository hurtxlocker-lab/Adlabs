import type { AdLibraryItem } from "@/features/ad-library/types";
import { resolveDiscoverRepresentativeCreative } from "./representative-creative";
import type {
  PackedFieldCompositionResult,
  PackedFieldSlot,
  PackedPlateAssignment,
  SlotAssignment,
} from "../types";

/**
 * 32-bit FNV-1a hash function for strings.
 */
function fnv1a(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Mulberry32 deterministic seeded pseudo-random number generator.
 */
function createMulberry32(seed: number) {
  let state = seed;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministically shuffles an array using a seeded PRNG (Fisher-Yates).
 */
export function seededShuffle<T>(array: readonly T[], seedString: string): T[] {
  const seed = fnv1a(seedString);
  const prng = createMulberry32(seed);
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }

  return copy;
}

/**
 * Architectural slot processing order for Packed Field v1.1.
 * Major structural masses (H, C, D, G, F) are filled before flexible (E, B) and punctuation (A) slots.
 */
export const SLOT_ASSIGNMENT_ORDER = ["H", "C", "D", "G", "F", "E", "B", "A"];

/**
 * Checks whether an ad library item is physically and presentationally compatible with a slot.
 * Uses the exact representative creative (Variation 1 for multi-variation items, primary for standalone).
 */
export function isItemCompatibleWithSlot(
  item: AdLibraryItem,
  slot: PackedFieldSlot,
): boolean {
  const rep = resolveDiscoverRepresentativeCreative(item);
  const { shapeFamily, aspectRatio } = rep;

  switch (slot.id) {
    case "H":
      // Dominant horizontal anchor: wide or landscape only
      return shapeFamily === "landscape" || shapeFamily === "wide";

    case "C":
      // Vertical counterweight: portrait always; balanced/square only if aspectRatio < 1.0 (e.g. 4:5)
      if (shapeFamily === "portrait") return true;
      if (shapeFamily === "square" && aspectRatio < 1.0) return true;
      return false;

    case "D":
      // Left vertical mass: portrait always; balanced only if aspectRatio <= 0.90
      if (shapeFamily === "portrait") return true;
      if (shapeFamily === "square" && aspectRatio <= 0.9) return true;
      return false;

    case "E":
      // Central flex mass: square, portrait, or landscape
      return (
        shapeFamily === "square" ||
        shapeFamily === "portrait" ||
        shapeFamily === "landscape"
      );

    case "A":
      // Punctuation artifact: square or portrait
      return shapeFamily === "square" || shapeFamily === "portrait";

    case "F":
      // Horizontal support band: landscape or wide
      return shapeFamily === "landscape" || shapeFamily === "wide";

    case "B":
      // Balanced south-central support: square or landscape
      return shapeFamily === "square" || shapeFamily === "landscape";

    case "G":
      // Closing horizontal mass: landscape or wide
      return shapeFamily === "landscape" || shapeFamily === "wide";

    default:
      return slot.preferredShapes.includes(shapeFamily);
  }
}

/**
 * Returns a numerical rank (lower is more preferred) for preferred matching within a slot's compatible pool.
 * Uses the exact representative creative (Variation 1 for multi-variation items, primary for standalone).
 */
export function getItemPreferenceRank(
  item: AdLibraryItem,
  slot: PackedFieldSlot,
): number {
  const rep = resolveDiscoverRepresentativeCreative(item);
  const { shapeFamily, aspectRatio } = rep;

  switch (slot.id) {
    case "H":
      if (shapeFamily === "wide") return 0;
      if (shapeFamily === "landscape") return 1;
      return 99;

    case "C":
      if (shapeFamily === "portrait") return 0;
      if (shapeFamily === "square" && aspectRatio < 1.0) return 1;
      return 99;

    case "D":
      if (shapeFamily === "portrait") return 0;
      if (shapeFamily === "square" && aspectRatio <= 0.9) return 1;
      return 99;

    case "E":
      if (shapeFamily === "square") return 0;
      if (shapeFamily === "portrait") return 1;
      if (shapeFamily === "landscape") return 2;
      return 99;

    case "A":
      if (shapeFamily === "square") return 0;
      if (shapeFamily === "portrait") return 1;
      return 99;

    case "F":
      if (shapeFamily === "wide") return 0;
      if (shapeFamily === "landscape") return 1;
      return 99;

    case "B":
      if (shapeFamily === "square") return 0;
      if (shapeFamily === "landscape") return 1;
      return 99;

    case "G":
      if (shapeFamily === "wide") return 0;
      if (shapeFamily === "landscape") return 1;
      return 99;

    default:
      return 0;
  }
}

/**
 * Deterministically assigns items to a single plate's slots following priority order and preferred matching.
 */
export function assignCreativesToSlots(
  items: readonly AdLibraryItem[],
  slots: readonly PackedFieldSlot[],
  seed = "adlabs-packed-field-v1",
): { assignments: SlotAssignment[]; unassignedItems: AdLibraryItem[] } {
  if (!items || items.length === 0) {
    return {
      assignments: slots.map((slot) => ({ slot, item: null })),
      unassignedItems: [],
    };
  }

  const shuffledPool = seededShuffle(items, seed);
  const assignedItemIds = new Set<string>();
  const assignedMap = new Map<string, AdLibraryItem | null>();

  // Process slots in architectural priority order: H, C, D, G, F, E, B, A
  const orderedSlots = [...slots].sort(
    (a, b) => SLOT_ASSIGNMENT_ORDER.indexOf(a.id) - SLOT_ASSIGNMENT_ORDER.indexOf(b.id),
  );

  for (const slot of orderedSlots) {
    const compatibleCandidates = shuffledPool.filter(
      (candidate) =>
        !assignedItemIds.has(candidate.id) &&
        isItemCompatibleWithSlot(candidate, slot),
    );

    if (compatibleCandidates.length > 0) {
      // Sort by preference ranking while preserving deterministic pool order for ties
      compatibleCandidates.sort(
        (a, b) => getItemPreferenceRank(a, slot) - getItemPreferenceRank(b, slot),
      );

      const chosen = compatibleCandidates[0];
      assignedItemIds.add(chosen.id);
      assignedMap.set(slot.id, chosen);
    } else {
      assignedMap.set(slot.id, null);
    }
  }

  // Reconstruct assignments in original template plate order
  const assignments: SlotAssignment[] = slots.map((slot) => ({
    slot,
    item: assignedMap.get(slot.id) ?? null,
  }));

  const unassignedItems = items.filter((item) => !assignedItemIds.has(item.id));

  return {
    assignments,
    unassignedItems,
  };
}

/**
 * Partitions an entire corpus into sequential packed plates using the authored topology.
 */
export function partitionCreativesIntoPlates(
  items: readonly AdLibraryItem[],
  template: readonly PackedFieldSlot[],
  baseSeed = "adlabs-packed-field-v1",
): PackedFieldCompositionResult {
  if (!items || items.length === 0) {
    return {
      plates: [],
      unassignedItems: [],
    };
  }

  const plates: PackedPlateAssignment[] = [];
  let remainingPool = [...items];
  let plateIndex = 0;

  // Maximum plates bounded by corpus size
  const maxPlates = Math.ceil(items.length / Math.max(1, template.length - 2)) + 1;

  while (remainingPool.length > 0 && plateIndex < maxPlates) {
    // Stop if remaining pool cannot reasonably populate a major portion of the plate
    if (remainingPool.length < 3 && plateIndex > 0) {
      break;
    }

    const plateSeed = `${baseSeed}-plate-${plateIndex + 1}`;
    const result = assignCreativesToSlots(remainingPool, template, plateSeed);

    const filledCount = result.assignments.filter((a) => a.item !== null).length;

    // If no items could be assigned to any slot in the plate, break to avoid looping
    if (filledCount === 0) {
      break;
    }

    plates.push({
      plateIndex: plateIndex + 1,
      assignments: result.assignments,
    });

    remainingPool = result.unassignedItems;
    plateIndex++;
  }

  return {
    plates,
    unassignedItems: remainingPool,
  };
}

