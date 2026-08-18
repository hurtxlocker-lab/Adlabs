import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import type {
  AdLibraryItem,
  AdLibraryCreativeVariation,
  AdLibraryMediaItem,
} from "@/features/ad-library/types";
import { PackedSlotCard } from "../components/packed-slot-card";
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
): AdLibraryCreativeVariation {
  return {
    id,
    sourceCardIds: [`card-${id}`],
    position,
    headline: `Headline ${id}`,
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

describe("Discover Lab — Zero DCO Presentation & Single Rendering Grammar", () => {
  const slotC = PACKED_FIELD_TEMPLATE_V1.find((s) => s.id === "C")!;
  const slotF = PACKED_FIELD_TEMPLATE_V1.find((s) => s.id === "F")!;

  it("1. multi-variation item renders exactly 0 DCO UI artifacts", () => {
    const item = makeAdItem("dco-multi", "Dot & Key", [
      makeVariation("v1", 0, [makeMedia("m1", "VIDEO", 720, 1280)]),
      makeVariation("v2", 1, [makeMedia("m2", "IMAGE", 1080, 1080)]),
      makeVariation("v3", 2, [makeMedia("m3", "IMAGE", 1200, 628)]),
      makeVariation("v4", 3, [makeMedia("m4", "IMAGE", 720, 720)]),
      makeVariation("v5", 4, [makeMedia("m5", "IMAGE", 720, 720)]),
      makeVariation("v6", 5, [makeMedia("m6", "IMAGE", 720, 720)]),
    ]);

    const html = renderToString(<PackedSlotCard item={item} slot={slotC} />);

    // Zero DCO markers
    expect(html).not.toContain("data-dco-stack");
    expect(html).not.toContain("data-dco-stack-member");
    expect(html).not.toContain("data-dco-role");
    expect(html).not.toContain("variations");
    expect(html).not.toContain("+");
    expect(html).not.toContain("aria-haspopup");
    expect(html).not.toContain("ContactSheet");

    // Standard single creative rendering
    expect(html).toContain("Dot &amp; Key");
    expect(html).toContain("15 AUG");
    expect(html).toContain('href="/ads/dco-multi"');
  });

  it("2. former DCO video creative uses standard AmbientVideoPreview path", () => {
    const item = makeAdItem("dco-vid", "Dot & Key", [
      makeVariation("v1", 0, [
        makeMedia("vid-1", "VIDEO", 720, 1280),
        makeMedia("prev-1", "IMAGE", 720, 1280, "preview"),
      ]),
      makeVariation("v2", 1, [makeMedia("img-2", "IMAGE", 1080, 1080)]),
    ]);

    const html = renderToString(<PackedSlotCard item={item} slot={slotC} />);

    // Renders ambient video preview play button and poster
    expect(html).toContain('aria-label="Play video for Dot &amp; Key"');
    expect(html).toContain('src="https://media.brainfoods.in/media/sha256/prev-1"');
    // At rest, zero unmounted original video
    expect(html).not.toContain("<video");
  });

  it("3. former DCO image creative renders standard uncropped image tag", () => {
    const item = makeAdItem("dco-img", "MakeMyTrip", [
      makeVariation("v1", 0, [makeMedia("img-1", "IMAGE", 1100, 892)]),
      makeVariation("v2", 1, [makeMedia("img-2", "IMAGE", 640, 425)]),
    ]);

    const html = renderToString(<PackedSlotCard item={item} slot={slotF} />);

    // Renders single img tag with correct source URL
    expect(html).toContain("<img");
    expect(html).toContain("https://media.brainfoods.in/media/sha256/img-1");
    // Does not render variation 2
    expect(html).not.toContain("https://media.brainfoods.in/media/sha256/img-2");
  });
});
