/**
 * Deterministic standard advertising aspect ratio formatter.
 *
 * Maps pixel resolutions or raw aspect ratios to familiar advertising proportions:
 * - 4:5 (Portrait)
 * - 9:16 (Story / Reel / Full Vertical)
 * - 1:1 (Square)
 * - 16:9 (Landscape / Video)
 * - 1.91:1 (Meta Feed Landscape)
 * - 4:3 (Standard)
 *
 * Strictly avoids raw decimal ratios like 0.8:1 or 0.5625:1.
 */

export function formatCommonAspectRatio(
  width?: number | null,
  height?: number | null,
  ratioFloat?: number | null,
): string | null {
  let ratio = ratioFloat ?? null;
  if (ratio === null && width && height && height > 0) {
    ratio = width / height;
  }
  if (ratio === null || isNaN(ratio) || ratio <= 0) {
    return null;
  }

  // Check common industry aspect ratios with ±0.035 tolerance
  if (Math.abs(ratio - 0.8) <= 0.04) return "4:5";
  if (Math.abs(ratio - 9 / 16) <= 0.04) return "9:16";
  if (Math.abs(ratio - 1.0) <= 0.04) return "1:1";
  if (Math.abs(ratio - 16 / 9) <= 0.04) return "16:9";
  if (Math.abs(ratio - 1.91) <= 0.05) return "1.91:1";
  if (Math.abs(ratio - 4 / 3) <= 0.04) return "4:3";

  // If width and height are integers, try exact reduction
  if (width && height && width > 0 && height > 0) {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const d = gcd(Math.round(width), Math.round(height));
    const sw = Math.round(width) / d;
    const sh = Math.round(height) / d;
    if (sw <= 20 && sh <= 20) {
      return `${sw}:${sh}`;
    }
  }

  return `${ratio.toFixed(2)}:1`;
}
