import { describe, expect, it } from "vitest";
import { resolveCreativeVariations, formatDisplayFormat } from "../utils";
import type { AdLibraryCardItem, AdLibraryMediaItem } from "../types";

function createMockMedia(id: string, mediaType: "IMAGE" | "VIDEO" = "IMAGE"): AdLibraryMediaItem[] {
  return [
    {
      id,
      mediaType,
      role: "primary",
      position: 0,
      mimeType: mediaType === "VIDEO" ? "video/mp4" : "image/jpeg",
      mediaUrl: `https://media.test.internal/sha256/${id}`,
    },
  ];
}

describe("DCO Creative Variations Resolution", () => {
  it("collapses exact duplicate cards with same media and commercial fields into one variation", () => {
    const cards: AdLibraryCardItem[] = [
      {
        id: "card-1",
        position: 0,
        headline: "Pop Culture Has a New Home!",
        body: "Punjab, your ultimate fandom destination is finally here! Come say hi!",
        description: null,
        ctaText: "Shop Now",
        ctaType: "SHOP_NOW",
        destinationUrl: "https://www.thesouledstore.com/stores-near-me",
        media: createMockMedia("asset-video-1", "VIDEO"),
      },
      {
        id: "card-2",
        position: 1,
        headline: "Pop Culture Has a New Home!",
        body: "Punjab, your ultimate fandom destination is finally here! Come say hi!",
        description: null,
        ctaText: "Shop Now",
        ctaType: "SHOP_NOW",
        destinationUrl: "https://www.thesouledstore.com/stores-near-me",
        media: createMockMedia("asset-video-1", "VIDEO"),
      },
    ];

    const variations = resolveCreativeVariations(cards);
    expect(variations).toHaveLength(1);
    expect(variations[0].id).toBe("card-1");
    expect(variations[0].position).toBe(1);
    expect(variations[0].sourceCardIds).toEqual(["card-1", "card-2"]);
    expect(variations[0].headline).toBe("Pop Culture Has a New Home!");
    expect(variations[0].body).toBe(
      "Punjab, your ultimate fandom destination is finally here! Come say hi!",
    );
  });

  it("preserves separate variations when copy is identical but primary media SHA differs", () => {
    const cards: AdLibraryCardItem[] = [
      {
        id: "card-1",
        position: 0,
        headline: "Explore Online",
        body: "From superhero tees to sneakers that slap—get it all online!",
        description: "10% Cashback",
        ctaText: "Shop Now",
        ctaType: "SHOP_NOW",
        destinationUrl: "https://www.thesouledstore.com/",
        media: createMockMedia("video-edit-1", "VIDEO"),
      },
      {
        id: "card-2",
        position: 1,
        headline: "Explore Online",
        body: "From superhero tees to sneakers that slap—get it all online!",
        description: "10% Cashback",
        ctaText: "Shop Now",
        ctaType: "SHOP_NOW",
        destinationUrl: "https://www.thesouledstore.com/",
        media: createMockMedia("video-edit-2", "VIDEO"),
      },
    ];

    const variations = resolveCreativeVariations(cards);
    expect(variations).toHaveLength(2);
    expect(variations[0].id).toBe("card-1");
    expect(variations[0].sourceCardIds).toEqual(["card-1"]);
    expect(variations[1].id).toBe("card-2");
    expect(variations[1].sourceCardIds).toEqual(["card-2"]);
  });

  it("preserves separate variations when primary media is identical but body copy differs", () => {
    const cards: AdLibraryCardItem[] = [
      {
        id: "card-1",
        position: 0,
        headline: "Pop Culture Has a New Home!",
        body: "Copy A",
        description: null,
        ctaText: "Shop Now",
        ctaType: "SHOP_NOW",
        destinationUrl: "https://example.com",
        media: createMockMedia("asset-1"),
      },
      {
        id: "card-2",
        position: 1,
        headline: "Pop Culture Has a New Home!",
        body: "Copy B",
        description: null,
        ctaText: "Shop Now",
        ctaType: "SHOP_NOW",
        destinationUrl: "https://example.com",
        media: createMockMedia("asset-1"),
      },
    ];

    const variations = resolveCreativeVariations(cards);
    expect(variations).toHaveLength(2);
    expect(variations[0].body).toBe("Copy A");
    expect(variations[1].body).toBe("Copy B");
  });

  it("preserves separate variations when primary media and copy match but destination URL differs", () => {
    const cards: AdLibraryCardItem[] = [
      {
        id: "card-1",
        position: 0,
        headline: "Title",
        body: "Body",
        description: null,
        ctaText: "Shop Now",
        ctaType: "SHOP_NOW",
        destinationUrl: "https://example.com/page-1",
        media: createMockMedia("asset-1"),
      },
      {
        id: "card-2",
        position: 1,
        headline: "Title",
        body: "Body",
        description: null,
        ctaText: "Shop Now",
        ctaType: "SHOP_NOW",
        destinationUrl: "https://example.com/page-2",
        media: createMockMedia("asset-1"),
      },
    ];

    const variations = resolveCreativeVariations(cards);
    expect(variations).toHaveLength(2);
  });

  it("preserves separate variations when CTA text or type differs", () => {
    const cards: AdLibraryCardItem[] = [
      {
        id: "card-1",
        position: 0,
        headline: "Title",
        body: "Body",
        description: null,
        ctaText: "Shop Now",
        ctaType: "SHOP_NOW",
        destinationUrl: "https://example.com",
        media: createMockMedia("asset-1"),
      },
      {
        id: "card-2",
        position: 1,
        headline: "Title",
        body: "Body",
        description: null,
        ctaText: "Learn More",
        ctaType: "LEARN_MORE",
        destinationUrl: "https://example.com",
        media: createMockMedia("asset-1"),
      },
    ];

    const variations = resolveCreativeVariations(cards);
    expect(variations).toHaveLength(2);
  });

  it("preserves first occurrence order and collects all duplicate sourceCardIds", () => {
    const cards: AdLibraryCardItem[] = [
      {
        id: "card-A1",
        position: 0,
        headline: "Creative A",
        body: "Body A",
        description: null,
        ctaText: "Shop Now",
        ctaType: "SHOP_NOW",
        destinationUrl: "https://example.com",
        media: createMockMedia("asset-A"),
      },
      {
        id: "card-B1",
        position: 1,
        headline: "Creative B",
        body: "Body B",
        description: null,
        ctaText: "Shop Now",
        ctaType: "SHOP_NOW",
        destinationUrl: "https://example.com",
        media: createMockMedia("asset-B"),
      },
      {
        id: "card-A2",
        position: 2,
        headline: "Creative A",
        body: "Body A",
        description: null,
        ctaText: "Shop Now",
        ctaType: "SHOP_NOW",
        destinationUrl: "https://example.com",
        media: createMockMedia("asset-A"),
      },
    ];

    const variations = resolveCreativeVariations(cards);
    expect(variations).toHaveLength(2);
    expect(variations[0].id).toBe("card-A1");
    expect(variations[0].position).toBe(1);
    expect(variations[0].sourceCardIds).toEqual(["card-A1", "card-A2"]);

    expect(variations[1].id).toBe("card-B1");
    expect(variations[1].position).toBe(2);
    expect(variations[1].sourceCardIds).toEqual(["card-B1"]);
  });

  it("faithfully resolves the audited 3-card pattern [A, A, B] into 2 distinct variations", () => {
    const auditedCards: AdLibraryCardItem[] = [
      {
        id: "card-0",
        position: 0,
        headline: "Pop Culture Has a New Home!",
        body: "Punjab, your ultimate fandom destination is finally here! Come say hi!",
        description: null,
        ctaText: "Shop Now",
        ctaType: "SHOP_NOW",
        destinationUrl: "https://www.thesouledstore.com/stores-near-me",
        media: createMockMedia("video-punjab", "VIDEO"),
      },
      {
        id: "card-1",
        position: 1,
        headline: "Pop Culture Has a New Home!",
        body: "Punjab, your ultimate fandom destination is finally here! Come say hi!",
        description: null,
        ctaText: "Shop Now",
        ctaType: "SHOP_NOW",
        destinationUrl: "https://www.thesouledstore.com/stores-near-me",
        media: createMockMedia("video-punjab", "VIDEO"),
      },
      {
        id: "card-2",
        position: 2,
        headline: "Pop Culture Has a New Home!",
        body: "Step inside the store, where walls turn into canvases of pure creativity",
        description: null,
        ctaText: "Shop Now",
        ctaType: "SHOP_NOW",
        destinationUrl: "https://www.thesouledstore.com/stores-near-me",
        media: createMockMedia("video-canvas", "VIDEO"),
      },
    ];

    const variations = resolveCreativeVariations(auditedCards);
    expect(variations).toHaveLength(2);

    expect(variations[0].position).toBe(1);
    expect(variations[0].sourceCardIds).toEqual(["card-0", "card-1"]);
    expect(variations[0].body).toBe(
      "Punjab, your ultimate fandom destination is finally here! Come say hi!",
    );

    expect(variations[1].position).toBe(2);
    expect(variations[1].sourceCardIds).toEqual(["card-2"]);
    expect(variations[1].body).toBe(
      "Step inside the store, where walls turn into canvases of pure creativity",
    );
  });

  it("handles empty and single cards gracefully", () => {
    expect(resolveCreativeVariations([])).toEqual([]);

    const singleCard: AdLibraryCardItem[] = [
      {
        id: "card-single",
        position: 0,
        headline: "Single Title",
        body: "Single Body",
        description: null,
        ctaText: "Shop Now",
        ctaType: "SHOP_NOW",
        destinationUrl: "https://example.com",
        media: createMockMedia("asset-single"),
      },
    ];
    const variations = resolveCreativeVariations(singleCard);
    expect(variations).toHaveLength(1);
    expect(variations[0].position).toBe(1);
    expect(variations[0].sourceCardIds).toEqual(["card-single"]);
  });

  it("correctly formats display format with variations count", () => {
    expect(formatDisplayFormat("DCO", 3)).toBe("DCO • 3 variations");
    expect(formatDisplayFormat("DCO", 2)).toBe("DCO • 2 variations");
    expect(formatDisplayFormat("DCO", 1)).toBe("DCO");
    expect(formatDisplayFormat("DCO", 0)).toBe("DCO");
    expect(formatDisplayFormat("VIDEO", 0)).toBe("VIDEO");
    expect(formatDisplayFormat("IMAGE", 0)).toBe("IMAGE");
  });
});
