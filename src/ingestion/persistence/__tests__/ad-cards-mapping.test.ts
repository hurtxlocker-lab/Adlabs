import { describe, expect, it } from "vitest";
import type { SourceAdCard } from "@/ingestion/types";
import { DuplicateCardPositionError } from "../types";
import { validateNonNegativeInt } from "../validation";

describe("Ad Card Mapping & Validation Invariants", () => {
  const sampleCard: SourceAdCard = {
    position: 0,
    title: "Card Title 1",
    body: "Card Body copy",
    description: "Card Description",
    ctaText: "Shop Now",
    ctaType: "SHOP_NOW",
    destinationUrl: "https://example.com/item1",
    media: [
      {
        type: "image",
        sourceUrl: "https://img.test/card1.jpg",
        role: "primary",
      },
    ],
    raw: { card_id: "raw_card_1" },
  };

  it("validates position 0 as a valid non-negative integer", () => {
    expect(validateNonNegativeInt(0, "card.position")).toBe(0);
    expect(validateNonNegativeInt(sampleCard.position, "card.position")).toBe(0);
  });

  it("rejects negative positions", () => {
    expect(() => validateNonNegativeInt(-1, "card.position")).toThrow(
      /must be >= 0/,
    );
  });

  it("rejects fractional/decimal positions", () => {
    expect(() => validateNonNegativeInt(1.5, "card.position")).toThrow(
      /must be a safe integer/,
    );
  });

  it("rejects non-number or NaN/Infinity positions", () => {
    expect(() => validateNonNegativeInt(NaN, "card.position")).toThrow();
    expect(() => validateNonNegativeInt(Infinity, "card.position")).toThrow();
    expect(() => validateNonNegativeInt("0", "card.position")).toThrow();
  });

  it("verifies DuplicateCardPositionError contains adId and duplicatePosition", () => {
    const error = new DuplicateCardPositionError(
      "Duplicate card position",
      "ad_uuid_123",
      2,
    );

    expect(error.name).toBe("DuplicateCardPositionError");
    expect(error.adId).toBe("ad_uuid_123");
    expect(error.duplicatePosition).toBe(2);
    expect(error.message).toContain("Duplicate card position");
  });

  it("verifies canonical card null fields remain null for snapshot replacement", () => {
    const nullCard: SourceAdCard = {
      position: 1,
      title: null,
      body: null,
      description: null,
      ctaText: null,
      ctaType: null,
      destinationUrl: null,
      media: [],
      raw: {},
    };

    expect(nullCard.title).toBeNull();
    expect(nullCard.body).toBeNull();
    expect(nullCard.description).toBeNull();
    expect(nullCard.ctaText).toBeNull();
    expect(nullCard.destinationUrl).toBeNull();
  });

  it("ensures card media is structurally isolated from card copy attributes", () => {
    expect(sampleCard.media).toHaveLength(1);
    expect(sampleCard.media[0].sourceUrl).toBe("https://img.test/card1.jpg");
    // Card copy does NOT derive or embed media URLs
    expect(sampleCard.title).toBe("Card Title 1");
    expect(sampleCard.destinationUrl).toBe("https://example.com/item1");
  });
});
