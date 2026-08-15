import { describe, expect, it } from "vitest";
import { resolveMediaUrl } from "@/storage";
import type { AdLibraryItem } from "../types";
import { formatFactualDate, getPrimaryMedia, matchesFactualSearch } from "../utils";

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

  it("3. matchesFactualSearch performs factual text matching across brand, headline, primaryText, sourceAdId", () => {
    // Brand name match
    expect(matchesFactualSearch(sampleAd, "Mamaearth")).toBe(true);
    expect(matchesFactualSearch(sampleAd, "mama")).toBe(true);

    // Headline match
    expect(matchesFactualSearch(sampleAd, "Natural Onion")).toBe(true);

    // Primary text match
    expect(matchesFactualSearch(sampleAd, "antioxidants")).toBe(true);

    // Source Ad ID match
    expect(matchesFactualSearch(sampleAd, "1140026857924657")).toBe(true);

    // Negative match
    expect(matchesFactualSearch(sampleAd, "Nike")).toBe(false);
    expect(matchesFactualSearch(sampleAd, "9999999999")).toBe(false);

    // Empty search matches all
    expect(matchesFactualSearch(sampleAd, "")).toBe(true);
    expect(matchesFactualSearch(sampleAd, "   ")).toBe(true);
  });

  it("4. verifies canonical mediaUrl resolution within AdLibraryItem", () => {
    expect(sampleAd.media[0].mediaUrl.startsWith("https://media.brainfoods.in/media/sha256/")).toBe(true);
    expect(sampleAd.media[1].mediaUrl.startsWith("https://media.brainfoods.in/media/sha256/")).toBe(true);
  });
});
