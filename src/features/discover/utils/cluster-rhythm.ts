import type { AdLibraryItem } from "@/features/ad-library";

export type DiscoverLayoutRole = "lead" | "supporting" | "offset" | "wide";

export interface ClusteredItem {
  item: AdLibraryItem;
  index: number;
  role: DiscoverLayoutRole;
}

export type ClusterType =
  | "lead-companion"
  | "offset-duo-wide"
  | "mirrored-lead";

export interface DiscoverCluster {
  id: string;
  type: ClusterType;
  items: ClusteredItem[];
}

/**
 * Selects the best candidate index within a 3-item chunk for the "wide" horizontal layout role.
 *
 * Preference rules based only on existing, factual presentation characteristics:
 * 1. Prefer multi-card / DCO or static image formats over pure vertical video when formats are mixed.
 * 2. If all items share the same format (or no preference), stably defaults to the 3rd item (index 2).
 */
export function selectWideCandidateIndex(chunk: AdLibraryItem[]): number {
  if (chunk.length < 3) return chunk.length - 1;

  const nonPureVideoIndices: number[] = [];
  const pureVideoIndices: number[] = [];

  chunk.forEach((item, idx) => {
    const isPureVideo =
      item.displayFormat === "VIDEO" && item.cards.length === 0;

    if (isPureVideo) {
      pureVideoIndices.push(idx);
    } else {
      nonPureVideoIndices.push(idx);
    }
  });

  // If a mixed cluster contains an image/DCO item alongside vertical videos, prefer it for wide role
  if (nonPureVideoIndices.length > 0 && pureVideoIndices.length > 0) {
    return nonPureVideoIndices[0];
  }

  // Stable default
  return 2;
}

/**
 * Deterministically partitions an arbitrary list of items into authored layout clusters.
 *
 * Cluster cycle (groups of 3):
 *  - Cluster 0: "lead-companion" (Item 0 lead 7-col, Items 1-2 supporting 5-col)
 *  - Cluster 1: "offset-duo-wide" (Dual offset side-by-side + 1 wide centerpiece)
 *  - Cluster 2: "mirrored-lead" (Items 6-7 supporting 5-col left, Item 8 lead 7-col right)
 *
 * Repeats seamlessly for arbitrary corpus sizes (e.g. 9, 12, 18, 30 items).
 * Handles partial clusters gracefully (1 or 2 items).
 */
export function partitionIntoClusters(
  items: AdLibraryItem[],
): DiscoverCluster[] {
  const clusters: DiscoverCluster[] = [];
  const chunkSize = 3;

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const clusterIndex = Math.floor(i / chunkSize);
    const cycleTypeIndex = clusterIndex % 3;

    let type: ClusterType;
    let clusterItems: ClusteredItem[];

    if (cycleTypeIndex === 0) {
      type = "lead-companion";
      clusterItems = chunk.map((item, idx) => ({
        item,
        index: i + idx,
        role: idx === 0 ? "lead" : "supporting",
      }));
    } else if (cycleTypeIndex === 1) {
      type = "offset-duo-wide";
      const wideIndex = selectWideCandidateIndex(chunk);

      clusterItems = chunk.map((item, idx) => ({
        item,
        index: i + idx,
        role: idx === wideIndex ? "wide" : "offset",
      }));
    } else {
      type = "mirrored-lead";
      clusterItems = chunk.map((item, idx) => ({
        item,
        index: i + idx,
        role: idx === chunk.length - 1 ? "lead" : "supporting",
      }));
    }

    clusters.push({
      id: `cluster-${clusterIndex}`,
      type,
      items: clusterItems,
    });
  }

  return clusters;
}
