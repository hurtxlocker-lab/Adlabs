import { describe, expect, it } from "vitest";
import { calculateCopyMetrics } from "../copy-metrics";

describe("Copy Metrics Calculation", () => {
  it("calculates characters and words for combined primary text and headline", () => {
    const metrics = calculateCopyMetrics(
      "Experience bone conduction audio.",
      "Special Limited Offer",
    );

    // "Experience bone conduction audio.\nSpecial Limited Offer"
    expect(metrics.normalizedCopy).toBe(
      "Experience bone conduction audio.\nSpecial Limited Offer",
    );
    expect(metrics.copyLengthChars).toBe(55);
    expect(metrics.copyLengthWords).toBe(7);
  });

  it("handles null/undefined/empty parts gracefully", () => {
    const headlineOnly = calculateCopyMetrics(null, "Just Headline");
    expect(headlineOnly.normalizedCopy).toBe("Just Headline");
    expect(headlineOnly.copyLengthChars).toBe(13);
    expect(headlineOnly.copyLengthWords).toBe(2);

    const bodyOnly = calculateCopyMetrics("Just Body Text", undefined);
    expect(bodyOnly.normalizedCopy).toBe("Just Body Text");
    expect(bodyOnly.copyLengthChars).toBe(14);
    expect(bodyOnly.copyLengthWords).toBe(3);

    const empty = calculateCopyMetrics("   ", "   ");
    expect(empty.normalizedCopy).toBe("");
    expect(empty.copyLengthChars).toBe(0);
    expect(empty.copyLengthWords).toBe(0);
  });

  it("collapses multiple internal whitespaces for word counts", () => {
    const result = calculateCopyMetrics(
      "Word1   Word2\tWord3\n\nWord4",
      "Word5   Word6",
    );
    expect(result.copyLengthWords).toBe(6);
  });
});
