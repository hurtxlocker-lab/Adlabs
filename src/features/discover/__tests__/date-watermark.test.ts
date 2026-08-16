import { describe, expect, it } from "vitest";
import { formatDateWatermark } from "../utils/date-watermark";

describe("Date Watermark Formatting", () => {
  it("formats date in the current calendar year as 'D MMM' (e.g. '16 AUG')", () => {
    const d1 = new Date("2026-08-16T12:00:00.000Z");
    expect(formatDateWatermark(d1, 2026)).toBe("16 AUG");

    const d2 = new Date("2026-01-05T00:00:00.000Z");
    expect(formatDateWatermark(d2, 2026)).toBe("5 JAN");

    const d3 = new Date("2026-12-31T23:59:59.000Z");
    expect(formatDateWatermark(d3, 2026)).toBe("31 DEC");
  });

  it("formats date from a different calendar year as 'D MMM \\'YY' (e.g. '16 AUG \\'25')", () => {
    const d1 = new Date("2025-08-16T12:00:00.000Z");
    expect(formatDateWatermark(d1, 2026)).toBe("16 AUG '25");

    const d2 = new Date("2024-03-09T00:00:00.000Z");
    expect(formatDateWatermark(d2, 2026)).toBe("9 MAR '24");
  });

  it("returns null on null, undefined, empty, or invalid date values", () => {
    expect(formatDateWatermark(null)).toBeNull();
    expect(formatDateWatermark(undefined)).toBeNull();
    expect(formatDateWatermark("not-a-date")).toBeNull();
  });
});
