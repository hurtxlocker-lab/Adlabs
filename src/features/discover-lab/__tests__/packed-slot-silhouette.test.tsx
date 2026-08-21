import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PackedSlotCard } from "@/features/discover/components/packed-field/packed-slot-card";
import type { AdLibraryItem } from "@/features/ad-library/types";
import type { PackedFieldSlot } from "@/features/discover/types/packed-field";
import { resolveCreativeShape } from "@/features/discover/utils/creative-shape";

const mockPepperfrySquareItem: AdLibraryItem = {
  id: "pepperfry-sq-1",
  source: "meta",
  sourceAdId: "1111111",
  brand: {
    id: "brand-pepperfry",
    name: "Pepperfry",
    slug: "pepperfry",
  },
  displayFormat: "VIDEO",
  primaryText: "Find your perfect furniture piece with Pepperfry.",
  headline: "Big Furniture Festival",
  description: "Up to 60% off",
  ctaText: "Shop Now",
  ctaType: "SHOP_NOW",
  destinationUrl: "https://pepperfry.com",
  publisherPlatforms: ["facebook", "instagram"],
  isActiveObserved: true,
  firstSeenAt: new Date("2026-08-16T10:00:00.000Z"),
  lastSeenAt: new Date("2026-08-16T10:00:00.000Z"),
  adLibraryUrl: "https://facebook.com/ads/111",
  media: [
    {
      id: "media-pepp-1",
      mediaType: "VIDEO",
      role: "primary",
      position: 0,
      mimeType: "video/mp4",
      mediaUrl: "https://media.brainfoods.in/media/sha256/pepp-video",
      previewLoopUrl: "https://media.brainfoods.in/media/sha256/pepp-loop",
      width: 720,
      height: 720,
    },
    {
      id: "media-pepp-prev",
      mediaType: "IMAGE",
      role: "preview",
      position: 1,
      mimeType: "image/jpeg",
      mediaUrl: "https://media.brainfoods.in/media/sha256/pepp-poster",
      width: 1080,
      height: 1080,
    },
  ],
  sourceCards: [],
  variations: [],
  cards: [],
};

const mockMamaearthPortraitItem: AdLibraryItem = {
  id: "mamaearth-port-1",
  source: "meta",
  sourceAdId: "2222222",
  brand: {
    id: "brand-mamaearth",
    name: "Mamaearth",
    slug: "mamaearth",
  },
  displayFormat: "VIDEO",
  primaryText: "Natural beauty remedies by Mamaearth.",
  headline: "Onion Shampoo for Hair Fall",
  description: "Toxin free",
  ctaText: "Shop Now",
  ctaType: "SHOP_NOW",
  destinationUrl: "https://mamaearth.in",
  publisherPlatforms: ["facebook", "instagram"],
  isActiveObserved: true,
  firstSeenAt: new Date("2026-08-16T10:00:00.000Z"),
  lastSeenAt: new Date("2026-08-16T10:00:00.000Z"),
  adLibraryUrl: "https://facebook.com/ads/222",
  media: [
    {
      id: "media-mama-1",
      mediaType: "VIDEO",
      role: "primary",
      position: 0,
      mimeType: "video/mp4",
      mediaUrl: "https://media.brainfoods.in/media/sha256/mama-video",
      previewLoopUrl: "https://media.brainfoods.in/media/sha256/mama-loop",
      width: 720,
      height: 1280,
    },
  ],
  sourceCards: [],
  variations: [],
  cards: [],
};

const mockLandscapeItem: AdLibraryItem = {
  id: "landscape-ad-1",
  source: "meta",
  sourceAdId: "3333333",
  brand: {
    id: "brand-pepperfry-ls",
    name: "Pepperfry",
    slug: "pepperfry",
  },
  displayFormat: "VIDEO",
  primaryText: "Pepperfry living room furniture.",
  headline: "Living Room Edit",
  description: "Handcrafted styles",
  ctaText: "Shop Now",
  ctaType: "SHOP_NOW",
  destinationUrl: "https://pepperfry.com",
  publisherPlatforms: ["facebook", "instagram"],
  isActiveObserved: true,
  firstSeenAt: new Date("2026-08-16T10:00:00.000Z"),
  lastSeenAt: new Date("2026-08-16T10:00:00.000Z"),
  adLibraryUrl: "https://facebook.com/ads/333",
  media: [
    {
      id: "media-ls-1",
      mediaType: "VIDEO",
      role: "primary",
      position: 0,
      mimeType: "video/mp4",
      mediaUrl: "https://media.brainfoods.in/media/sha256/ls-video",
      width: 1280,
      height: 720,
    },
  ],
  sourceCards: [],
  variations: [],
  cards: [],
};

const slotH: PackedFieldSlot = {
  id: "H",
  name: "Horizontal Anchor",
  weight: "anchor",
  preferredShapes: ["landscape", "wide", "square"],
  allowsMultiVariation: true,
  alignment: { horizontal: "start", vertical: "start" },
  maxMediaHeightClass: "max-h-[460px]",
  maxMediaWidthClass: "w-full",
};

const slotC: PackedFieldSlot = {
  id: "C",
  name: "Vertical Counterweight",
  weight: "major",
  preferredShapes: ["portrait", "square"],
  allowsMultiVariation: false,
  alignment: { horizontal: "end", vertical: "start" },
  maxMediaHeightClass: "max-h-[460px]",
  maxMediaWidthClass: "w-full max-w-[340px]",
};

const slotF: PackedFieldSlot = {
  id: "F",
  name: "East Support Band",
  weight: "support",
  preferredShapes: ["landscape", "square"],
  allowsMultiVariation: true,
  alignment: { horizontal: "end", vertical: "center" },
  maxMediaHeightClass: "max-h-[320px]",
  maxMediaWidthClass: "w-full",
};

describe("Discover Lab PackedSlotCard Silhouette Restoration", () => {
  it("classifies physical ratios into correct shape families", () => {
    const pepperfryShape = resolveCreativeShape(720, 720);
    expect(pepperfryShape.shapeFamily).toBe("square");
    expect(pepperfryShape.aspectRatio).toBe(1.0);

    const mamaearthShape = resolveCreativeShape(720, 1280);
    expect(mamaearthShape.shapeFamily).toBe("portrait");
    expect(mamaearthShape.aspectRatio).toBeCloseTo(0.5625, 3);

    const landscapeShape = resolveCreativeShape(1280, 720);
    expect(landscapeShape.shapeFamily).toBe("landscape");
    expect(landscapeShape.aspectRatio).toBeCloseTo(1.7778, 3);
  });

  it("renders square media with true 1:1 aspect ratio without stretching into landscape slot H container", () => {
    const html = renderToStaticMarkup(
      <PackedSlotCard item={mockPepperfrySquareItem} slot={slotH} />,
    );

    // Media Shell has exact physical aspect-ratio
    expect(html).toContain("aspect-ratio:720 / 720");
    // Media Shell width is constrained via non-circular min(preferredWidth, heightCapWidth)
    expect(html).toContain("width:min(clamp(620px, 52vw, 900px), 460px)");
    // Guarantee width rule does NOT contain circular 100% inside min()
    expect(html).not.toContain("width:min(clamp(620px, 52vw, 900px), 100%");
    // Max-width 100% is present
    expect(html).toContain("max-width:100%");
    // Does NOT force a 16:9 or 16:10 ratio for single creative
    expect(html).not.toContain("aspect-ratio:16 / 10");
    expect(html).not.toContain("aspect-ratio:16 / 9");
    // Artifact wrapper shrink-wraps to w-fit
    expect(html).toContain("w-fit max-w-full");
    // Brand caption and date are present
    expect(html).toContain("Pepperfry");
    expect(html).toContain("16 AUG");
  });

  it("renders portrait media with true 9:16 aspect ratio without box distortion in slot C", () => {
    const html = renderToStaticMarkup(
      <PackedSlotCard item={mockMamaearthPortraitItem} slot={slotC} />,
    );

    // Media Shell has exact physical aspect-ratio
    expect(html).toContain("aspect-ratio:720 / 1280");
    // Media Shell width is constrained to heightCapWidth 259px without circular 100%
    expect(html).toContain("width:min(clamp(240px, 20vw, 320px), 259px)");
    expect(html).not.toContain("width:min(clamp(240px, 20vw, 320px), 100%");
    // Artifact wrapper shrink-wraps to w-fit
    expect(html).toContain("w-fit max-w-full");
    expect(html).toContain("Mamaearth");
    expect(html).toContain("16 AUG");
  });

  it("renders landscape media with true 16:9 aspect ratio in slot F", () => {
    const html = renderToStaticMarkup(
      <PackedSlotCard item={mockLandscapeItem} slot={slotF} />,
    );

    // Media Shell has exact physical aspect-ratio
    expect(html).toContain("aspect-ratio:1280 / 720");
    // Media Shell width resolves with preferred width clamp and 569px height cap without circular 100%
    expect(html).toContain("width:min(clamp(380px, 34vw, 520px), 569px)");
    expect(html).not.toContain("width:min(clamp(380px, 34vw, 520px), 100%");
    expect(html).toContain("w-fit max-w-full");
    expect(html).toContain("Pepperfry");
  });

  it("structural regression test: verifies Media Shell never uses circular percentage width under fit-content ancestor", () => {
    const html = renderToStaticMarkup(
      <PackedSlotCard item={mockLandscapeItem} slot={slotH} />,
    );

    // Artifact has w-fit max-w-full
    expect(html).toContain("w-fit max-w-full");
    // Media shell has definite preferred clamp bounded by height cap in px
    expect(html).toContain("width:min(clamp(620px, 52vw, 900px), 818px)");
    // Must NOT contain 100% inside the min() width rule
    expect(html).not.toMatch(/width:\s*min\([^)]*100%[^)]*\)/);
  });
});


