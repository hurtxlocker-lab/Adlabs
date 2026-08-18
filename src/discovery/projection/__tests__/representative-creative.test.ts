import { describe, expect, it } from "vitest";
import { resolveRepresentativeCreativeFacts } from "../representative-creative";
import { resolveDiscoverRepresentativeCreative } from "@/features/discover-lab/utils/representative-creative";
import type { AdLibraryItem } from "@/features/ad-library/types";

describe("Representative Creative Resolution & Domain Parity", () => {
  const baseAd = {
    id: "ad-1",
    headline: "Ad Headline",
    primaryText: "Ad Primary Text",
    description: "Ad Description",
    ctaText: "Shop Now",
    ctaType: "SHOP_NOW",
    displayFormat: "IMAGE",
  };

  it("resolves single image ad with exact shape and aspect ratio", () => {
    const directMedia = [
      {
        id: "media-img-1",
        sha256: "sha_image_1",
        mediaType: "IMAGE" as const,
        width: 1080,
        height: 1080,
        durationMs: null,
        role: "primary",
        position: 0,
      },
    ];

    const rep = resolveRepresentativeCreativeFacts(baseAd, [], directMedia);

    expect(rep.mediaType).toBe("IMAGE");
    expect(rep.mediaAssetId).toBe("media-img-1");
    expect(rep.mediaSha256).toBe("sha_image_1");
    expect(rep.shapeFamily).toBe("square");
    expect(rep.aspectRatio).toBe(1);
    expect(rep.videoDurationMs).toBeNull();
    expect(rep.headline).toBe("Ad Headline");
  });

  it("prefers video over image on standalone ad", () => {
    const directMedia = [
      {
        id: "media-img-1",
        sha256: "sha_img",
        mediaType: "IMAGE" as const,
        width: 1080,
        height: 1080,
        durationMs: null,
        role: "preview",
        position: 0,
      },
      {
        id: "media-vid-1",
        sha256: "sha_vid",
        mediaType: "VIDEO" as const,
        width: 1080,
        height: 1350,
        durationMs: 15400,
        role: "video",
        position: 1,
      },
    ];

    const rep = resolveRepresentativeCreativeFacts(baseAd, [], directMedia);

    expect(rep.mediaType).toBe("VIDEO");
    expect(rep.mediaAssetId).toBe("media-vid-1");
    expect(rep.shapeFamily).toBe("square"); // 1080/1350 = 0.80 -> square boundary
    expect(rep.videoDurationMs).toBe(15400);
  });

  it("selects position 0 card for multi-card DCO ads", () => {
    const cards = [
      {
        id: "card-2",
        position: 1,
        headline: "Card 2 Headline",
        body: "Card 2 Body",
        description: null,
        ctaText: "Buy",
        media: [
          {
            id: "media-c2",
            sha256: "sha_c2",
            mediaType: "IMAGE" as const,
            width: 1200,
            height: 628,
            durationMs: null,
          },
        ],
      },
      {
        id: "card-1",
        position: 0,
        headline: "Card 1 Headline",
        body: "Card 1 Body",
        description: null,
        ctaText: "Shop",
        media: [
          {
            id: "media-c1",
            sha256: "sha_c1",
            mediaType: "IMAGE" as const,
            width: 1080,
            height: 1920,
            durationMs: null,
          },
        ],
      },
    ];

    const rep = resolveRepresentativeCreativeFacts(baseAd, cards, []);

    expect(rep.mediaAssetId).toBe("media-c1");
    expect(rep.mediaSha256).toBe("sha_c1");
    expect(rep.shapeFamily).toBe("portrait"); // 1080/1920 = 0.5625 < 0.80 -> portrait
    expect(rep.headline).toBe("Card 1 Headline");
    expect(rep.primaryText).toBe("Card 1 Body");
  });

  it("proves Discover read model and projection resolver produce exact identical variation and shape", () => {
    const uiItem: AdLibraryItem = {
      id: "ad_test_dco",
      brand: {
        id: "brand-1",
        name: "Test Brand",
        slug: "test-brand",
      },
      source: "meta",
      sourceAdId: "src_ad_1",
      displayFormat: "DCO",
      headline: "Root Headline",
      primaryText: "Root Primary Text",
      description: "Root Desc",
      ctaText: "Shop",
      ctaType: "SHOP_NOW",
      destinationUrl: "https://example.com",
      isActiveObserved: true,
      adLibraryUrl: "https://facebook.com/ads/1",
      publisherPlatforms: ["facebook"],
      firstSeenAt: new Date("2026-01-01"),
      lastSeenAt: new Date("2026-01-02"),
      media: [],
      sourceCards: [],
      cards: [],
      variations: [
        {
          id: "var-0",
          sourceCardIds: ["card-0"],
          position: 0,
          headline: "DCO Card 0 Headline",
          body: "DCO Card 0 Body",
          description: "DCO Card 0 Desc",
          ctaText: "Order Now",
          ctaType: "ORDER_NOW",
          destinationUrl: "https://example.com/order",
          media: [
            {
              id: "media-v0-video",
              mediaType: "VIDEO",
              role: "video",
              position: 0,
              width: 1080,
              height: 1920,
              mediaUrl: "https://storage.example.com/v0.mp4",
              mimeType: "video/mp4",
              previewLoopUrl: null,
            },
          ],
        },
        {
          id: "var-1",
          sourceCardIds: ["card-1"],
          position: 1,
          headline: "DCO Card 1 Headline",
          body: "DCO Card 1 Body",
          description: null,
          ctaText: "Shop",
          ctaType: "SHOP_NOW",
          destinationUrl: null,
          media: [],
        },
      ],
    };

    const discoverResult = resolveDiscoverRepresentativeCreative(uiItem);

    const projectionResult = resolveRepresentativeCreativeFacts(
      {
        id: uiItem.id,
        headline: uiItem.headline,
        primaryText: uiItem.primaryText,
        description: uiItem.description,
        ctaText: uiItem.ctaText,
        ctaType: uiItem.ctaType ?? null,
        displayFormat: uiItem.displayFormat ?? "UNKNOWN",
      },
      [
        {
          id: "var-0",
          position: 0,
          headline: "DCO Card 0 Headline",
          body: "DCO Card 0 Body",
          description: "DCO Card 0 Desc",
          ctaText: "Order Now",
          media: [
            {
              id: "media-v0-video",
              sha256: "sha_dco_video",
              mediaType: "VIDEO",
              width: 1080,
              height: 1920,
              durationMs: 12000,
              role: "video",
            },
          ],
        },
        {
          id: "var-1",
          position: 1,
          headline: "DCO Card 1 Headline",
          body: "DCO Card 1 Body",
          description: null,
          ctaText: "Shop",
          media: [],
        },
      ],
      [],
    );

    // Parity verification
    expect(discoverResult.representativeVariationId).toBe("var-0");
    expect(discoverResult.isVideo).toBe(true);
    expect(discoverResult.shapeFamily).toBe("portrait");
    expect(discoverResult.aspectRatio).toBe(1080 / 1920);
    expect(discoverResult.headline).toBe(projectionResult.headline);
    expect(discoverResult.body).toBe(projectionResult.primaryText);
    expect(discoverResult.shapeFamily).toBe(projectionResult.shapeFamily);
    expect(discoverResult.aspectRatio).toBe(projectionResult.aspectRatio);
    expect(projectionResult.mediaAssetId).toBe("media-v0-video");
    expect(projectionResult.mediaSha256).toBe("sha_dco_video");
  });
});
