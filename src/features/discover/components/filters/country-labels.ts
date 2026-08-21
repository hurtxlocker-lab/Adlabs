/**
 * ISO country code → friendly label mapping for the Discover filter UI.
 *
 * Labels are display-only; URL/domain state always stores ISO codes.
 * Unknown codes fall back to the uppercased code.
 */

const COUNTRY_LABELS: Record<string, string> = {
  ES: "Spain",
  FR: "France",
  GB: "United Kingdom",
  DE: "Germany",
  IT: "Italy",
  NL: "Netherlands",
  BE: "Belgium",
  PT: "Portugal",
  SE: "Sweden",
  PL: "Poland",
  AT: "Austria",
  DK: "Denmark",
  FI: "Finland",
  NO: "Norway",
  CH: "Switzerland",
  US: "United States",
  BR: "Brazil",
  IN: "India",
  AU: "Australia",
  CA: "Canada",
  MX: "Mexico",
  AR: "Argentina",
  CL: "Chile",
  CO: "Colombia",
  ZA: "South Africa",
  NG: "Nigeria",
  JP: "Japan",
  KR: "South Korea",
  SG: "Singapore",
  TH: "Thailand",
  PH: "Philippines",
  ID: "Indonesia",
  MY: "Malaysia",
  AE: "UAE",
  SA: "Saudi Arabia",
  EG: "Egypt",
  TR: "Turkey",
  IL: "Israel",
};

export function countryLabel(code: string): string {
  return COUNTRY_LABELS[code.toUpperCase()] ?? code.toUpperCase();
}
