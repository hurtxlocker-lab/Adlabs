import { describe, expect, it } from "vitest";
import type { AdLibraryItem } from "@/features/ad-library";
import {
  partitionIntoClusters,
  selectWideCandidateIndex,
} from "../utils/cluster-rhythm";

function createMockAd(
  id: string,
  index: number,
  displayFormat: string = index % 2 === 0 ? "VIDEO" : "DCO",
): AdLibraryItem {
  return {
    id,
    source: "meta",
    sourceAdId: `mock-source-${index}`,
    brand: {
      id: `brand-${index % 3}`,
      name: `Brand ${index % 3}`,
      slug: `brand-${index % 3}`,
    },
    displayFormat,
    primaryText: `Primary copy for mock ad ${index}`,
    headline: `Headline for mock ad ${index}`,
    description: null,
    ctaText: "Shop Now",
    ctaType: "SHOP_NOW",
    destinationUrl: "https://example.com",
    publisherPlatforms: ["facebook", "instagram"],
    isActiveObserved: true,
    firstSeenAt: new Date("2026-08-15T00:00:00.000Z"),
    lastSeenAt: new Date("2026-08-15T00:00:00.000Z"),
    adLibraryUrl: null,
    media: [],
    cards: displayFormat === "DCO" ? [{ id: "c1", position: 0, headline: "H", body: "B", description: null, ctaText: null, ctaType: null, destinationUrl: null, media: [] }] : [],
  };
}

describe("Discover Cluster Rhythm Partitioner", () => {
  it("1. partitions 9 items into three authored clusters with cycling tempo", () => {
    // 9 video ads
    const mockAds = Array.from({ length: 9 }, (_, i) =>
      createMockAd(`ad-${i}`, i, "VIDEO"),
    );

    const clusters = partitionIntoClusters(mockAds);

    expect(clusters).toHaveLength(3);

    // Cluster 0: lead-companion
    expect(clusters[0].id).toBe("cluster-0");
    expect(clusters[0].type).toBe("lead-companion");
    expect(clusters[0].items).toHaveLength(3);
    expect(clusters[0].items[0].role).toBe("lead");
    expect(clusters[0].items[0].index).toBe(0);
    expect(clusters[0].items[1].role).toBe("supporting");
    expect(clusters[0].items[1].index).toBe(1);
    expect(clusters[0].items[2].role).toBe("supporting");
    expect(clusters[0].items[2].index).toBe(2);

    // Cluster 1: offset-duo-wide
    expect(clusters[1].id).toBe("cluster-1");
    expect(clusters[1].type).toBe("offset-duo-wide");
    expect(clusters[1].items).toHaveLength(3);
    expect(clusters[1].items[0].role).toBe("offset");
    expect(clusters[1].items[0].index).toBe(3);
    expect(clusters[1].items[1].role).toBe("offset");
    expect(clusters[1].items[1].index).toBe(4);
    expect(clusters[1].items[2].role).toBe("wide");
    expect(clusters[1].items[2].index).toBe(5);

    // Cluster 2: mirrored-lead
    expect(clusters[2].id).toBe("cluster-2");
    expect(clusters[2].type).toBe("mirrored-lead");
    expect(clusters[2].items).toHaveLength(3);
    expect(clusters[2].items[0].role).toBe("supporting");
    expect(clusters[2].items[0].index).toBe(6);
    expect(clusters[2].items[1].role).toBe("supporting");
    expect(clusters[2].items[1].index).toBe(7);
    expect(clusters[2].items[2].role).toBe("lead");
    expect(clusters[2].items[2].index).toBe(8);
  });

  it("2. produces stable, deterministic output across repeated executions", () => {
    const mockAds = Array.from({ length: 9 }, (_, i) =>
      createMockAd(`ad-${i}`, i),
    );

    const run1 = partitionIntoClusters(mockAds);
    const run2 = partitionIntoClusters(mockAds);

    expect(run1).toEqual(run2);
  });

  it("3. handles empty and small corpora gracefully without throwing", () => {
    // 0 items
    expect(partitionIntoClusters([])).toEqual([]);

    // 1 item
    const oneAd = [createMockAd("ad-0", 0)];
    const singleCluster = partitionIntoClusters(oneAd);
    expect(singleCluster).toHaveLength(1);
    expect(singleCluster[0].type).toBe("lead-companion");
    expect(singleCluster[0].items[0].role).toBe("lead");

    // 2 items
    const twoAds = [createMockAd("ad-0", 0), createMockAd("ad-1", 1)];
    const twoCluster = partitionIntoClusters(twoAds);
    expect(twoCluster).toHaveLength(1);
    expect(twoCluster[0].items[0].role).toBe("lead");
    expect(twoCluster[0].items[1].role).toBe("supporting");
  });

  it("4. performs format-aware wide candidate selection when cluster contains mixed formats", () => {
    // Mixed chunk: [Video, DCO, Video]
    const chunkMixed = [
      createMockAd("v1", 0, "VIDEO"),
      createMockAd("d1", 1, "DCO"),
      createMockAd("v2", 2, "VIDEO"),
    ];
    // DCO at index 1 is preferred over vertical videos
    expect(selectWideCandidateIndex(chunkMixed)).toBe(1);

    // Uniform chunk: [Video, Video, Video]
    const chunkUniform = [
      createMockAd("v1", 0, "VIDEO"),
      createMockAd("v2", 1, "VIDEO"),
      createMockAd("v3", 2, "VIDEO"),
    ];
    // Stably defaults to index 2
    expect(selectWideCandidateIndex(chunkUniform)).toBe(2);
  });

  it("5. scales stably to 30 items cycling through cluster types", () => {
    const mockAds = Array.from({ length: 30 }, (_, i) =>
      createMockAd(`ad-${i}`, i),
    );

    const clusters = partitionIntoClusters(mockAds);

    expect(clusters).toHaveLength(10);

    // Verify cyclic sequence
    expect(clusters[0].type).toBe("lead-companion");
    expect(clusters[1].type).toBe("offset-duo-wide");
    expect(clusters[2].type).toBe("mirrored-lead");
    expect(clusters[3].type).toBe("lead-companion");
    expect(clusters[4].type).toBe("offset-duo-wide");
    expect(clusters[5].type).toBe("mirrored-lead");
    expect(clusters[6].type).toBe("lead-companion");
    expect(clusters[7].type).toBe("offset-duo-wide");
    expect(clusters[8].type).toBe("mirrored-lead");
    expect(clusters[9].type).toBe("lead-companion");

    // Total items preserved and strictly ordered
    let expectedIndex = 0;
    for (const cluster of clusters) {
      for (const item of cluster.items) {
        expect(item.index).toBe(expectedIndex);
        expectedIndex++;
      }
    }
    expect(expectedIndex).toBe(30);
  });
});
