/**
 * Formats a raw number into a compact string representation (e.g., 24.8K, 1.2M).
 */
export function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return num.toLocaleString();
}

/**
 * Formats milliseconds or seconds into a micro duration string `mm:ss` (e.g. 0:18, 1:45).
 * Returns null if duration is null, undefined, <= 0, or not a finite number.
 */
export function formatVideoDuration(durationMs?: number | null): string | null {
  if (durationMs === null || durationMs === undefined || durationMs <= 0 || !Number.isFinite(durationMs)) {
    return null;
  }

  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds <= 0) return null;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Formats exact creative reuse count for the gallery card marker.
 * Returns null if reuse count is less than 2 (never displays ×1).
 */
export function formatCreativeReuse(reuseCount?: number | null): {
  badge: string;
  label: string;
} | null {
  if (reuseCount === null || reuseCount === undefined || reuseCount < 2) {
    return null;
  }

  return {
    badge: `×${reuseCount}`,
    label: `Exact creative used across ${reuseCount} ads from this brand`,
  };
}
