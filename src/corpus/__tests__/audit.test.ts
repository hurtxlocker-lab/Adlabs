import { describe, expect, it } from "vitest";
import { computeCorpusAudit, formatCorpusAuditTable, resolvePhysicalShape } from "../audit";
import type { AdLibraryItem } from "@/features/ad-library/types";

function createMockAd(
  id: string,
  brandName: string,
  width: number | null,
  height: number | null,
  isMultiVariation = false,
): AdLibraryItem {
  const variations = isMultiVariation
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
              mediaType: "VIDEO" as const,
              role: null,
              position: 0,
              mimeType: "video/mp4",
              mediaUrl: `https://media.brainfoods.in/media/sha256/v1-${id}`,
              width,
              height,
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
              mediaType: "VIDEO" as const,
              role: null,
              position: 0,
              mimeType: "video/mp4",
              mediaUrl: `https://media.brainfoods.in/media/sha256/v2-${id}`,
              width,
              height,
            },
          ],
        },
      ]
    : [];

  return {
    id,
    source: "meta",
    sourceAdId: `src-${id}`,
    brand: {
      id: `brand-${brandName}`,
      name: brandName,
      slug: brandName.toLowerCase().replace(/\s+/g, "-"),
    },
    displayFormat: isMultiVariation ? "DCO" : "VIDEO",
    primaryText: "Body",
    headline: "Headline",
    description: null,
    ctaText: "Shop",
    ctaType: "SHOP_NOW",
    destinationUrl: "https://example.com",
    publisherPlatforms: ["facebook", "instagram"],
    isActiveObserved: true,
    firstSeenAt: new Date("2026-08-16T10:00:00.000Z"),
    lastSeenAt: new Date("2026-08-16T10:00:00.000Z"),
    adLibraryUrl: `https://facebook.com/ads/${id}`,
    media: [
      {
        id: `m-${id}`,
        mediaType: "VIDEO",
        role: null,
        position: 0,
        mimeType: "video/mp4",
        mediaUrl: `https://media.brainfoods.in/media/sha256/${id}`,
        width,
        height,
      },
    ],
    sourceCards: [],
    variations,
    cards: [],
  };
}

describe("Corpus Audit & Geometry Inventory", () => {
  it("resolves physical shape truthfully without false DCO fallback", () => {
    expect(resolvePhysicalShape(720, 1280)).toBe("portrait");
    expect(resolvePhysicalShape(1080, 1080)).toBe("square");
    expect(resolvePhysicalShape(1280, 720)).toBe("landscape");
    expect(resolvePhysicalShape(2560, 1080)).toBe("wide");
    expect(resolvePhysicalShape(null, null)).toBe("unknown");
    expect(resolvePhysicalShape(0, 1080)).toBe("unknown");
  });

  const corpus: AdLibraryItem[] = [
    createMockAd("ad1", "Kapiva", 720, 1280), // portrait
    createMockAd("ad2", "Kapiva", 720, 1280), // portrait
    createMockAd("ad3", "Kapiva", 720, 1280), // portrait
    createMockAd("ad4", "Mamaearth", 1280, 720), // landscape
    createMockAd("ad5", "Mamaearth", 720, 1280), // portrait
    createMockAd("ad6", "Dot & Key", 720, 1280, true), // multi-var: 2 portrait variations!
    createMockAd("ad7", "Dot & Key", 720, 1280, true), // multi-var: 2 portrait variations!
    createMockAd("ad8", "Brand X", 1080, 1350), // square (4:5 = 0.8)
    createMockAd("ad9", "Brand Y", 2560, 1080), // wide (21:9 > 1.8)
  ];

  it("separates canonical ad count from creative geometry inventory", () => {
    const res = computeCorpusAudit(corpus);

    // Canonical inventory
    expect(res.totals.totalAds).toBe(9);
    expect(res.totals.uniqueBrands).toBe(5);
    expect(res.totals.singleCount).toBe(7);
    expect(res.totals.multiVariationCount).toBe(2);

    // Creative geometry inventory:
    // Kapiva: 3 portrait
    // Mamaearth: 1 portrait + 1 landscape
    // Dot & Key: 2 DCO ads * 2 variations = 4 portrait creative units!
    // Brand X: 1 square
    // Brand Y: 1 wide
    // Total creative units = 3 + 2 + 4 + 1 + 1 = 11 units
    expect(res.totals.totalCreativeUnits).toBe(11);
    expect(res.totals.shapeCounts.portrait).toBe(8); // 3 + 1 + 4
    expect(res.totals.shapeCounts.square).toBe(1);
    expect(res.totals.shapeCounts.landscape).toBe(1);
    expect(res.totals.shapeCounts.wide).toBe(1);
    expect(res.totals.shapeCounts.unknown).toBe(0);
  });

  it("formats audit table into clean ASCII canonical and geometry sections", () => {
    const res = computeCorpusAudit(corpus);
    const table = formatCorpusAuditTable(res);

    expect(table).toContain("ADLABS DEV CORPUS INVENTORY & GEOMETRY AUDIT");
    expect(table).toContain("--- 1. CANONICAL ADS INVENTORY ---");
    expect(table).toContain("--- 2. CREATIVE GEOMETRY INVENTORY (Variation & Media Level) ---");
    expect(table).toContain("Dot & Key");
    expect(table).toContain("Kapiva");
  });
});
