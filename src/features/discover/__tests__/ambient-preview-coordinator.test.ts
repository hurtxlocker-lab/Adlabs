import { describe, expect, it } from "vitest";
import {
  isTimeInPreviewWindow,
  MAX_AMBIENT_PREVIEWS,
  PREVIEW_DURATION_SECONDS,
  selectActiveAmbientPreviews,
  shouldEnableAmbientPreview,
  type AmbientCandidate,
} from "../utils/ambient-preview-coordinator";

describe("Ambient Video Preview Coordinator", () => {
  it("enforces preview duration boundary of exactly 3.5 seconds", () => {
    expect(PREVIEW_DURATION_SECONDS).toBe(3.5);
    expect(isTimeInPreviewWindow(0)).toBe(true);
    expect(isTimeInPreviewWindow(1.75)).toBe(true);
    expect(isTimeInPreviewWindow(3.49)).toBe(true);
    expect(isTimeInPreviewWindow(3.5)).toBe(false);
    expect(isTimeInPreviewWindow(10)).toBe(false);
    expect(isTimeInPreviewWindow(-0.1)).toBe(false);
  });

  it("enforces max ambient concurrency cap of 3", () => {
    expect(MAX_AMBIENT_PREVIEWS).toBe(3);
  });

  it("determines ambient preview eligibility according to product policy", () => {
    // Normal desktop/mobile single video is eligible
    expect(shouldEnableAmbientPreview({})).toBe(true);

    // Reduced motion preference is excluded (hard no-autoplay signal)
    expect(shouldEnableAmbientPreview({ isReducedMotion: true })).toBe(false);

    // Multi-variation / Psyence items are excluded
    expect(shouldEnableAmbientPreview({ isDco: true })).toBe(false);
    expect(shouldEnableAmbientPreview({ isMultiVariation: true })).toBe(false);

    // Detail page is excluded
    expect(shouldEnableAmbientPreview({ isDetail: true })).toBe(false);
  });

  it("selects visible candidates with deterministic priority (focused > lead > DOM order)", () => {
    const candidates: AmbientCandidate[] = [
      {
        id: "cand-1",
        isFocused: false,
        isLead: false,
        domOrder: 0,
        isVisible: true,
      },
      {
        id: "cand-2",
        isFocused: false,
        isLead: false,
        domOrder: 1,
        isVisible: true,
      },
      {
        id: "cand-3",
        isFocused: false,
        isLead: false,
        domOrder: 2,
        isVisible: true,
      },
      {
        id: "cand-4",
        isFocused: false,
        isLead: true,
        domOrder: 3,
        isVisible: true,
      },
      {
        id: "cand-5",
        isFocused: true,
        isLead: false,
        domOrder: 4,
        isVisible: true,
      },
    ];

    const activeSet = selectActiveAmbientPreviews(candidates, 3);

    // Expect 3 items selected
    expect(activeSet.size).toBe(3);

    // 1. Focused item ("cand-5") MUST be included
    expect(activeSet.has("cand-5")).toBe(true);

    // 2. Lead role ("cand-4") MUST be included
    expect(activeSet.has("cand-4")).toBe(true);

    // 3. First DOM-order candidate ("cand-1") MUST be included
    expect(activeSet.has("cand-1")).toBe(true);

    // cand-2 and cand-3 should NOT be active due to cap of 3
    expect(activeSet.has("cand-2")).toBe(false);
    expect(activeSet.has("cand-3")).toBe(false);
  });

  it("excludes offscreen/invisible candidates from concurrency slots", () => {
    const candidates: AmbientCandidate[] = [
      {
        id: "offscreen-1",
        isFocused: false,
        isLead: true,
        domOrder: 0,
        isVisible: false,
      },
      {
        id: "onscreen-1",
        isFocused: false,
        isLead: false,
        domOrder: 1,
        isVisible: true,
      },
      {
        id: "onscreen-2",
        isFocused: false,
        isLead: false,
        domOrder: 2,
        isVisible: true,
      },
    ];

    const activeSet = selectActiveAmbientPreviews(candidates, 3);
    expect(activeSet.has("offscreen-1")).toBe(false);
    expect(activeSet.has("onscreen-1")).toBe(true);
    expect(activeSet.has("onscreen-2")).toBe(true);
  });

  it("strictly limits preview grants to <=3 across large candidate sets (e.g. 60 cards)", () => {
    const largeCandidateSet: AmbientCandidate[] = Array.from({ length: 60 }, (_, i) => ({
      id: `card-${i}`,
      isFocused: i === 42,
      isLead: i === 40,
      domOrder: i,
      isVisible: i >= 40 && i <= 50, // 11 visible cards in viewport
    }));

    const activeSet = selectActiveAmbientPreviews(largeCandidateSet, 3);

    expect(activeSet.size).toBe(3);
    // Focused card-42 MUST have a slot
    expect(activeSet.has("card-42")).toBe(true);
    // Lead card-40 MUST have a slot
    expect(activeSet.has("card-40")).toBe(true);
    // Next DOM visible card-41 MUST have a slot
    expect(activeSet.has("card-41")).toBe(true);

    // Remaining visible cards (43..50) MUST NOT be granted
    for (let i = 43; i <= 50; i++) {
      expect(activeSet.has(`card-${i}`)).toBe(false);
    }
  });
});
