/**
 * Deterministic copy-length calculation for discovery projection.
 *
 * Rules:
 *  - Combines primary text and headline.
 *  - Filters out null, undefined, and whitespace-only strings.
 *  - Joins non-empty parts with a single newline ("\n") and trims the result.
 *  - copy_length_chars = length of the normalized copy string.
 *  - copy_length_words = count of non-empty whitespace-delimited tokens.
 *  - Returns 0 for both if no copy is available (measured empty string, not an unknown provider metric).
 */
export function calculateCopyMetrics(
  primaryText?: string | null,
  headline?: string | null,
): { copyLengthChars: number; copyLengthWords: number; normalizedCopy: string } {
  const parts: string[] = [];

  if (primaryText && typeof primaryText === "string" && primaryText.trim().length > 0) {
    parts.push(primaryText.trim());
  }

  if (headline && typeof headline === "string" && headline.trim().length > 0) {
    parts.push(headline.trim());
  }

  const normalizedCopy = parts.join("\n").trim();

  if (normalizedCopy.length === 0) {
    return {
      copyLengthChars: 0,
      copyLengthWords: 0,
      normalizedCopy: "",
    };
  }

  const words = normalizedCopy.split(/\s+/).filter(Boolean);

  return {
    copyLengthChars: normalizedCopy.length,
    copyLengthWords: words.length,
    normalizedCopy,
  };
}
