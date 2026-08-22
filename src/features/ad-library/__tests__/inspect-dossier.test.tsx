import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdIntelligenceDeck } from "../components/ad-intelligence-deck";
import { formatCommonAspectRatio } from "../utils/aspect-ratio";
import type { AdLibraryItem } from "../types";

function createMockInspectAd(overrides: Partial<AdLibraryItem> = {}): AdLibraryItem {
  return {
    id: "ad-uuid-1",
    source: "meta",
    sourceAdId: "1234567890",
    brand: {
      id: "brand-uuid-1",
      name: "Happy Mammoth",
      slug: "happy-mammoth",
    },
    displayFormat: "VIDEO",
    primaryText: "Clinically proven formula for gut health.",
    headline: "Hormone Harmony",
    description: "Free shipping over $50",
    ctaText: "Shop Now",
    ctaType: "SHOP_NOW",
    destinationUrl: "https://happymammoth.com",
    publisherPlatforms: ["facebook", "instagram"],
    isActiveObserved: true,
    firstSeenAt: new Date("2024-01-10T00:00:00Z"),
    lastSeenAt: new Date("2024-02-21T00:00:00Z"),
    adLibraryUrl: "https://facebook.com/ads/library/?id=1234567890",
    media: [
      {
        id: "media-1",
        mediaType: "VIDEO",
        role: "video",
        position: 0,
        mimeType: "video/mp4",
        mediaUrl: "https://media.adlabs.io/video.mp4",
        width: 1080,
        height: 1350,
      },
    ],
    sourceCards: [],
    variations: [],
    cards: [],
    dossier: {
      startDate: new Date("2024-01-10T00:00:00Z"),
      runningDays: 42,
      exactCreativeReuseCount: 6,
      pageCategory: "Health/beauty",
      instagramUsername: "happymammoth",
      instagramFollowers: BigInt(254000),
      instagramVerified: true,
      facebookLikes: BigInt(182000),
      facebookVerified: true,
      aboutText: "Natural supplements for women's health.",
      hasEuTransparencyEvidence: true,
      latestEuTotalReach: BigInt(24800),
      latestEuTransparencyObservedAt: new Date("2024-02-21T00:00:00Z"),
      latestEuTargetAgeMin: 25,
      latestEuTargetAgeMax: 65,
      latestEuTargetGender: "FEMALE",
      hasUkTransparencyEvidence: true,
      latestUkTotalReach: BigInt(15200),
      latestUkTransparencyObservedAt: new Date("2024-02-20T00:00:00Z"),
      latestUkTargetAgeMin: 25,
      latestUkTargetAgeMax: 65,
      latestUkTargetGender: "FEMALE",
      targetCountries: ["FR", "DE"],
      reachedCountries: ["FR", "DE", "ES", "IT"],
      videoDurationMs: 18000,
      aspectRatio: 0.8,
      width: 1080,
      height: 1350,
      siblingDeployments: [
        {
          id: "ad-sibling-1",
          sourceAdId: "9876543210",
          firstSeenAt: new Date("2024-01-15T00:00:00Z"),
          lastSeenAt: new Date("2024-02-21T00:00:00Z"),
          hasEuEvidence: true,
          hasUkEvidence: false,
        },
      ],
    },
    ...overrides,
  };
}

describe("Dense Ad Intelligence Deck — Component Tests", () => {
  it("renders concentrated metadata: longevity, reuse ×6, EU/UK reach, format specs, platforms, advertiser", () => {
    const ad = createMockInspectAd();
    const html = renderToStaticMarkup(<AdIntelligenceDeck item={ad} />);

    expect(html).toContain("Ad Intelligence Deck");
    expect(html).toContain("Running Longevity");
    expect(html).toContain("42 days");
    expect(html).toContain("Creative Deployments");
    expect(html).toContain("×6");
    expect(html).toContain("EU Transparency");
    expect(html).toContain("24.8K");
    expect(html).toContain("UK Transparency");
    expect(html).toContain("15.2K");
    expect(html).toContain("Video · 0:18");
    expect(html).toContain("1080×1350");
    expect(html).toContain("(4:5)");
    expect(html).toContain("Facebook · Instagram");
    expect(html).toContain("Health/beauty");
    expect(html).toContain("@happymammoth");
    expect(html).toContain("254K");
    expect(html).toContain("182K likes");
    expect(html).toContain("Shop Now");
  });

  it("renders distinct reached and targeted countries without merging", () => {
    const ad = createMockInspectAd();
    const html = renderToStaticMarkup(<AdIntelligenceDeck item={ad} />);

    expect(html).toContain("Reached");
    expect(html).toContain("FR · DE · ES · IT");
    expect(html).toContain("Targeted");
    expect(html).toContain("FR · DE");
  });

  it("handles missing facts cleanly with data-driven reflow without fake zeros or empty boxes", () => {
    const ad = createMockInspectAd({
      dossier: {
        startDate: null,
        runningDays: 5,
        exactCreativeReuseCount: null,
        pageCategory: null,
        instagramUsername: null,
        instagramFollowers: null,
        instagramVerified: null,
        facebookLikes: null,
        facebookVerified: null,
        aboutText: null,
        hasEuTransparencyEvidence: false,
        latestEuTotalReach: null,
        latestEuTransparencyObservedAt: null,
        latestEuTargetAgeMin: null,
        latestEuTargetAgeMax: null,
        latestEuTargetGender: null,
        hasUkTransparencyEvidence: false,
        latestUkTotalReach: null,
        latestUkTransparencyObservedAt: null,
        latestUkTargetAgeMin: null,
        latestUkTargetAgeMax: null,
        latestUkTargetGender: null,
        targetCountries: [],
        reachedCountries: [],
        videoDurationMs: null,
        aspectRatio: null,
        width: null,
        height: null,
        siblingDeployments: [],
      },
    });

    const html = renderToStaticMarkup(<AdIntelligenceDeck item={ad} />);
    expect(html).not.toContain("EU · 0");
    expect(html).not.toContain("EU Transparency");
    expect(html).not.toContain("UK Transparency");
    expect(html).not.toContain("Creative Deployments");
    expect(html).not.toContain("N/A");
    expect(html).not.toContain("Unknown");
  });

  it("formats common advertising aspect ratios correctly", () => {
    expect(formatCommonAspectRatio(1080, 1350)).toBe("4:5");
    expect(formatCommonAspectRatio(1080, 1920)).toBe("9:16");
    expect(formatCommonAspectRatio(1080, 1080)).toBe("1:1");
    expect(formatCommonAspectRatio(1920, 1080)).toBe("16:9");
    expect(formatCommonAspectRatio(1200, 628)).toBe("1.91:1");
    expect(formatCommonAspectRatio(1440, 1080)).toBe("4:3");
    expect(formatCommonAspectRatio(null, null, 0.8)).toBe("4:5");
    expect(formatCommonAspectRatio(null, null, 0.5625)).toBe("9:16");
  });

  it("renders IntelligenceConsoleHero with dominant console styling, semantic badges, and micro-visualizations", async () => {
    const { IntelligenceConsoleHero } = await import("../components/intelligence-console-hero");
    const ad = createMockInspectAd();
    const html = renderToStaticMarkup(<IntelligenceConsoleHero item={ad} />);

    expect(html).toContain("Intelligence Cockpit");
    expect(html).toContain("Happy Mammoth");
    expect(html).toContain("Active when observed");
    expect(html).toContain("Meta Ad 1234567890");
    expect(html).toContain("42d");
    expect(html).toContain("×6");
    expect(html).toContain("24.8K");
    expect(html).toContain("EU Disclosed Statutory Reach");
    expect(html).toContain("(4:5)");
    expect(html).toContain("0:18");
    expect(html).toContain("Instagram");
    expect(html).toContain("Facebook");
    expect(html).toContain("France");
    expect(html).toContain("Germany");
    expect(html).toContain("Spain");
    expect(html).toContain("Italy");
    expect(html).toContain("Transparency Evidence");
    expect(html).toContain("EU Transparency");
    expect(html).not.toContain("EU Disclosed (");
    expect(html).toContain("Health / Beauty");
    expect(html).toContain("@happymammoth");
    expect(html).toContain("254K");
    expect(html).toContain("CTA: Shop Now");
    expect(html).toContain("Open in Meta");
    expect(html).not.toContain("Observed:");
  });

  it("omits transparency module entirely when no EU/UK evidence exists", async () => {
    const { IntelligenceConsoleHero } = await import("../components/intelligence-console-hero");
    const ad = createMockInspectAd({
      dossier: {
        startDate: new Date("2024-01-10T00:00:00Z"),
        runningDays: 14,
        exactCreativeReuseCount: 1,
        pageCategory: "Product/service",
        instagramUsername: "testbrand",
        instagramFollowers: BigInt(50000),
        instagramVerified: false,
        facebookLikes: null,
        facebookVerified: false,
        aboutText: null,
        hasEuTransparencyEvidence: false,
        latestEuTotalReach: null,
        latestEuTransparencyObservedAt: null,
        latestEuTargetAgeMin: null,
        latestEuTargetAgeMax: null,
        latestEuTargetGender: null,
        hasUkTransparencyEvidence: false,
        latestUkTotalReach: null,
        latestUkTransparencyObservedAt: null,
        latestUkTargetAgeMin: null,
        latestUkTargetAgeMax: null,
        latestUkTargetGender: null,
        targetCountries: [],
        reachedCountries: [],
        videoDurationMs: null,
        aspectRatio: null,
        width: null,
        height: null,
        siblingDeployments: [],
      },
    });

    const html = renderToStaticMarkup(<IntelligenceConsoleHero item={ad} />);
    expect(html).not.toContain("Transparency Evidence");
    expect(html).not.toContain("Standard commercial deployment");
    expect(html).not.toContain("Exact Reuse"); // reuseCount is 1 -> omitted
    expect(html).toContain("Worldwide Commercial Delivery");
    expect(html).not.toContain("Observed:");
  });
});
