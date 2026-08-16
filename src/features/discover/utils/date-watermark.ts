const SHORT_MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

/**
 * Formats a factual first-seen date into an archival watermark annotation.
 * Uses UTC date values to ensure deterministic, locale-stable display across client timezones.
 *
 * Rules:
 * - Current calendar year (e.g. 2026): "16 AUG"
 * - Different calendar year (e.g. 2025): "16 AUG '25"
 * - Invariant: uppercase short month, day of month, stable non-relative.
 * - Missing/invalid date: returns null (no watermark rendered).
 *
 * @param date Factual Date, timestamp, or ISO string.
 * @param currentYear Current reference year (defaults to active UTC calendar year).
 * @returns Formatted watermark string or null.
 */
export function formatDateWatermark(
  date: Date | string | number | null | undefined,
  currentYear = new Date().getUTCFullYear(),
): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;

  const day = d.getUTCDate();
  const month = SHORT_MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();

  if (year === currentYear) {
    return `${day} ${month}`;
  }

  const shortYear = String(year).slice(-2);
  return `${day} ${month} '${shortYear}`;
}
