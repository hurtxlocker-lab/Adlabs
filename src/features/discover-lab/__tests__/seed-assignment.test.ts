import { describe, expect, it } from "vitest";
import {
  assignCreativesToSlots,
  isItemCompatibleWithSlot,
  partitionCreativesIntoPlates,
} from "../utils/seed-assignment";
import { PACKED_FIELD_TEMPLATE_V1 } from "../templates/packed-field-v1";
import type { AdLibraryItem } from "@/features/ad-library/types";

function createMockItem(
  id: string,
  width: number,
  height: number,
  isMultiVariation = false,
): AdLibraryItem {
  return {
    id,
    source: "meta",
    sourceAdId: `src-${id}`,
    brand: {
      id: `brand-${id}`,
      name: `Brand ${id}`,
      slug: `brand-${id}`,
    },
    displayFormat: isMultiVariation ? "DCO" : "VIDEO",
    primaryText: "Body text",
    headline: "Headline",
    description: null,
    ctaText: "Shop Now",
    ctaType: "SHOP_NOW",
    destinationUrl: "https://example.com",
    publisherPlatforms: ["facebook", "instagram"],
    isActiveObserved: true,
    firstSeenAt: new Date("2026-08-16T10:00:00.000Z"),
    lastSeenAt: new Date("2026-08-16T10:00:00.000Z"),
    adLibraryUrl: `https://facebook.com/ads/${id}`,
    media: [
      {
        id: `media-${id}`,
        mediaType: "VIDEO",
        role: null,
        position: 0,
        mimeType: "video/mp4",
        mediaUrl: `https://media.brainfoods.in/media/sha256/${id}`,
        previewLoopUrl: `https://media.brainfoods.in/media/sha256/${id}-loop`,
        width,
        height,
      },
    ],
    sourceCards: [],
    variations: isMultiVariation
      ? [
          {
            id: `v1-${id}`,
            sourceCardIds: [`c1-${id}`],
            position: 1,
            headline: "V1",
            body: "V1",
            description: null,
            ctaText: "Shop",
            ctaType: "SHOP_NOW",
            destinationUrl: "https://example.com",
            media: [
              {
                id: `vm1-${id}`,
                mediaType: "IMAGE",
                role: "primary",
                position: 0,
                mimeType: "image/jpeg",
                mediaUrl: `https://media.brainfoods.in/media/sha256/vm1-${id}`,
              },
            ],
          },
          {
            id: `v2-${id}`,
            sourceCardIds: [`c2-${id}`],
            position: 2,
            headline: "V2",
            body: "V2",
            description: null,
            ctaText: "Shop",
            ctaType: "SHOP_NOW",
            destinationUrl: "https://example.com",
            media: [
              {
                id: `vm2-${id}`,
                mediaType: "IMAGE",
                role: "primary",
                position: 0,
                mimeType: "image/jpeg",
                mediaUrl: `https://media.brainfoods.in/media/sha256/vm2-${id}`,
              },
            ],
          },
        ]
      : [],
    cards: [],
  };
}

describe("Packed Field v1 Deterministic Seeded Assignment & Partitioning", () => {
  const portrait1 = createMockItem("p1", 720, 1280);
  const portrait2 = createMockItem("p2", 720, 1280);
  const portrait3 = createMockItem("p3", 720, 1280);
  const portrait4 = createMockItem("p4", 720, 1280);
  const square1 = createMockItem("s1", 1080, 1080);
  const square2 = createMockItem("s2", 1080, 1080);
  const landscape1 = createMockItem("l1", 1280, 720);
  const landscape2 = createMockItem("l2", 1920, 1080);
  const wide1 = createMockItem("w1", 1200, 628);
  const dcoMosaic = createMockItem("dco1", 1280, 720, true);

  const mockCorpus = [
    portrait1,
    portrait2,
    portrait3,
    portrait4,
    square1,
    square2,
    landscape1,
    landscape2,
    wide1,
    dcoMosaic,
  ];

  it("produces strictly identical assignments across multiple runs with same corpus + seed", () => {
    const run1 = assignCreativesToSlots(mockCorpus, PACKED_FIELD_TEMPLATE_V1, "test-seed-1");
    const run2 = assignCreativesToSlots(mockCorpus, PACKED_FIELD_TEMPLATE_V1, "test-seed-1");

    expect(run1.assignments.map((a) => a.item?.id)).toEqual(
      run2.assignments.map((a) => a.item?.id),
    );
    expect(run1.unassignedItems.map((u) => u.id)).toEqual(
      run2.unassignedItems.map((u) => u.id),
    );
  });

  it("assigns each creative at most once across all slots and unassigned list", () => {
    const res = assignCreativesToSlots(mockCorpus, PACKED_FIELD_TEMPLATE_V1);

    const assignedIds = res.assignments
      .map((a) => a.item?.id)
      .filter((id): id is string => Boolean(id));
    const unassignedIds = res.unassignedItems.map((u) => u.id);

    const allSeenIds = [...assignedIds, ...unassignedIds];
    const uniqueSeenIds = new Set(allSeenIds);

    expect(allSeenIds.length).toBe(uniqueSeenIds.size);
    expect(allSeenIds.sort()).toEqual(mockCorpus.map((m) => m.id).sort());
  });

  it("enforces strict shape compatibility: portrait slots do not accept landscape", () => {
    const portraitOnlySlot = PACKED_FIELD_TEMPLATE_V1.find((s) => s.id === "D")!;

    expect(isItemCompatibleWithSlot(portrait1, portraitOnlySlot)).toBe(true);
    expect(isItemCompatibleWithSlot(landscape1, portraitOnlySlot)).toBe(false);
    expect(isItemCompatibleWithSlot(dcoMosaic, portraitOnlySlot)).toBe(false);
  });

  it("partitions a 27-item realistic corpus into sequential plates without duplicates", () => {
    // Generate a simulated 27-ad realistic corpus
    const realisticCorpus: AdLibraryItem[] = [];
    for (let i = 1; i <= 6; i++) realisticCorpus.push(createMockItem(`p_${i}`, 720, 1280));
    for (let i = 1; i <= 10; i++) realisticCorpus.push(createMockItem(`s_${i}`, 1080, 1080));
    for (let i = 1; i <= 8; i++) realisticCorpus.push(createMockItem(`l_${i}`, 1280, 720));
    for (let i = 1; i <= 3; i++) realisticCorpus.push(createMockItem(`dco_${i}`, 1280, 720, true));

    expect(realisticCorpus.length).toBe(27);

    const result = partitionCreativesIntoPlates(realisticCorpus, PACKED_FIELD_TEMPLATE_V1);

    // Should create multiple plates
    expect(result.plates.length).toBeGreaterThanOrEqual(3);

    // Verify all items are accounted for exactly once
    const assignedIds = result.plates.flatMap((p) =>
      p.assignments.map((a) => a.item?.id).filter((id): id is string => Boolean(id)),
    );
    const unassignedIds = result.unassignedItems.map((u) => u.id);

    const allIds = [...assignedIds, ...unassignedIds];
    const uniqueIds = new Set(allIds);

    expect(allIds.length).toBe(uniqueIds.size);
    expect(allIds.length).toBe(27);
  });

  it("preserves DCO canonical unity across slots", () => {
    const slotH = PACKED_FIELD_TEMPLATE_V1.find((s) => s.id === "H")!;
    expect(isItemCompatibleWithSlot(dcoMosaic, slotH)).toBe(true);
  });
});
