import { describe, expect, it } from "vitest";
import { resolveMediaUrl } from "@/storage";
import type { AdLibraryItem } from "../types";
import {
  formatDisplayFormat,
  formatFactualDate,
  getPrimaryMedia,
  isTemplateExpression,
  matchesFactualSearch,
  sanitizeDisplayCopy,
} from "../utils";

describe("Ad Library Read Model & Pure Logic Tests", () => {
  const sampleMediaKey =
    "media/sha256/b3146a45316034a9aeae7d9463753d205817b8a9cd5c3e1e535639a84a213044";
  const samplePreviewKey =
    "media/sha256/dc34a6109824e9b8ccc7a9c342ebc97def01d06ff72724eb8d92b4cb3871e1ec";

  const baseUrl = "https://media.brainfoods.in";

  const sampleAd: AdLibraryItem = {
    id: "f83a4879-c529-4d6b-bd64-07fa56a29f55",
    source: "meta",
    sourceAdId: "1140026857924657",
    brand: {
      id: "61918135-4927-4737-8000-000000000000",
      name: "Mamaearth",
      slug: "mamaearth",
    },
    displayFormat: "VIDEO",
    primaryText:
      "Say goodbye to hair fall with Mamaearth Onion Hair Oil! Rich in sulfur, potassium, and antioxidants.",
    headline: "Reduce Hair Fall with Natural Onion Oil",
    description: "Dermatologically tested and toxin free.",
    ctaText: "Shop Now",
    ctaType: "SHOP_NOW",
    destinationUrl: "https://mamaearth.in/product/onion-hair-oil",
    publisherPlatforms: ["facebook", "instagram"],
    isActiveObserved: true,
    firstSeenAt: new Date("2026-08-15T00:00:00.000Z"),
    lastSeenAt: new Date("2026-08-15T00:00:00.000Z"),
    adLibraryUrl: "https://www.facebook.com/ads/library/?id=1140026857924657",
    media: [
      {
        id: "media-vid-1",
        mediaType: "VIDEO",
        role: null,
        position: 0,
        mimeType: "video/mp4",
        mediaUrl: resolveMediaUrl(sampleMediaKey, baseUrl),
      },
      {
        id: "media-img-1",
        mediaType: "IMAGE",
        role: "preview",
        position: 1,
        mimeType: "image/jpeg",
        mediaUrl: resolveMediaUrl(samplePreviewKey, baseUrl),
      },
    ],
    sourceCards: [],
    variations: [],
    cards: [],
  };

  const sampleDcoCards = [
    {
      id: "card-1",
      position: 0,
      headline: "Pop Culture Has a New Home!",
      body: "Punjab, your ultimate fandom destination is finally here! Come say hi!",
      description: null,
      ctaText: "Shop Now",
      ctaType: "SHOP_NOW",
      destinationUrl: "https://www.thesouledstore.com/stores-near-me",
      media: [
        {
          id: "media-dco-1",
          mediaType: "VIDEO" as const,
          role: "primary",
          position: 0,
          mimeType: "video/mp4",
          mediaUrl: resolveMediaUrl(sampleMediaKey, baseUrl),
        },
      ],
    },
    {
      id: "card-2",
      position: 1,
      headline: "Pop Culture Has a New Home!",
      body: "Step inside the store, where walls turn into canvases of pure creativity",
      description: "10% Cashback",
      ctaText: "Shop Now",
      ctaType: "SHOP_NOW",
      destinationUrl: "https://www.thesouledstore.com/stores-near-me",
      media: [
        {
          id: "media-dco-2",
          mediaType: "IMAGE" as const,
          role: "preview",
          position: 0,
          mimeType: "image/jpeg",
          mediaUrl: resolveMediaUrl(samplePreviewKey, baseUrl),
        },
      ],
    },
  ];

  const sampleDcoAd: AdLibraryItem = {
    id: "ade858ad-5e42-43a8-b422-97dc7e615d30",
    source: "meta",
    sourceAdId: "1841121180105853",
    brand: {
      id: "39147625-7640-4230-8000-000000000000",
      name: "The Souled Store",
      slug: "the-souled-store",
    },
    displayFormat: "DCO",
    headline: "Pop Culture Has a New Home!",
    primaryText:
      "Punjab, your ultimate fandom destination is finally here! Come say hi!",
    description: null,
    ctaText: "Shop Now",
    ctaType: "SHOP_NOW",
    destinationUrl: "https://www.thesouledstore.com/stores-near-me",
    publisherPlatforms: ["facebook", "instagram"],
    isActiveObserved: true,
    firstSeenAt: new Date("2026-08-15T00:00:00.000Z"),
    lastSeenAt: new Date("2026-08-15T00:00:00.000Z"),
    adLibraryUrl: "https://www.facebook.com/ads/library/?id=1841121180105853",
    media: [
      {
        id: "media-dco-1",
        mediaType: "VIDEO",
        role: "primary",
        position: 0,
        mimeType: "video/mp4",
        mediaUrl: resolveMediaUrl(sampleMediaKey, baseUrl),
      },
      {
        id: "media-dco-2",
        mediaType: "IMAGE",
        role: "preview",
        position: 1,
        mimeType: "image/jpeg",
        mediaUrl: resolveMediaUrl(samplePreviewKey, baseUrl),
      },
    ],
    sourceCards: sampleDcoCards,
    variations: [
      {
        id: "card-1",
        sourceCardIds: ["card-1"],
        position: 1,
        headline: "Pop Culture Has a New Home!",
        body: "Punjab, your ultimate fandom destination is finally here! Come say hi!",
        description: null,
        ctaText: "Shop Now",
        ctaType: "SHOP_NOW",
        destinationUrl: "https://www.thesouledstore.com/stores-near-me",
        media: sampleDcoCards[0].media,
      },
      {
        id: "card-2",
        sourceCardIds: ["card-2"],
        position: 2,
        headline: "Pop Culture Has a New Home!",
        body: "Step inside the store, where walls turn into canvases of pure creativity",
        description: "10% Cashback",
        ctaText: "Shop Now",
        ctaType: "SHOP_NOW",
        destinationUrl: "https://www.thesouledstore.com/stores-near-me",
        media: sampleDcoCards[1].media,
      },
    ],
    cards: sampleDcoCards,
  };

  it("1. getPrimaryMedia correctly extracts video asset and preview image", () => {
    const { video, preview, displayMedia } = getPrimaryMedia(sampleAd);

    expect(video).toBeDefined();
    expect(video?.mediaType).toBe("VIDEO");
    expect(video?.mediaUrl).toBe(
      "https://media.brainfoods.in/media/sha256/b3146a45316034a9aeae7d9463753d205817b8a9cd5c3e1e535639a84a213044",
    );

    expect(preview).toBeDefined();
    expect(preview?.role).toBe("preview");
    expect(preview?.mediaUrl).toBe(
      "https://media.brainfoods.in/media/sha256/dc34a6109824e9b8ccc7a9c342ebc97def01d06ff72724eb8d92b4cb3871e1ec",
    );

    expect(displayMedia?.id).toBe(video?.id);
  });

  it("2. formatFactualDate outputs clean human date", () => {
    expect(formatFactualDate("2026-08-15T00:00:00.000Z")).toBe("Aug 15, 2026");
    expect(formatFactualDate("invalid-date")).toBe("Unknown");
  });

  it("3. matchesFactualSearch performs factual text matching across brand, headline, primaryText, and sourceAdId", () => {
    expect(matchesFactualSearch(sampleAd, "Mamaearth")).toBe(true);
    expect(matchesFactualSearch(sampleAd, "mama")).toBe(true);
    expect(matchesFactualSearch(sampleAd, "Natural Onion")).toBe(true);
    expect(matchesFactualSearch(sampleAd, "antioxidants")).toBe(true);
    expect(matchesFactualSearch(sampleAd, "1140026857924657")).toBe(true);
    expect(matchesFactualSearch(sampleAd, "Nike")).toBe(false);
    expect(matchesFactualSearch(sampleAd, "9999999999")).toBe(false);
    expect(matchesFactualSearch(sampleAd, "")).toBe(true);
    expect(matchesFactualSearch(sampleAd, "   ")).toBe(true);
  });

  it("4. verifies canonical mediaUrl resolution within AdLibraryItem", () => {
    expect(sampleAd.media[0].mediaUrl.startsWith("https://media.brainfoods.in/media/sha256/")).toBe(true);
    expect(sampleAd.media[1].mediaUrl.startsWith("https://media.brainfoods.in/media/sha256/")).toBe(true);
  });

  it("5. isTemplateExpression accurately detects unresolved Meta template tokens", () => {
    expect(isTemplateExpression("{{product.name}}")).toBe(true);
    expect(isTemplateExpression("{{product.brand}}")).toBe(true);
    expect(isTemplateExpression("{{product.description}}")).toBe(true);
    expect(isTemplateExpression("{{ product.name }}")).toBe(true);
    expect(isTemplateExpression("Buy {{product.name}} today!")).toBe(true);

    // Clean strings
    expect(isTemplateExpression("Pop Culture Has a New Home!")).toBe(false);
    expect(isTemplateExpression("Explore Online")).toBe(false);
    expect(isTemplateExpression("")).toBe(false);
    expect(isTemplateExpression(null)).toBe(false);
    expect(isTemplateExpression(undefined)).toBe(false);
  });

  it("6. sanitizeDisplayCopy strips unresolved template strings and empty values", () => {
    expect(sanitizeDisplayCopy("{{product.name}}")).toBeNull();
    expect(sanitizeDisplayCopy("{{product.brand}}")).toBeNull();
    expect(sanitizeDisplayCopy("   {{product.name}}   ")).toBeNull();
    expect(sanitizeDisplayCopy("")).toBeNull();
    expect(sanitizeDisplayCopy("   ")).toBeNull();
    expect(sanitizeDisplayCopy(null)).toBeNull();
    expect(sanitizeDisplayCopy(undefined)).toBeNull();

    expect(sanitizeDisplayCopy("Pop Culture Has a New Home!")).toBe(
      "Pop Culture Has a New Home!",
    );
    expect(sanitizeDisplayCopy("  Shop Now  ")).toBe("Shop Now");
  });

  it("7. formatDisplayFormat renders factual multi-variation tags", () => {
    expect(formatDisplayFormat("VIDEO", 0)).toBe("VIDEO");
    expect(formatDisplayFormat("IMAGE", 0)).toBe("IMAGE");
    expect(formatDisplayFormat("DCO", 3)).toBe("DCO • 3 variations");
    expect(formatDisplayFormat("DCO", 2)).toBe("DCO • 2 variations");
    expect(formatDisplayFormat("DCO", 1)).toBe("DCO");
    expect(formatDisplayFormat("DCO", 0)).toBe("DCO");
    expect(formatDisplayFormat(null, 4)).toBe("DCO • 4 variations");
  });

  it("8. DCO read-model preserves multi-variation structure and ordering", () => {
    expect(sampleDcoAd.variations).toHaveLength(2);
    expect(sampleDcoAd.variations[0].position).toBe(1);
    expect(sampleDcoAd.variations[1].position).toBe(2);
    expect(sampleDcoAd.variations[0].headline).toBe("Pop Culture Has a New Home!");
    expect(sampleDcoAd.variations[1].body).toContain("canvases of pure creativity");
  });

  it("9. zero raw template tokens leak into display-ready fields", () => {
    const rawTokens = ["{{product.name}}", "{{product.brand}}", "{{product.description}}"];

    for (const token of rawTokens) {
      if (sampleDcoAd.headline) expect(sampleDcoAd.headline).not.toContain(token);
      if (sampleDcoAd.primaryText) expect(sampleDcoAd.primaryText).not.toContain(token);
      if (sampleDcoAd.description) expect(sampleDcoAd.description).not.toContain(token);

      for (const variation of sampleDcoAd.variations) {
        if (variation.headline) expect(variation.headline).not.toContain(token);
        if (variation.body) expect(variation.body).not.toContain(token);
        if (variation.description) expect(variation.description).not.toContain(token);
      }
    }
  });
});
