import { describe, expect, it, vi } from "vitest";
import {
  clampCardIndex,
  getActiveDcoCardState,
  getNextCardIndex,
  getPrevCardIndex,
} from "../utils/dco-traversal";
import {
  notifyDiscoverVideoPlay,
  subscribeDiscoverVideoPlay,
} from "../utils/video-coordinator";
import type { AdLibraryCardItem } from "@/features/ad-library/types";

describe("DCO Traversal and Synchronization Helpers", () => {
  it("computes next card index with cyclic wrap-around", () => {
    expect(getNextCardIndex(0, 3)).toBe(1);
    expect(getNextCardIndex(1, 3)).toBe(2);
    expect(getNextCardIndex(2, 3)).toBe(0);
    expect(getNextCardIndex(0, 1)).toBe(0);
    expect(getNextCardIndex(0, 0)).toBe(0);
  });

  it("computes previous card index with cyclic wrap-around", () => {
    expect(getPrevCardIndex(0, 3)).toBe(2);
    expect(getPrevCardIndex(2, 3)).toBe(1);
    expect(getPrevCardIndex(1, 3)).toBe(0);
    expect(getPrevCardIndex(0, 1)).toBe(0);
    expect(getPrevCardIndex(0, 0)).toBe(0);
  });

  it("clamps card index safely within valid boundaries", () => {
    expect(clampCardIndex(-2, 4)).toBe(0);
    expect(clampCardIndex(0, 4)).toBe(0);
    expect(clampCardIndex(2, 4)).toBe(2);
    expect(clampCardIndex(3, 4)).toBe(3);
    expect(clampCardIndex(10, 4)).toBe(3);
    expect(clampCardIndex(0, 0)).toBe(0);
  });

  it("synchronizes active card text and metadata with parent fallbacks", () => {
    const mockCards: AdLibraryCardItem[] = [
      {
        id: "card-1",
        position: 1,
        headline: "Card 1 Headline",
        body: "Card 1 Body",
        description: "Card 1 Desc",
        ctaText: "Shop Now",
        ctaType: "SHOP_NOW",
        destinationUrl: "https://example.com/1",
        media: [],
      },
      {
        id: "card-2",
        position: 2,
        headline: null,
        body: null,
        description: null,
        ctaText: null,
        ctaType: null,
        destinationUrl: null,
        media: [],
      },
    ];

    // Card 1 has explicit values
    const state1 = getActiveDcoCardState(
      mockCards,
      0,
      "Parent Headline",
      "Parent Body",
      "Parent CTA",
    );
    expect(state1.index).toBe(0);
    expect(state1.position).toBe(1);
    expect(state1.total).toBe(2);
    expect(state1.headline).toBe("Card 1 Headline");
    expect(state1.body).toBe("Card 1 Body");
    expect(state1.ctaText).toBe("Shop Now");
    expect(state1.destinationUrl).toBe("https://example.com/1");

    // Card 2 falls back to parent values
    const state2 = getActiveDcoCardState(
      mockCards,
      1,
      "Parent Headline",
      "Parent Body",
      "Parent CTA",
    );
    expect(state2.index).toBe(1);
    expect(state2.position).toBe(2);
    expect(state2.total).toBe(2);
    expect(state2.headline).toBe("Parent Headline");
    expect(state2.body).toBe("Parent Body");
    expect(state2.ctaText).toBe("Parent CTA");
  });

  it("handles empty cards gracefully", () => {
    const state = getActiveDcoCardState(
      [],
      0,
      "Parent Headline",
      "Parent Body",
      "Parent CTA",
    );
    expect(state.card).toBeUndefined();
    expect(state.total).toBe(0);
    expect(state.headline).toBe("Parent Headline");
    expect(state.body).toBe("Parent Body");
    expect(state.ctaText).toBe("Parent CTA");
  });
});

describe("Discover Video Coordinator", () => {
  it("notifies and triggers callback when a different video starts playing", () => {
    const onOtherPlay = vi.fn();
    const unsubscribe = subscribeDiscoverVideoPlay("video-a", onOtherPlay);

    // Another video starts playing
    notifyDiscoverVideoPlay("video-b");
    expect(onOtherPlay).toHaveBeenCalledTimes(1);

    // Same video notifies playing -> should not trigger callback
    notifyDiscoverVideoPlay("video-a");
    expect(onOtherPlay).toHaveBeenCalledTimes(1);

    // Clean up
    unsubscribe();
    notifyDiscoverVideoPlay("video-c");
    expect(onOtherPlay).toHaveBeenCalledTimes(1);
  });
});
