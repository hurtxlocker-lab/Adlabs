/**
 * Shared deterministic ISO country code to full English country name formatter.
 *
 * Uses standard `Intl.DisplayNames` with fallback mapping for non-standard or custom codes (e.g. UK -> GB).
 */

const COUNTRY_NAME_OVERRIDES: Record<string, string> = {
  UK: "United Kingdom",
  GB: "United Kingdom",
  US: "United States",
  USA: "United States",
  AE: "United Arab Emirates",
  UAE: "United Arab Emirates",
  KR: "South Korea",
  CZ: "Czech Republic",
};

let displayNamesInstance: Intl.DisplayNames | null = null;

function getDisplayNames(): Intl.DisplayNames | null {
  if (displayNamesInstance !== null) return displayNamesInstance;
  try {
    if (typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function") {
      displayNamesInstance = new Intl.DisplayNames(["en"], { type: "region" });
    }
  } catch {
    displayNamesInstance = null;
  }
  return displayNamesInstance;
}

/**
 * Formats an ISO country code into a friendly full English country name.
 * e.g., 'FR' -> 'France', 'DE' -> 'Germany', 'SE' -> 'Sweden', 'GB' -> 'United Kingdom', 'IN' -> 'India'.
 */
export function formatCountryName(code: string | null | undefined): string {
  if (!code) return "";
  const clean = code.trim().toUpperCase();
  if (!clean) return "";

  if (COUNTRY_NAME_OVERRIDES[clean]) {
    return COUNTRY_NAME_OVERRIDES[clean];
  }

  const dn = getDisplayNames();
  if (dn) {
    try {
      const name = dn.of(clean);
      if (name && name !== clean) {
        return name;
      }
    } catch {
      // Fallback
    }
  }

  return clean;
}

/**
 * Formats and deduplicates an array of ISO country codes into sorted full English country names.
 */
export function formatCountryNames(codes: (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const c of codes) {
    const formatted = formatCountryName(c);
    if (formatted) {
      set.add(formatted);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
