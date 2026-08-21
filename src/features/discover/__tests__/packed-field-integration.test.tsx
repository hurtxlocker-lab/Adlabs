import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import type { AdLibraryItem } from "@/features/ad-library/types";
import { PackedField } from "@/features/discover/components/packed-field/packed-field";
import { PackedSlotCard } from "@/features/discover/components/packed-field/packed-slot-card";
import {
  partitionCreativesIntoPlates,
  assignCreativesToSlots,
} from "@/features/discover/utils/seed-assignment";
import { PACKED_FIELD_TEMPLATE_V1 } from "@/features/discover/templates/packed-field-v1";
import { resolveDiscoverRepresentativeCreative as resolveProd } from "@/features/discover/utils/representative-creative";
import { resolveDomainRepresentativeCreative } from "@/domain/creative/representative-creative";

// Helper to create mock AdLibraryItems with specific shapes and media
function createMockItem(
  id: string,
  brandName: string,
  mediaType: "IMAGE" | "VIDEO" = "IMAGE",
  width = 1200,
  height = 628,
  variationsCount = 0,
): AdLibraryItem {
  const variations =
    variationsCount > 0
      ? Array.from({ length: variationsCount }, (_, idx) => ({
          id: `var-${id}-${idx}`,
          sourceCardIds: [`card-${id}-${idx}`],
          position: idx,
          headline: `Headline ${idx}`,
          body: `Body ${idx}`,
          description: null,
          ctaText: "Shop Now",
          ctaType: "SHOP_NOW",
          destinationUrl: "https://example.com",
          media: [
            {
              id: `media-var-${id}-${idx}`,
              mediaType,
              role: mediaType === "VIDEO" ? "video" : "primary",
              position: 0,
              mimeType: mediaType === "VIDEO" ? "video/mp4" : "image/jpeg",
              mediaUrl: `https://example.com/var-${id}-${idx}.jpg`,
              width,
              height,
            },
          ],
        }))
      : [];

  const media =
    variationsCount === 0
      ? [
          {
            id: `media-${id}`,
            mediaType,
            role: mediaType === "VIDEO" ? "video" : "primary",
            position: 0,
            mimeType: mediaType === "VIDEO" ? "video/mp4" : "image/jpeg",
            mediaUrl: `https://example.com/${id}.jpg`,
            previewLoopUrl: mediaType === "VIDEO" ? `https://example.com/${id}-preview.mp4` : undefined,
            width,
            height,
          },
        ]
      : [];

  return {
    id,
    source: "meta",
    sourceAdId: `ext-${id}`,
    brand: {
      id: `brand-${brandName.toLowerCase()}`,
      name: brandName,
      slug: brandName.toLowerCase(),
    },
    displayFormat: mediaType,
    primaryText: `Primary Text ${id}`,
    headline: `Ad Headline ${id}`,
    description: null,
    ctaText: "Learn More",
    ctaType: "LEARN_MORE",
    destinationUrl: "https://example.com",
    publisherPlatforms: ["facebook", "instagram"],
    isActiveObserved: true,
    firstSeenAt: new Date("2026-01-15T00:00:00Z"),
    lastSeenAt: new Date("2026-01-20T00:00:00Z"),
    adLibraryUrl: `https://facebook.com/ads/${id}`,
    media,
    sourceCards: [],
    variations,
    cards: [],
  };
}

describe("Packed Field Production Integration", () => {
  it("A. preserves discovery query order entering Packed Field slots", () => {
    // 3 landscape items ordered 1, 2, 3
    const items = [
      createMockItem("ad-1", "Brand 1", "IMAGE", 1200, 628), // landscape
      createMockItem("ad-2", "Brand 2", "IMAGE", 1200, 628), // landscape
      createMockItem("ad-3", "Brand 3", "IMAGE", 1200, 628), // landscape
    ];

    // Assigning without seed (production mode)
    const result = assignCreativesToSlots(items, PACKED_FIELD_TEMPLATE_V1);

    // Slot H (anchor horizontal) is processed first and gets ad-1
    const slotH = result.assignments.find((a) => a.slot.id === "H");
    expect(slotH?.item?.id).toBe("ad-1");

    // Slot G (closing horizontal) is next structural horizontal and gets ad-2
    const slotG = result.assignments.find((a) => a.slot.id === "G");
    expect(slotG?.item?.id).toBe("ad-2");

    // Slot F (horizontal support band) gets ad-3
    const slotF = result.assignments.find((a) => a.slot.id === "F");
    expect(slotF?.item?.id).toBe("ad-3");
  });

  it("B. filtered VIDEO-only input renders only filtered ad IDs", () => {
    const videoItems = [
      createMockItem("vid-1", "VideoBrandA", "VIDEO", 1080, 1920),
      createMockItem("vid-2", "VideoBrandB", "VIDEO", 1200, 628),
    ];

    const html = renderToStaticMarkup(<PackedField items={videoItems} />);

    expect(html).toContain("VideoBrandA");
    expect(html).toContain("VideoBrandB");
    expect(html).not.toContain("OtherBrand");
  });

  it("C. single-item result renders exactly one canonical ad without duplication", () => {
    const singleItem = [createMockItem("single-1", "OnlyBrand", "IMAGE", 1080, 1920)];

    const html = renderToStaticMarkup(<PackedField items={singleItem} />);

    // Exactly 1 rendered card caption
    const brandLabelMatches = html.match(/<span>OnlyBrand<\/span>/g);
    expect(brandLabelMatches).toHaveLength(1);

    // Exactly 1 canonical link rendered
    const linkMatches = html.match(/href="\/ads\/single-1"/g);
    expect(linkMatches).toHaveLength(1);
  });

  it("D. incomplete final plate does not duplicate ads or drop creatives", () => {
    // 5 items (less than 8 slots in template)
    const items = [
      createMockItem("item-1", "Brand 1", "IMAGE", 1200, 628), // landscape -> H
      createMockItem("item-2", "Brand 2", "IMAGE", 1080, 1920), // portrait -> C
      createMockItem("item-3", "Brand 3", "IMAGE", 1080, 1920), // portrait -> D
      createMockItem("item-4", "Brand 4", "IMAGE", 1080, 1080), // square -> E
      createMockItem("item-5", "Brand 5", "IMAGE", 1200, 628), // landscape -> G
    ];

    const result = partitionCreativesIntoPlates(items, PACKED_FIELD_TEMPLATE_V1);
    expect(result.plates).toHaveLength(1);

    const plate1Assignments = result.plates[0].assignments;
    const filledItems = plate1Assignments.filter((a) => a.item !== null).map((a) => a.item!.id);

    // All 5 items assigned, 0 duplicate IDs
    expect(filledItems).toHaveLength(5);
    expect(new Set(filledItems).size).toBe(5);
    expect(result.unassignedItems).toHaveLength(0);
  });

  it("E. zero-result state in partition returns empty plates cleanly", () => {
    const result = partitionCreativesIntoPlates([], PACKED_FIELD_TEMPLATE_V1);
    expect(result.plates).toHaveLength(0);
    expect(result.unassignedItems).toHaveLength(0);
  });

  it("F. representative-first resolution produces identical results between Discover read model and domain resolver", () => {
    const dcoItem = createMockItem("dco-1", "DcoBrand", "IMAGE", 1080, 1080, 3);

    const prodRes = resolveProd(dcoItem);
    const domainRes = resolveDomainRepresentativeCreative({
      id: dcoItem.id,
      headline: dcoItem.headline,
      primaryText: dcoItem.primaryText,
      variations: dcoItem.variations.map((v) => ({
        id: v.id,
        position: v.position,
        headline: v.headline,
        body: v.body,
        media: v.media.map((m) => ({
          id: m.id,
          mediaType: m.mediaType,
          role: m.role,
          width: m.width ?? null,
          height: m.height ?? null,
        })),
      })),
    });

    expect(prodRes.sourceAdId).toBe(domainRes.sourceAdId);
    expect(prodRes.shapeFamily).toBe(domainRes.shapeFamily);
    expect(prodRes.aspectRatio).toBe(domainRes.aspectRatio);
    expect(prodRes.headline).toBe(domainRes.headline);
    expect(prodRes.isMultiVariation).toBe(true);
    expect(domainRes.isMultiVariation).toBe(true);
  });

  it("G. variations are not rendered as browsing mosaics (single representative card)", () => {
    const multiCardItem = createMockItem("multi-1", "CarouselBrand", "IMAGE", 1080, 1080, 4);

    const html = renderToStaticMarkup(
      <PackedSlotCard
        item={multiCardItem}
        slot={PACKED_FIELD_TEMPLATE_V1[0]}
      />,
    );

    // Single link to canonical ad
    const linkMatches = html.match(/href="\/ads\/multi-1"/g);
    expect(linkMatches).toHaveLength(1);

    // No mosaic or contact sheet sub-cards rendered
    expect(html).not.toContain("Variation 2");
    expect(html).not.toContain("Variation 3");
  });

  it("H. PackedSlotCard always links to canonical /ads/[id]", () => {
    const item = createMockItem("ad-999", "TestBrand", "VIDEO", 1080, 1920);

    const html = renderToStaticMarkup(
      <PackedSlotCard
        item={item}
        slot={PACKED_FIELD_TEMPLATE_V1[1]}
      />,
    );

    expect(html).toContain('href="/ads/ad-999"');
    expect(html).toContain("Inspect TestBrand creative");
  });
});
