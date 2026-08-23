import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  DiscoveryFacetsResult,
  DiscoveryFilterInput,
} from "@/discovery/filters/types";
import { CheckboxGroupFilter } from "../checkbox-group-filter";
import { TransparencyFilter } from "../transparency-filter";
import { MoreFiltersContent } from "../more-filters";
import { deriveActiveTokens } from "../tokens";
import { detectRunningBandKey, detectReuseBandKey } from "../bands";

// ---------------------------------------------------------------------------
// Mock facet data (matches current DEV-corpus evidence shape)
// ---------------------------------------------------------------------------

export const mockFacets: DiscoveryFacetsResult = {
  mediaTypes: [
    { value: "VIDEO", count: 40 },
    { value: "IMAGE", count: 31 },
  ],
  shapeFamilies: [
    { value: "portrait", count: 38 },
    { value: "square", count: 24 },
    { value: "landscape", count: 7 },
    { value: "wide", count: 2 },
  ],
  ctaTypes: [
    { value: "SHOP_NOW", count: 52 },
    { value: "LEARN_MORE", count: 9 },
  ],
  publisherPlatforms: [
    { value: "INSTAGRAM", count: 71 },
    { value: "FACEBOOK", count: 68 },
  ],
  pageCategories: [{ value: "Apparel & clothing", count: 21 }],
  targetCountries: [
    { value: "FR", count: 11 },
    { value: "ES", count: 8 },
  ],
  reachedCountries: [
    { value: "FR", count: 11 },
    { value: "ES", count: 8 },
  ],
  transparencyEvidence: {
    EU: { true: 19, false: 52 },
    UK: { true: 3, false: 68 },
    BR: { true: 0, false: 71 },
  },
  euReachBands: [
    { key: "LT_1K", label: "< 1K", count: 3 },
    { key: "1K_10K", label: "1K–10K", count: 5 },
    { key: "10K_50K", label: "10K–50K", count: 6 },
    { key: "50K_100K", label: "50K–100K", count: 3 },
    { key: "100K_PLUS", label: "100K+", count: 2 },
  ],
  creativeReuseBands: [
    { key: "1", label: "1", count: 35 },
    { key: "2_3", label: "2–3", count: 22 },
    { key: "4_10", label: "4–10", count: 14 },
    { key: "11_PLUS", label: "11+", count: 0 },
  ],
  instagramFollowerBands: [
    { key: "LT_10K", label: "< 10K", count: 0 },
    { key: "10K_50K", label: "10K–50K", count: 21 },
    { key: "50K_100K", label: "50K–100K", count: 11 },
    { key: "100K_500K", label: "100K–500K", count: 12 },
    { key: "500K_PLUS", label: "500K+", count: 0 },
  ],
  brands: [{ brandId: "brand-1", brandName: "Evolv", count: 21 }],
};

const noop = () => undefined;

// ---------------------------------------------------------------------------
// Accessibility semantics
// ---------------------------------------------------------------------------

describe("CheckboxGroupFilter — multi-select semantics", () => {
  it("renders a labelled group with real checkbox inputs", () => {
    const html = renderToStaticMarkup(
      <CheckboxGroupFilter
        id="format-filter"
        label="Format"
        options={[
          { value: "VIDEO", label: "Video", count: 40 },
          { value: "IMAGE", label: "Image", count: 31 },
        ]}
        selected={["VIDEO"]}
        onToggle={noop}
      />,
    );
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-labelledby="format-filter"');
    expect(html).toContain('id="format-filter"');
    expect(html).toContain('type="checkbox"');
    // One checked, one unchecked
    const checkedCount = (html.match(/checked=""/g) ?? []).length;
    expect(checkedCount).toBe(1);
    // Counts visible
    expect(html).toContain("40");
    expect(html).toContain("31");
  });

  it("marks selected options checked", () => {
    const html = renderToStaticMarkup(
      <CheckboxGroupFilter
        id="shape-filter"
        label="Shape"
        options={[{ value: "portrait", label: "Portrait" }]}
        selected={["portrait"]}
        onToggle={noop}
      />,
    );
    expect(html).toContain('checked=""');
  });
});

describe("TransparencyFilter — boolean semantics", () => {
  it("renders the EU toggle with checked state", () => {
    const html = renderToStaticMarkup(
      <TransparencyFilter
        euSelected
        euCount={19}
        showEuReach={false}
        euReachOptions={[]}
        euReachSelectedKey={null}
        onEuToggle={noop}
        onEuReachSelect={noop}
      />,
    );
    expect(html).toContain("Transparency");
    expect(html).toContain("EU");
  });

  it("exposes EU reach bands only when contextual condition holds", () => {
    const html = renderToStaticMarkup(
      <TransparencyFilter
        euSelected={false}
        euCount={0}
        showEuReach
        euReachOptions={[{ key: "10K_50K", label: "10K–50K" }]}
        euReachSelectedKey={null}
        onEuToggle={noop}
        onEuReachSelect={noop}
      />,
    );
    expect(html).toContain("EU reach");
    // Assert the native select control is present for the contextual dimension.
    expect(html).toContain('id="eu-reach"');
    expect(html).toContain("<select");
  });
});

// ---------------------------------------------------------------------------
// More Filters — facet-driven visibility
// ---------------------------------------------------------------------------

describe("MoreFiltersContent — facet-driven visibility", () => {
  const baseProps = {
    facets: mockFacets,
    filter: {} as DiscoveryFilterInput,
    onSetStringArray: noop,
    onSetBoolean: noop,
    onSetRange: noop,
    onClearRange: noop,
  };

  it("renders Creative group with CTA and Reuse options when facet coverage exists", () => {
    const html = renderToStaticMarkup(<MoreFiltersContent {...baseProps} />);
    expect(html).toContain("Creative");
    expect(html).toContain("SHOP_NOW");
    expect(html).toContain("LEARN_MORE");
    expect(html).toContain("Exact creative reuse");
  });

  it("renders Account group with IG followers", () => {
    const html = renderToStaticMarkup(<MoreFiltersContent {...baseProps} />);
    expect(html).toContain("Account");
    expect(html).toContain("IG followers");
  });

  it("renders Delivery group with Target country", () => {
    const html = renderToStaticMarkup(<MoreFiltersContent {...baseProps} />);
    expect(html).toContain("Delivery");
    expect(html).toContain("Target country");
  });

  it("renders Evidence group with UK evidence (secondary)", () => {
    const html = renderToStaticMarkup(<MoreFiltersContent {...baseProps} />);
    expect(html).toContain("Evidence");
    expect(html).toContain("UK transparency");
  });

  it("never surfaces BR while zero evidence exists", () => {
    const html = renderToStaticMarkup(<MoreFiltersContent {...baseProps} />);
    expect(html).not.toContain("BR evidence");
    expect(html).not.toContain("Brazil");
  });

  it("never surfaces target gender (UNKNOWN/sparse evidence)", () => {
    const html = renderToStaticMarkup(<MoreFiltersContent {...baseProps} />);
    expect(html.toLowerCase()).not.toContain("gender");
  });

  it("never surfaces FB likes merely because the contract supports it", () => {
    const html = renderToStaticMarkup(<MoreFiltersContent {...baseProps} />);
    expect(html.toLowerCase()).not.toContain("fb likes");
    expect(html.toLowerCase()).not.toContain("facebook likes");
  });

  it("hides Evidence group entirely when UK count is zero and nothing selected", () => {
    const facets: DiscoveryFacetsResult = {
      ...mockFacets,
      transparencyEvidence: {
        EU: { true: 0, false: 71 },
        UK: { true: 0, false: 71 },
        BR: { true: 0, false: 71 },
      },
    };
    const html = renderToStaticMarkup(
      <MoreFiltersContent {...baseProps} facets={facets} />,
    );
    expect(html).not.toContain("Evidence");
  });
});

// ---------------------------------------------------------------------------
// Active filter tokens
// ---------------------------------------------------------------------------

describe("deriveActiveTokens", () => {
  it("derives tokens from the URL-derived filter state", () => {
    const filter: DiscoveryFilterInput = {
      mediaTypes: ["VIDEO"],
      shapeFamilies: ["portrait"],
      reachedCountries: ["FR"],
      runningMinDays: 30,
      runningMaxDays: 90,
      exactCreativeReuseMin: 4,
      exactCreativeReuseMax: 10,
      hasEuTransparencyEvidence: true,
      euReachMin: 10000,
      euReachMax: 50000,
      ctaTypes: ["SHOP_NOW"],
      pageCategories: ["Apparel & clothing"],
      targetCountries: ["ES", "GB"],
    };
    const handlers = {
      toggleStringArray: noop,
      toggleBoolean: noop,
      clearRange: noop,
      clearSingle: noop,
    };
    const tokens = deriveActiveTokens(filter, mockFacets, handlers);
    const labels = tokens.map((t) => t.label);
    expect(labels).toContain("Video");
    expect(labels).toContain("Portrait");
    expect(labels).toContain("France");
    expect(labels).toContain("Running 30–90 days");
    expect(labels).toContain("Reuse 4–10 ads");
    expect(labels).toContain("EU evidence");
    expect(labels).toContain("EU reach 10K–50K");
    expect(labels).toContain("Shop now");
    expect(labels).toContain("Category: Apparel & clothing");
    expect(labels).toContain("Spain");
    expect(labels).toContain("United Kingdom");
    expect(tokens.length).toBe(11);
  });

  it("produces removable tokens for CTA, Page category, and Target country and triggers correct removal handlers", () => {
    const toggledCalls: Array<[string, string]> = [];
    const handlers = {
      toggleStringArray: (key: keyof DiscoveryFilterInput, val: string) => {
        toggledCalls.push([key, val]);
      },
      toggleBoolean: noop,
      clearRange: noop,
      clearSingle: noop,
    };

    const filter: DiscoveryFilterInput = {
      ctaTypes: ["SHOP_NOW", "LEARN_MORE"],
      pageCategories: ["Apparel & clothing"],
      targetCountries: ["FR"],
    };

    const tokens = deriveActiveTokens(filter, mockFacets, handlers);
    expect(tokens).toHaveLength(4);

    const ctaToken = tokens.find((t) => t.label === "Shop now");
    expect(ctaToken).toBeDefined();
    ctaToken?.onRemove();
    expect(toggledCalls).toContainEqual(["ctaTypes", "SHOP_NOW"]);

    const ctaToken2 = tokens.find((t) => t.label === "Learn more");
    expect(ctaToken2).toBeDefined();
    ctaToken2?.onRemove();
    expect(toggledCalls).toContainEqual(["ctaTypes", "LEARN_MORE"]);

    const pcToken = tokens.find((t) => t.label === "Category: Apparel & clothing");
    expect(pcToken).toBeDefined();
    pcToken?.onRemove();
    expect(toggledCalls).toContainEqual(["pageCategories", "Apparel & clothing"]);

    const tcToken = tokens.find((t) => t.label === "France");
    expect(tcToken).toBeDefined();
    tcToken?.onRemove();
    expect(toggledCalls).toContainEqual(["targetCountries", "FR"]);
  });

  it("returns no tokens for an empty filter", () => {
    const tokens = deriveActiveTokens({}, mockFacets, {
      toggleStringArray: noop,
      toggleBoolean: noop,
      clearRange: noop,
      clearSingle: noop,
    });
    expect(tokens).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Band detection
// ---------------------------------------------------------------------------

describe("band detection helpers", () => {
  it("detects running band LT_7D", () => {
    expect(detectRunningBandKey({ runningMaxDays: 7 })).toBe("LT_7D");
  });

  it("detects running band 30_90D", () => {
    expect(
      detectRunningBandKey({ runningMinDays: 30, runningMaxDays: 90 }),
    ).toBe("30_90D");
  });

  it("returns null for no running filter", () => {
    expect(detectRunningBandKey({})).toBeNull();
  });

  it("detects reuse band 2_3", () => {
    expect(
      detectReuseBandKey({ exactCreativeReuseMin: 2, exactCreativeReuseMax: 3 }),
    ).toBe("2_3");
  });

  it("detects reuse band 11_PLUS", () => {
    expect(detectReuseBandKey({ exactCreativeReuseMin: 11 })).toBe("11_PLUS");
  });

  it("returns null for no reuse filter", () => {
    expect(detectReuseBandKey({})).toBeNull();
  });
});
