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
    cards: [],
  };

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
    // Concrete resolved text from card fallback (since ad-level raw was {{product.name}} and {{product.brand}})
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
    cards: [
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
            mediaType: "VIDEO",
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
            mediaType: "IMAGE",
            role: "preview",
            position: 0,
            mimeType: "image/jpeg",
            mediaUrl: resolveMediaUrl(samplePreviewKey, baseUrl),
          },
        ],
      },
    ],
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

  it("3. matchesFactualSearch performs factual text matching across brand, headline, primaryText, sourceAdId, and cards", () => {
    expect(matchesFactualSearch(sampleAd, "Mamaearth")).toBe(true);
    expect(matchesFactualSearch(sampleAd, "mama")).toBe(true);
    expect(matchesFactualSearch(sampleAd, "Natural Onion")).toBe(true);
    expect(matchesFactualSearch(sampleAd, "antioxidants")).toBe(true);
    expect(matchesFactualSearch(sampleAd, "1140026857924657")).toBe(true);
    expect(matchesFactualSearch(sampleAd, "Nike")).toBe(false);
    expect(matchesFactualSearch(sampleAd, "9999999999")).toBe(false);
    expect(matchesFactualSearch(sampleAd, "")).toBe(true);
    expect(matchesFactualSearch(sampleAd, "   ")).toBe(true);

    // Matching against DCO card text
    expect(matchesFactualSearch(sampleDcoAd, "fandom destination")).toBe(true);
    expect(matchesFactualSearch(sampleDcoAd, "canvases of pure creativity")).toBe(true);
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

  it("7. formatDisplayFormat renders factual multi-card tags", () => {
    expect(formatDisplayFormat("VIDEO", 0)).toBe("VIDEO");
    expect(formatDisplayFormat("IMAGE", 0)).toBe("IMAGE");
    expect(formatDisplayFormat("DCO", 3)).toBe("DCO • 3 cards");
    expect(formatDisplayFormat("DCO", 2)).toBe("DCO • 2 cards");
    expect(formatDisplayFormat("DCO", 1)).toBe("DCO • 1 card");
    expect(formatDisplayFormat("DCO", 0)).toBe("DCO");
    expect(formatDisplayFormat(null, 4)).toBe("DCO • 4 cards");
  });

  it("8. DCO read-model preserves multi-card structure and ordering", () => {
    expect(sampleDcoAd.cards).toHaveLength(2);
    expect(sampleDcoAd.cards[0].position).toBe(0);
    expect(sampleDcoAd.cards[1].position).toBe(1);
    expect(sampleDcoAd.cards[0].headline).toBe("Pop Culture Has a New Home!");
    expect(sampleDcoAd.cards[1].body).toContain("canvases of pure creativity");
  });

  it("9. zero raw template tokens leak into display-ready fields", () => {
    const rawTokens = ["{{product.name}}", "{{product.brand}}", "{{product.description}}"];

    for (const token of rawTokens) {
      if (sampleDcoAd.headline) expect(sampleDcoAd.headline).not.toContain(token);
      if (sampleDcoAd.primaryText) expect(sampleDcoAd.primaryText).not.toContain(token);
      if (sampleDcoAd.description) expect(sampleDcoAd.description).not.toContain(token);

      for (const card of sampleDcoAd.cards) {
        if (card.headline) expect(card.headline).not.toContain(token);
        if (card.body) expect(card.body).not.toContain(token);
        if (card.description) expect(card.description).not.toContain(token);
      }
    }
  });
});
