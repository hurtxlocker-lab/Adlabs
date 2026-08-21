import { describe, expect, it } from "vitest";
import {
  isItemCompatibleWithSlot,
  getItemPreferenceRank,
  assignCreativesToSlots,
  SLOT_ASSIGNMENT_ORDER,
} from "@/features/discover/utils/seed-assignment";
import { PACKED_FIELD_TEMPLATE_V1 } from "@/features/discover/templates/packed-field-v1";
import {
  getSlotPreferredWidthCss,
  SLOT_MAX_HEIGHT_PX,
} from "@/features/discover/components/packed-field/packed-slot-card";
import type { AdLibraryItem } from "@/features/ad-library/types";

function createMockItem(id: string, width: number, height: number): AdLibraryItem {
  return {
    id,
    source: "meta",
    sourceAdId: `src-${id}`,
    brand: {
      id: `brand-${id}`,
      name: `Brand ${id}`,
      slug: `brand-${id}`,
    },
    displayFormat: "VIDEO",
    primaryText: "Primary text",
    headline: "Headline",
    description: null,
    ctaText: "Shop Now",
    ctaType: "SHOP_NOW",
    destinationUrl: "https://example.com",
    publisherPlatforms: ["facebook", "instagram"],
    isActiveObserved: true,
    firstSeenAt: new Date("2026-08-16T10:00:00.000Z"),
    lastSeenAt: new Date("2026-08-16T10:00:00.000Z"),
    adLibraryUrl: `https://facebook.com/ads/${id}`,
    media: [
      {
        id: `media-${id}`,
        mediaType: "VIDEO",
        role: "primary",
        position: 0,
        mimeType: "video/mp4",
        mediaUrl: `https://media.test.internal/${id}`,
        width,
        height,
      },
    ],
    sourceCards: [],
    variations: [],
    cards: [],
  };
}

describe("Packed Field v1.1 - Shape-Compatible Assignment & Directed Placement", () => {
  const portrait916 = createMockItem("p-9-16", 720, 1280); // ratio = 0.5625
  const portrait45 = createMockItem("p-4-5", 720, 900);    // ratio = 0.800 (balanced < 1.0)
  const square11 = createMockItem("sq-1-1", 720, 720);     // ratio = 1.000 (true square)
  const landscape169 = createMockItem("ls-16-9", 1280, 720); // ratio = 1.7778
  const wide219 = createMockItem("w-21-9", 1200, 500);     // ratio = 2.400

  const slotMap = new Map(PACKED_FIELD_TEMPLATE_V1.map((s) => [s.id, s]));

  describe("1. Strict Slot Eligibility Hard Gates", () => {
    it("Slot H (Horizontal Anchor) accepts only landscape and wide, strictly rejecting square and portrait", () => {
      const slotH = slotMap.get("H")!;
      expect(isItemCompatibleWithSlot(landscape169, slotH)).toBe(true);
      expect(isItemCompatibleWithSlot(wide219, slotH)).toBe(true);
      expect(isItemCompatibleWithSlot(square11, slotH)).toBe(false);
      expect(isItemCompatibleWithSlot(portrait45, slotH)).toBe(false);
      expect(isItemCompatibleWithSlot(portrait916, slotH)).toBe(false);
    });

    it("Slot C (Vertical Counterweight) accepts portrait and ratio < 1.0, strictly rejecting 1:1 square, landscape, and wide", () => {
      const slotC = slotMap.get("C")!;
      expect(isItemCompatibleWithSlot(portrait916, slotC)).toBe(true);
      expect(isItemCompatibleWithSlot(portrait45, slotC)).toBe(true); // 4:5 ratio 0.80 < 1.0
      expect(isItemCompatibleWithSlot(square11, slotC)).toBe(false); // 1:1 ratio 1.0 is invalid
      expect(isItemCompatibleWithSlot(landscape169, slotC)).toBe(false);
      expect(isItemCompatibleWithSlot(wide219, slotC)).toBe(false);
    });

    it("Slot D (Left Vertical Mass) accepts portrait and ratio <= 0.90, strictly rejecting 1:1 square, landscape, and wide", () => {
      const slotD = slotMap.get("D")!;
      expect(isItemCompatibleWithSlot(portrait916, slotD)).toBe(true);
      expect(isItemCompatibleWithSlot(portrait45, slotD)).toBe(true); // 0.80 <= 0.90
      expect(isItemCompatibleWithSlot(square11, slotD)).toBe(false);
      expect(isItemCompatibleWithSlot(landscape169, slotD)).toBe(false);
      expect(isItemCompatibleWithSlot(wide219, slotD)).toBe(false);
    });

    it("Slot E (Central Flex Mass) accepts square, portrait, and landscape", () => {
      const slotE = slotMap.get("E")!;
      expect(isItemCompatibleWithSlot(square11, slotE)).toBe(true);
      expect(isItemCompatibleWithSlot(portrait916, slotE)).toBe(true);
      expect(isItemCompatibleWithSlot(landscape169, slotE)).toBe(true);
    });

    it("Slot A (Punctuation) accepts square and portrait, strictly rejecting landscape and wide", () => {
      const slotA = slotMap.get("A")!;
      expect(isItemCompatibleWithSlot(square11, slotA)).toBe(true);
      expect(isItemCompatibleWithSlot(portrait916, slotA)).toBe(true);
      expect(isItemCompatibleWithSlot(landscape169, slotA)).toBe(false);
      expect(isItemCompatibleWithSlot(wide219, slotA)).toBe(false);
    });

    it("Slot F (East Support Band) accepts only landscape and wide, rejecting portrait and square", () => {
      const slotF = slotMap.get("F")!;
      expect(isItemCompatibleWithSlot(landscape169, slotF)).toBe(true);
      expect(isItemCompatibleWithSlot(wide219, slotF)).toBe(true);
      expect(isItemCompatibleWithSlot(square11, slotF)).toBe(false);
      expect(isItemCompatibleWithSlot(portrait916, slotF)).toBe(false);
    });

    it("Slot B (Balanced South-Central Support) accepts square and landscape", () => {
      const slotB = slotMap.get("B")!;
      expect(isItemCompatibleWithSlot(square11, slotB)).toBe(true);
      expect(isItemCompatibleWithSlot(landscape169, slotB)).toBe(true);
      expect(isItemCompatibleWithSlot(portrait916, slotB)).toBe(false);
    });

    it("Slot G (Closing Horizontal Mass) accepts only landscape and wide, rejecting portrait and square", () => {
      const slotG = slotMap.get("G")!;
      expect(isItemCompatibleWithSlot(landscape169, slotG)).toBe(true);
      expect(isItemCompatibleWithSlot(wide219, slotG)).toBe(true);
      expect(isItemCompatibleWithSlot(square11, slotG)).toBe(false);
      expect(isItemCompatibleWithSlot(portrait916, slotG)).toBe(false);
    });
  });

  describe("2. Architectural Processing Priority & Determinism", () => {
    it("defines architectural priority order: H -> C -> D -> G -> F -> E -> B -> A", () => {
      expect(SLOT_ASSIGNMENT_ORDER).toEqual(["H", "C", "D", "G", "F", "E", "B", "A"]);
    });

    it("ranks candidates according to preferred matching order", () => {
      const slotH = slotMap.get("H")!;
      expect(getItemPreferenceRank(wide219, slotH)).toBeLessThan(getItemPreferenceRank(landscape169, slotH));

      const slotE = slotMap.get("E")!;
      expect(getItemPreferenceRank(square11, slotE)).toBeLessThan(getItemPreferenceRank(portrait916, slotE));
      expect(getItemPreferenceRank(portrait916, slotE)).toBeLessThan(getItemPreferenceRank(landscape169, slotE));
    });

    it("leaves slot empty when no compatible creative is available in the pool", () => {
      // Only square items provided -> slots H, F, G (which require landscape/wide) must remain null
      const squarePool = [createMockItem("sq1", 720, 720), createMockItem("sq2", 720, 720)];
      const result = assignCreativesToSlots(squarePool, PACKED_FIELD_TEMPLATE_V1);

      const hAssignment = result.assignments.find((a) => a.slot.id === "H")!;
      expect(hAssignment.item).toBeNull();

      const fAssignment = result.assignments.find((a) => a.slot.id === "F")!;
      expect(fAssignment.item).toBeNull();
    });
  });

  describe("3. Directed Artifact Placement Mappings", () => {
    it("maps all 8 slots to exact directed placement alignments", () => {
      expect(slotMap.get("H")!.alignment).toEqual({ horizontal: "start", vertical: "end" }); // bottom-left
      expect(slotMap.get("C")!.alignment).toEqual({ horizontal: "end", vertical: "end" }); // bottom-right
      expect(slotMap.get("D")!.alignment).toEqual({ horizontal: "start", vertical: "start" }); // top-left
      expect(slotMap.get("E")!.alignment).toEqual({ horizontal: "end", vertical: "start" }); // top-right
      expect(slotMap.get("A")!.alignment).toEqual({ horizontal: "center", vertical: "center" }); // center
      expect(slotMap.get("F")!.alignment).toEqual({ horizontal: "end", vertical: "start" }); // top-right
      expect(slotMap.get("B")!.alignment).toEqual({ horizontal: "start", vertical: "end" }); // bottom-left
      expect(slotMap.get("G")!.alignment).toEqual({ horizontal: "end", vertical: "end" }); // bottom-right
    });
  });

  describe("4. Media Sizing Token Matrix & Max Heights", () => {
    it("defines correct preferred width token for each slot and shape family", () => {
      expect(getSlotPreferredWidthCss("H", "landscape", 1.778)).toBe("clamp(620px, 52vw, 900px)");
      expect(getSlotPreferredWidthCss("C", "portrait", 0.563)).toBe("clamp(240px, 20vw, 320px)");
      expect(getSlotPreferredWidthCss("D", "portrait", 0.563)).toBe("clamp(260px, 22vw, 340px)");
      expect(getSlotPreferredWidthCss("E", "square", 1.0)).toBe("clamp(360px, 32vw, 480px)");
      expect(getSlotPreferredWidthCss("A", "square", 1.0)).toBe("clamp(150px, 14vw, 220px)");
      expect(getSlotPreferredWidthCss("F", "landscape", 1.778)).toBe("clamp(380px, 34vw, 520px)");
      expect(getSlotPreferredWidthCss("B", "square", 1.0)).toBe("clamp(340px, 30vw, 460px)");
      expect(getSlotPreferredWidthCss("G", "landscape", 1.778)).toBe("clamp(420px, 38vw, 580px)");
    });

    it("defines exact slot max heights", () => {
      expect(SLOT_MAX_HEIGHT_PX).toEqual({
        H: 460,
        C: 460,
        D: 620,
        E: 420,
        A: 220,
        F: 320,
        B: 360,
        G: 340,
      });
    });
  });
});
