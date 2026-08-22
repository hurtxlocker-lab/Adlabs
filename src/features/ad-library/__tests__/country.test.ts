import { describe, expect, it } from "vitest";
import { formatCountryName, formatCountryNames } from "../utils/country";

describe("Country Name Formatter", () => {
  it("formats ISO country codes into full English names", () => {
    expect(formatCountryName("FR")).toBe("France");
    expect(formatCountryName("DE")).toBe("Germany");
    expect(formatCountryName("ES")).toBe("Spain");
    expect(formatCountryName("SE")).toBe("Sweden");
    expect(formatCountryName("GB")).toBe("United Kingdom");
    expect(formatCountryName("UK")).toBe("United Kingdom");
    expect(formatCountryName("US")).toBe("United States");
    expect(formatCountryName("IN")).toBe("India");
    expect(formatCountryName("IT")).toBe("Italy");
    expect(formatCountryName("NL")).toBe("Netherlands");
    expect(formatCountryName("BE")).toBe("Belgium");
    expect(formatCountryName("PT")).toBe("Portugal");
    expect(formatCountryName("AT")).toBe("Austria");
    expect(formatCountryName("DK")).toBe("Denmark");
    expect(formatCountryName("FI")).toBe("Finland");
    expect(formatCountryName("NO")).toBe("Norway");
    expect(formatCountryName("CH")).toBe("Switzerland");
    expect(formatCountryName("BR")).toBe("Brazil");
    expect(formatCountryName("AU")).toBe("Australia");
    expect(formatCountryName("CA")).toBe("Canada");
  });

  it("handles lowercase, whitespace, and null/undefined safely", () => {
    expect(formatCountryName(" fr ")).toBe("France");
    expect(formatCountryName("de")).toBe("Germany");
    expect(formatCountryName("")).toBe("");
    expect(formatCountryName(null)).toBe("");
    expect(formatCountryName(undefined)).toBe("");
  });

  it("formats and deduplicates country arrays with sorted alphabetical order", () => {
    const list = ["ES", "FR", "DE", "FR", "SE"];
    const formatted = formatCountryNames(list);
    expect(formatted).toEqual(["France", "Germany", "Spain", "Sweden"]);
  });
});
