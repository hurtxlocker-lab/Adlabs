import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CanonicalGallery } from "../components/gallery/canonical-gallery";
import { GalleryAdCard } from "../components/gallery/gallery-ad-card";
import { EvidenceOverlay, formatRegionalReach } from "../components/gallery/evidence-overlay";
import {
  formatVideoDuration,
  formatCreativeReuse,
  formatCompactNumber,
} from "../utils/formatters";
import type { AdLibraryItem } from "@/features/ad-library/types";
import type { DiscoveryGalleryFacts } from "../queries/gallery-facts";

function createMockAd(overrides: Partial<AdLibraryItem> = {}): AdLibraryItem {
  return {
    id: "ad-123",
    source: "meta",
    sourceAdId: "meta-ad-123",
    brand: {
      id: "brand-1",
      name: "The Souled Store",
      slug: "the-souled-store",
    },
    displayFormat: "VIDEO",
    primaryText: "Super comfortable oversized tees.",
    headline: "Summer Collection",
    description: "Shop now",
    ctaText: "Shop Now",
    ctaType: "SHOP_NOW",
    destinationUrl: "https://thesouledstore.com",
    publisherPlatforms: ["facebook", "instagram"],
    isActiveObserved: true,
    firstSeenAt: new Date("2024-03-01T00:00:00Z"),
    lastSeenAt: new Date("2024-03-15T00:00:00Z"),
    adLibraryUrl: "https://facebook.com/ads/library/?id=meta-ad-123",
    media: [
      {
        id: "media-1",
        mediaType: "VIDEO",
        role: "video",
        position: 0,
        mimeType: "video/mp4",
        mediaUrl: "https://media.adlabs.io/video.mp4",
        previewLoopUrl: "https://media.adlabs.io/loop.mp4",
        width: 1080,
        height: 1350,
      },
    ],
    sourceCards: [],
    variations: [],
    cards: [],
    ...overrides,
  };
}

describe("Canonical Discover Gallery — Presentation Tests", () => {
  it("renders one canonical card per ad in deterministic row-major grid container", () => {
    const ads = [
      createMockAd({ id: "ad-1", brand: { id: "b1", name: "Brand 1", slug: "brand-1" } }),
      createMockAd({ id: "ad-2", brand: { id: "b2", name: "Brand 2", slug: "brand-2" } }),
      createMockAd({ id: "ad-3", brand: { id: "b3", name: "Brand 3", slug: "brand-3" } }),
      createMockAd({ id: "ad-4", brand: { id: "b4", name: "Brand 4", slug: "brand-4" } }),
    ];

    const html = renderToStaticMarkup(<CanonicalGallery items={ads} />);
    expect(html).toContain('data-testid="canonical-gallery"');
    expect(html).toContain("grid");
    expect(html).toContain("grid-cols-1");
    expect(html).toContain("items-start");
    expect(html).toContain('href="/ads/ad-1"');
    expect(html).toContain('href="/ads/ad-2"');
    expect(html).toContain('href="/ads/ad-3"');
    expect(html).toContain('href="/ads/ad-4"');
    expect(html).toContain("Brand 1");
    expect(html).toContain("Brand 2");
    expect(html).toContain("Brand 3");
    expect(html).toContain("Brand 4");
  });

  it("links directly to the canonical ad inspect detail page (/ads/[id]) and includes living hover motion", () => {
    const ad = createMockAd({ id: "canonical-ad-uuid-999" });
    const html = renderToStaticMarkup(<GalleryAdCard item={ad} />);
    expect(html).toContain('href="/ads/canonical-ad-uuid-999"');
    expect(html).toContain("motion-safe:hover:scale-[1.04]");
    expect(html).toContain("motion-safe:hover:-translate-y-0.5");
    expect(html).toContain("hover:brightness-[1.03]");
    expect(html).not.toContain("bg-black/25");
    expect(html).toContain("Inspect");
  });

  it("renders brand name immediately beneath the creative", () => {
    const ad = createMockAd({
      brand: { id: "b-sol", name: "Sol de Janeiro", slug: "sol-de-janeiro" },
    });
    const html = renderToStaticMarkup(<GalleryAdCard item={ad} />);
    expect(html).toContain("Sol de Janeiro");
  });

  it("does NOT render date, CTA text, or platform labels as card metadata", () => {
    const ad = createMockAd({
      ctaText: "Get 50% Off Now",
      ctaType: "SHOP_NOW",
      firstSeenAt: new Date("2024-01-15T00:00:00Z"),
      publisherPlatforms: ["facebook", "instagram", "messenger"],
    });

    const html = renderToStaticMarkup(<GalleryAdCard item={ad} />);
    expect(html).not.toContain("Get 50% Off Now");
    expect(html).not.toContain("SHOP_NOW");
    expect(html).not.toContain("2024-01-15");
    expect(html).not.toContain("messenger");
  });

  it("renders EU evidence overlay when EU evidence exists", () => {
    const ad = createMockAd({ id: "ad-eu" });
    const facts: DiscoveryGalleryFacts = {
      adId: "ad-eu",
      hasEuTransparencyEvidence: true,
      latestEuTotalReach: BigInt(24800),
      hasUkTransparencyEvidence: false,
      latestUkTotalReach: null,
      videoDurationMs: 18000,
      exactCreativeReuseCount: 4,
    };

    const html = renderToStaticMarkup(<GalleryAdCard item={ad} facts={facts} />);
    expect(html).toContain("EU · 24.8K");
    expect(html).toContain("aria-label=\"EU transparency evidence: 24.8K verified reach\"");
  });

  it("renders 'EU evidence' when EU reach is null (never coerces missing reach to 0)", () => {
    const ad = createMockAd({ id: "ad-eu-noreach" });
    const facts: DiscoveryGalleryFacts = {
      adId: "ad-eu-noreach",
      hasEuTransparencyEvidence: true,
      latestEuTotalReach: null,
      hasUkTransparencyEvidence: false,
      latestUkTotalReach: null,
      videoDurationMs: null,
      exactCreativeReuseCount: null,
    };

    const html = renderToStaticMarkup(<GalleryAdCard item={ad} facts={facts} />);
    expect(html).toContain("EU evidence");
    expect(html).not.toContain("EU · 0");
    expect(html).not.toContain("0K");
  });

  it("renders UK evidence overlay when UK evidence exists", () => {
    const overlayHtml = renderToStaticMarkup(
      <EvidenceOverlay hasUkEvidence={true} ukReach={BigInt(15200)} />,
    );
    expect(overlayHtml).toContain("UK · 15.2K");
  });

  it("renders video duration micro-annotation (e.g. 0:18, 1:15)", () => {
    const ad = createMockAd({ id: "ad-vid" });
    const facts: DiscoveryGalleryFacts = {
      adId: "ad-vid",
      hasEuTransparencyEvidence: false,
      latestEuTotalReach: null,
      hasUkTransparencyEvidence: false,
      latestUkTotalReach: null,
      videoDurationMs: 18000,
      exactCreativeReuseCount: null,
    };

    const html = renderToStaticMarkup(<GalleryAdCard item={ad} facts={facts} />);
    expect(html).toContain("0:18");
    expect(html).toContain('aria-label="Video duration: 0:18"');
  });

  it("renders exact creative reuse badge only when reuse count >= 2", () => {
    const ad = createMockAd({ id: "ad-reuse" });
    const facts4: DiscoveryGalleryFacts = {
      adId: "ad-reuse",
      hasEuTransparencyEvidence: false,
      latestEuTotalReach: null,
      hasUkTransparencyEvidence: false,
      latestUkTotalReach: null,
      videoDurationMs: null,
      exactCreativeReuseCount: 4,
    };

    const html4 = renderToStaticMarkup(<GalleryAdCard item={ad} facts={facts4} />);
    expect(html4).toContain("×4");
    expect(html4).toContain('title="Exact creative used across 4 ads from this brand"');

    // Count = 1 must NOT be rendered
    const facts1: DiscoveryGalleryFacts = {
      ...facts4,
      exactCreativeReuseCount: 1,
    };
    const html1 = renderToStaticMarkup(<GalleryAdCard item={ad} facts={facts1} />);
    expect(html1).not.toContain("×1");
  });
});

describe("Formatters Utility — Pure Logic Tests", () => {
  it("formats compact numbers correctly", () => {
    expect(formatCompactNumber(500)).toBe("500");
    expect(formatCompactNumber(1200)).toBe("1.2K");
    expect(formatCompactNumber(24800)).toBe("24.8K");
    expect(formatCompactNumber(1000000)).toBe("1M");
    expect(formatCompactNumber(2500000)).toBe("2.5M");
  });

  it("formats video duration in mm:ss format", () => {
    expect(formatVideoDuration(18000)).toBe("0:18");
    expect(formatVideoDuration(65000)).toBe("1:05");
    expect(formatVideoDuration(120000)).toBe("2:00");
    expect(formatVideoDuration(0)).toBeNull();
    expect(formatVideoDuration(-500)).toBeNull();
    expect(formatVideoDuration(null)).toBeNull();
  });

  it("formats regional reach cleanly and rejects 0 or negative values", () => {
    expect(formatRegionalReach(BigInt(24800))).toBe("24.8K");
    expect(formatRegionalReach(0)).toBeNull();
    expect(formatRegionalReach(BigInt(0))).toBeNull();
    expect(formatRegionalReach(null)).toBeNull();
  });

  it("formats creative reuse marker and suppresses <= 1", () => {
    expect(formatCreativeReuse(4)?.badge).toBe("×4");
    expect(formatCreativeReuse(2)?.badge).toBe("×2");
    expect(formatCreativeReuse(1)).toBeNull();
    expect(formatCreativeReuse(0)).toBeNull();
    expect(formatCreativeReuse(null)).toBeNull();
  });
});
