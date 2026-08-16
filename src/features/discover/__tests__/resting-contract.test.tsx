import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CreativeCard } from "../components/creative-card";
import type { AdLibraryItem } from "@/features/ad-library/types";

const sampleAd: AdLibraryItem = {
  id: "test-ad-123",
  source: "meta",
  sourceAdId: "1234567890",
  brand: {
    id: "brand-1",
    name: "Kapiva",
    slug: "kapiva",
  },
  displayFormat: "VIDEO",
  primaryText: "This is the long body text explaining why you should buy Kapiva.",
  headline: "Say Goodbye to Hair Fall with Natural Onion Oil",
  description: "Dermatologically tested and toxin free.",
  ctaText: "Shop Now",
  ctaType: "SHOP_NOW",
  destinationUrl: "https://example.com",
  publisherPlatforms: ["facebook", "instagram"],
  isActiveObserved: true,
  firstSeenAt: new Date("2026-08-16T10:00:00.000Z"),
  lastSeenAt: new Date("2026-08-16T10:00:00.000Z"),
  adLibraryUrl: "https://facebook.com/ads/123",
  media: [
    {
      id: "media-1",
      mediaType: "VIDEO",
      role: null,
      position: 0,
      mimeType: "video/mp4",
      mediaUrl: "https://media.brainfoods.in/media/sha256/original",
      previewLoopUrl: "https://media.brainfoods.in/media/sha256/previewloop",
      width: 720,
      height: 1280,
    },
  ],
  sourceCards: [],
  variations: [],
  cards: [],
};

const sampleDcoAd: AdLibraryItem = {
  ...sampleAd,
  id: "dco-ad-456",
  displayFormat: "DCO",
  brand: {
    id: "brand-2",
    name: "The Souled Store",
    slug: "thesouledstore",
  },
  variations: [
    {
      id: "var-1",
      sourceCardIds: ["card-1"],
      position: 1,
      headline: "Variation 1",
      body: "Variation 1 body text",
      description: null,
      ctaText: "Shop Now",
      ctaType: "SHOP_NOW",
      destinationUrl: "https://example.com",
      media: [
        {
          id: "m-1",
          mediaType: "IMAGE",
          role: "primary",
          position: 0,
          mimeType: "image/jpeg",
          mediaUrl: "https://media.brainfoods.in/media/sha256/img1",
        },
      ],
    },
    {
      id: "var-2",
      sourceCardIds: ["card-2"],
      position: 2,
      headline: "Variation 2",
      body: "Variation 2 body text",
      description: null,
      ctaText: "Shop Now",
      ctaType: "SHOP_NOW",
      destinationUrl: "https://example.com",
      media: [
        {
          id: "m-2",
          mediaType: "IMAGE",
          role: "primary",
          position: 0,
          mimeType: "image/jpeg",
          mediaUrl: "https://media.brainfoods.in/media/sha256/img2",
        },
      ],
    },
  ],
};

describe("Discover Resting Artifact Evidence Reduction Contract", () => {
  it("renders Brand name, Date Watermark, and Detail link for normal single-creative card", () => {
    const html = renderToStaticMarkup(<CreativeCard item={sampleAd} layoutRole="offset" />);

    // Brand name MUST be present
    expect(html).toContain("Kapiva");

    // Date watermark MUST be present (16 AUG)
    expect(html).toContain("16 AUG");

    // Detail navigation link to /ads/test-ad-123 MUST be present
    expect(html).toContain('/ads/test-ad-123');
    expect(html).toContain('aria-label="Inspect Kapiva creative"');
  });

  it("omits all removed evidence from normal single-creative card", () => {
    const html = renderToStaticMarkup(<CreativeCard item={sampleAd} layoutRole="lead" />);

    // Customer-facing media type label removed
    expect(html).not.toContain(">VIDEO<");
    expect(html).not.toContain(">IMAGE<");

    // "First seen" prose removed
    expect(html).not.toContain("First seen");

    // "Active when observed" prose removed
    expect(html).not.toContain("Active when observed");

    // Full body copy / primary text removed
    expect(html).not.toContain("This is the long body text explaining why you should buy Kapiva.");

    // Headline prose removed from resting Discover card
    expect(html).not.toContain("Say Goodbye to Hair Fall with Natural Onion Oil");

    // CTA badge / text removed
    expect(html).not.toContain("Shop Now");

    // "Examine creative →" link removed
    expect(html).not.toContain("Examine creative");
  });

  it("omits DCO textual labels and variation-count prose from multi-variation cards", () => {
    const html = renderToStaticMarkup(<CreativeCard item={sampleDcoAd} layoutRole="lead" />);

    // Brand name and date watermark render
    expect(html).toContain("The Souled Store");
    expect(html).toContain("16 AUG");

    // DCO label and variation-count prose MUST NOT be present
    expect(html).not.toContain("DCO •");
    expect(html).not.toContain("variations");
    expect(html).not.toContain("Variation 1 body text");
    expect(html).not.toContain("Examine creative");
  });

  it("renders optional hook when supplied, and completely omits it when null/empty", () => {
    // 1. When hook is null: no hook paragraph rendered
    const htmlNull = renderToStaticMarkup(<CreativeCard item={sampleAd} hook={null} />);
    expect(htmlNull).not.toContain("<p ");
    expect(htmlNull).not.toContain("servings");

    // 2. When genuine hook is supplied: renders directly beneath brand
    const htmlWithHook = renderToStaticMarkup(
      <CreativeCard item={sampleAd} hook="1 bottle = 80 servings" />,
    );
    expect(htmlWithHook).toContain("Kapiva");
    expect(htmlWithHook).toContain("1 bottle = 80 servings");
    expect(htmlWithHook).not.toContain("Hook:");
  });
});
