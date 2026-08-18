import { describe, expect, it } from "vitest";
import type {
  AdLibraryItem,
  AdLibraryCreativeVariation,
  AdLibraryMediaItem,
} from "@/features/ad-library/types";
import { resolveDiscoverRepresentativeCreative } from "../utils/representative-creative";
import { isItemCompatibleWithSlot, getItemPreferenceRank } from "../utils/seed-assignment";
import { PACKED_FIELD_TEMPLATE_V1 } from "../templates/packed-field-v1";

function makeMedia(
  id: string,
  type: "IMAGE" | "VIDEO",
  width: number,
  height: number,
  role?: string,
): AdLibraryMediaItem {
  return {
    id,
    mediaType: type,
    role: role ?? (type === "VIDEO" ? "video" : "image"),
    position: 0,
    mimeType: type === "VIDEO" ? "video/mp4" : "image/jpeg",
    mediaUrl: `https://media.brainfoods.in/media/sha256/${id}`,
    previewLoopUrl: type === "VIDEO" ? `https://media.brainfoods.in/media/sha256/${id}_loop.mp4` : null,
    width,
    height,
  };
}

function makeVariation(
  id: string,
  position: number,
  media: AdLibraryMediaItem[],
  headline?: string,
): AdLibraryCreativeVariation {
  return {
    id,
    sourceCardIds: [`card-${id}`],
    position,
    headline: headline ?? `Headline ${id}`,
    body: `Body ${id}`,
    description: `Desc ${id}`,
    ctaText: "Shop Now",
    ctaType: "SHOP_NOW",
    destinationUrl: `https://example.com/${id}`,
    media,
  };
}

function makeAdItem(
  id: string,
  brandName: string,
  variations: AdLibraryCreativeVariation[] = [],
  standaloneMedia: AdLibraryMediaItem[] = [],
  displayFormat = "IMAGE",
): AdLibraryItem {
  return {
    id,
    source: "meta",
    sourceAdId: `meta-${id}`,
    brand: {
      id: `brand-${brandName.toLowerCase().replace(/\s+/g, "-")}`,
      name: brandName,
      slug: brandName.toLowerCase().replace(/\s+/g, "-"),
    },
    displayFormat,
    primaryText: `Primary copy for ${id}`,
    headline: `Headline for ${id}`,
    description: `Description for ${id}`,
    ctaText: "Learn More",
    ctaType: "LEARN_MORE",
    destinationUrl: "https://example.com",
    firstSeenAt: new Date("2026-08-15T12:00:00Z"),
    lastSeenAt: new Date("2026-08-16T12:00:00Z"),
    publisherPlatforms: ["FACEBOOK", "INSTAGRAM"],
    isActiveObserved: true,
    adLibraryUrl: `https://facebook.com/ads/library/?id=${id}`,
    sourceCards: [],
    cards: [],
    media: standaloneMedia,
    variations,
  };
}

describe("Discover Lab — Representative Creative Resolution", () => {
  it("1. single standalone creative item resolves primary media directly", () => {
    const media = [makeMedia("std-1", "VIDEO", 720, 1280)];
    const preview = makeMedia("preview-1", "IMAGE", 720, 1280, "preview");
    const item = makeAdItem("ad-std", "Pepperfry", [], [...media, preview], "VIDEO");

    const rep = resolveDiscoverRepresentativeCreative(item);
    expect(rep.sourceAdId).toBe("ad-std");
    expect(rep.representativeVariationId).toBeNull();
    expect(rep.isMultiVariation).toBe(false);
    expect(rep.isVideo).toBe(true);
    expect(rep.width).toBe(720);
    expect(rep.height).toBe(1280);
    expect(rep.shapeFamily).toBe("portrait");
    expect(rep.aspectRatio).toBeCloseTo(0.5625);
  });

  it("2. 2-variation item resolves strictly variation[0]", () => {
    const var1Media = [makeMedia("v1", "VIDEO", 720, 1280)];
    const var2Media = [makeMedia("v2", "IMAGE", 1080, 1080)];
    const item = makeAdItem("ad-duo", "Dot & Key", [
      makeVariation("var-1", 0, var1Media, "Var 1 Headline"),
      makeVariation("var-2", 1, var2Media, "Var 2 Headline"),
    ]);

    const rep = resolveDiscoverRepresentativeCreative(item);
    expect(rep.sourceAdId).toBe("ad-duo");
    expect(rep.representativeVariationId).toBe("var-1");
    expect(rep.isMultiVariation).toBe(true);
    expect(rep.isVideo).toBe(true);
    expect(rep.width).toBe(720);
    expect(rep.height).toBe(1280);
    expect(rep.shapeFamily).toBe("portrait");
    expect(rep.headline).toBe("Var 1 Headline");
  });

  it("3. 3-variation item resolves strictly variation[0] regardless of sibling shapes", () => {
    const var1Media = [makeMedia("v1-wide", "IMAGE", 1200, 628)];
    const var2Media = [makeMedia("v2-port", "IMAGE", 1080, 1920)];
    const var3Media = [makeMedia("v3-sq", "IMAGE", 1080, 1080)];
    const item = makeAdItem("ad-trio", "The Souled Store", [
      makeVariation("var-wide", 0, var1Media),
      makeVariation("var-port", 1, var2Media),
      makeVariation("var-sq", 2, var3Media),
    ]);

    const rep = resolveDiscoverRepresentativeCreative(item);
    expect(rep.representativeVariationId).toBe("var-wide");
    expect(rep.shapeFamily).toBe("wide");
    expect(rep.width).toBe(1200);
    expect(rep.height).toBe(628);
    expect(rep.aspectRatio).toBeCloseTo(1.9108);
  });

  it("4. 6-variation item resolves strictly variation[0] (deterministic source order)", () => {
    const vars = [
      makeVariation("var-first", 0, [makeMedia("v0", "IMAGE", 1100, 892)]),
      makeVariation("var-second", 1, [makeMedia("v1", "IMAGE", 640, 425)]),
      makeVariation("var-third", 2, [makeMedia("v2", "IMAGE", 4211, 2800)]),
      makeVariation("var-fourth", 3, [makeMedia("v3", "IMAGE", 3428, 2285)]),
      makeVariation("var-fifth", 4, [makeMedia("v4", "IMAGE", 583, 393)]),
      makeVariation("var-sixth", 5, [makeMedia("v5", "IMAGE", 4500, 3000)]),
    ];
    const item = makeAdItem("ad-overflow", "MakeMyTrip", vars);

    const rep = resolveDiscoverRepresentativeCreative(item);
    expect(rep.representativeVariationId).toBe("var-first");
    expect(rep.shapeFamily).toBe("landscape");
    expect(rep.width).toBe(1100);
    expect(rep.height).toBe(892);
  });

  it("5. resolution is strictly deterministic with zero ranking or performance bias", () => {
    const var1Media = [makeMedia("v1-low", "IMAGE", 720, 720)];
    const var2Media = [makeMedia("v2-high-res", "IMAGE", 4500, 3000)];
    const item = makeAdItem("ad-det", "Brand X", [
      makeVariation("v1-first", 0, var1Media),
      makeVariation("v2-second", 1, var2Media),
    ]);

    // Run 10 times to assert pure determinism
    for (let i = 0; i < 10; i++) {
      const rep = resolveDiscoverRepresentativeCreative(item);
      expect(rep.representativeVariationId).toBe("v1-first");
      expect(rep.shapeFamily).toBe("square");
    }
  });
});

describe("Discover Lab — Shape Consistency & Slot Compatibility", () => {
  const slotH = PACKED_FIELD_TEMPLATE_V1.find((s) => s.id === "H")!;
  const slotC = PACKED_FIELD_TEMPLATE_V1.find((s) => s.id === "C")!;
  const slotD = PACKED_FIELD_TEMPLATE_V1.find((s) => s.id === "D")!;
  const slotE = PACKED_FIELD_TEMPLATE_V1.find((s) => s.id === "E")!;

  it("1. former DCO portrait representative is classified as portrait for slot eligibility", () => {
    const item = makeAdItem("dco-port", "Dot & Key", [
      makeVariation("v1", 0, [makeMedia("m1", "VIDEO", 720, 1280)]), // Portrait
      makeVariation("v2", 1, [makeMedia("m2", "IMAGE", 1200, 628)]), // Wide
    ]);

    expect(isItemCompatibleWithSlot(item, slotC)).toBe(true); // Portrait allowed in C
    expect(isItemCompatibleWithSlot(item, slotD)).toBe(true); // Portrait allowed in D
    expect(isItemCompatibleWithSlot(item, slotH)).toBe(false); // Landscape/wide only in H
  });

  it("2. former DCO landscape representative is classified as landscape for slot eligibility", () => {
    const item = makeAdItem("dco-land", "MakeMyTrip", [
      makeVariation("v1", 0, [makeMedia("m1", "IMAGE", 1200, 800)]), // Landscape
      makeVariation("v2", 1, [makeMedia("m2", "VIDEO", 720, 1280)]), // Portrait
    ]);

    expect(isItemCompatibleWithSlot(item, slotH)).toBe(true); // Landscape allowed in H
    expect(isItemCompatibleWithSlot(item, slotC)).toBe(false); // Portrait/square only in C
  });

  it("3. former DCO square representative is classified as square for slot eligibility", () => {
    const item = makeAdItem("dco-sq", "MakeMyTrip", [
      makeVariation("v1", 0, [makeMedia("m1", "IMAGE", 1080, 1080)]), // Square
      makeVariation("v2", 1, [makeMedia("m2", "IMAGE", 1200, 800)]), // Landscape
    ]);

    expect(isItemCompatibleWithSlot(item, slotE)).toBe(true); // Square allowed in E
    expect(isItemCompatibleWithSlot(item, slotH)).toBe(false); // Wide/landscape only in H
  });

  it("4. slot preference rank uses representative creative properties", () => {
    const itemWide = makeAdItem("dco-wide", "Brand W", [
      makeVariation("v1", 0, [makeMedia("m1", "IMAGE", 1200, 628)]), // Wide (ratio 1.91)
    ]);
    const itemLand = makeAdItem("dco-land", "Brand L", [
      makeVariation("v1", 0, [makeMedia("m1", "IMAGE", 1200, 800)]), // Landscape (ratio 1.5)
    ]);

    // Slot H prefers wide (rank 0) over landscape (rank 1)
    expect(getItemPreferenceRank(itemWide, slotH)).toBe(0);
    expect(getItemPreferenceRank(itemLand, slotH)).toBe(1);
  });
});
