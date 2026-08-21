/**
 * Filter band definitions + selection detection for the Discover filter UI.
 *
 * Presentation mapping only — the underlying domain state stays on the
 * existing DiscoveryFilterInput contract (min/max pairs) and is never replaced
 * by band keys in URL/domain state.
 */

import { CREATIVE_REUSE_BANDS } from "@/discovery/filters/bands";
import type { DiscoveryFilterInput } from "@/discovery/filters/types";

// ---------------------------------------------------------------------------
// Running time (longevity / persistence evidence)
// ---------------------------------------------------------------------------

export interface RunningBand {
  key: string;
  label: string;
  minDays: number | undefined;
  maxDays: number | undefined;
}

export const RUNNING_BANDS: RunningBand[] = [
  { key: "LT_7D", label: "< 7 days", minDays: undefined, maxDays: 7 },
  { key: "7_14D", label: "7–14 days", minDays: 7, maxDays: 14 },
  { key: "14_30D", label: "14–30 days", minDays: 14, maxDays: 30 },
  { key: "30_90D", label: "30–90 days", minDays: 30, maxDays: 90 },
  { key: "90_PLUS", label: "90+ days", minDays: 90, maxDays: undefined },
];

export function detectRunningBandKey(filter: DiscoveryFilterInput): string | null {
  const { runningMinDays, runningMaxDays } = filter;
  if (runningMinDays === undefined && runningMaxDays === undefined) return null;
  const band = RUNNING_BANDS.find(
    (b) => b.minDays === runningMinDays && b.maxDays === runningMaxDays,
  );
  return band?.key ?? null;
}

// ---------------------------------------------------------------------------
// Creative reuse — user-facing labels per locked product copy
// ---------------------------------------------------------------------------

export const REUSE_BAND_LABELS: Record<string, string> = {
  "1": "Used once",
  "2_3": "2–3 ads",
  "4_10": "4–10 ads",
  "11_PLUS": "11+ ads",
};

export function detectReuseBandKey(filter: DiscoveryFilterInput): string | null {
  const min = filter.exactCreativeReuseMin;
  const max = filter.exactCreativeReuseMax;
  if (min === undefined && max === undefined) return null;
  for (const band of CREATIVE_REUSE_BANDS) {
    const bMin = Number(band.min);
    const bMax = band.max === null ? undefined : Number(band.max) - 1;
    if (min === bMin && max === bMax) return band.key;
  }
  return null;
}
