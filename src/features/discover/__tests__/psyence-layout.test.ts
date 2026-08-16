import { describe, expect, it } from "vitest";
import {
  getVisiblePsyenceVariations,
  resolvePsyenceLayout,
} from "../utils/psyence-layout";
import type { AdLibraryCreativeVariation } from "@/features/ad-library/types";

function createMockVariation(id: string, position: number): AdLibraryCreativeVariation {
  return {
    id,
    sourceCardIds: [id],
    position,
    headline: `Headline ${position}`,
    body: `Body ${position}`,
    description: null,
    ctaText: "Shop Now",
    ctaType: "SHOP_NOW",
    destinationUrl: "https://example.com",
    media: [
      {
        id: `media-${id}`,
        mediaType: "IMAGE",
        role: "primary",
        position: 0,
        mimeType: "image/jpeg",
        mediaUrl: `https://media.test.internal/${id}`,
      },
    ],
  };
}

describe("Psyence Mosaic Deterministic Layout Resolver", () => {
  it("resolves single layout for 0 or 1 variations (bypassing mosaic)", () => {
    expect(resolvePsyenceLayout(0)).toBe("single");
    expect(resolvePsyenceLayout(1)).toBe("single");
  });

  it("resolves duo layout for exactly 2 variations", () => {
    expect(resolvePsyenceLayout(2)).toBe("duo");
  });

  it("resolves trio layout for exactly 3 variations", () => {
    expect(resolvePsyenceLayout(3)).toBe("trio");
  });

  it("resolves quad layout for exactly 4 variations", () => {
    expect(resolvePsyenceLayout(4)).toBe("quad");
  });

  it("resolves overflow layout for >4 variations", () => {
    expect(resolvePsyenceLayout(5)).toBe("overflow");
    expect(resolvePsyenceLayout(7)).toBe("overflow");
    expect(resolvePsyenceLayout(12)).toBe("overflow");
  });

  it("extracts visible variations and computes remaining count with max 4 cap", () => {
    const list2 = [createMockVariation("v1", 1), createMockVariation("v2", 2)];
    const res2 = getVisiblePsyenceVariations(list2, 4);
    expect(res2.visibleVariations).toHaveLength(2);
    expect(res2.remainingCount).toBe(0);
    expect(res2.layoutType).toBe("duo");

    const list3 = [...list2, createMockVariation("v3", 3)];
    const res3 = getVisiblePsyenceVariations(list3, 4);
    expect(res3.visibleVariations).toHaveLength(3);
    expect(res3.remainingCount).toBe(0);
    expect(res3.layoutType).toBe("trio");

    const list4 = [...list3, createMockVariation("v4", 4)];
    const res4 = getVisiblePsyenceVariations(list4, 4);
    expect(res4.visibleVariations).toHaveLength(4);
    expect(res4.remainingCount).toBe(0);
    expect(res4.layoutType).toBe("quad");

    const list5 = [...list4, createMockVariation("v5", 5)];
    const res5 = getVisiblePsyenceVariations(list5, 4);
    expect(res5.visibleVariations).toHaveLength(4);
    expect(res5.remainingCount).toBe(1);
    expect(res5.layoutType).toBe("overflow");

    const list7 = [
      ...list5,
      createMockVariation("v6", 6),
      createMockVariation("v7", 7),
    ];
    const res7 = getVisiblePsyenceVariations(list7, 4);
    expect(res7.visibleVariations).toHaveLength(4);
    expect(res7.remainingCount).toBe(3);
    expect(res7.layoutType).toBe("overflow");
  });

  it("strictly preserves source-resolved variation order without reordering", () => {
    const ordered = [
      createMockVariation("alpha", 1),
      createMockVariation("beta", 2),
      createMockVariation("gamma", 3),
    ];
    const res = getVisiblePsyenceVariations(ordered, 4);
    expect(res.visibleVariations.map((v) => v.id)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });
});
