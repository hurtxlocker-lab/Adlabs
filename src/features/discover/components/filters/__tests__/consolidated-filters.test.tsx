import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CreativeFilterPopover,
  CreativeFilterContent,
} from "../creative-filter-popover";
import {
  GeographyFilterPopover,
  GeographyFilterContent,
} from "../geography-filter-popover";
import {
  EvidenceFilterPopover,
  EvidenceFilterContent,
} from "../evidence-filter-popover";
import type { DiscoveryFacetsResult } from "@/discovery/filters/types";

const mockFacets: DiscoveryFacetsResult = {
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
  brands: [{ brandId: "brand-1", brandName: "Evolv", brandSlug: "evolv", count: 21 }],
};

const noop = () => undefined;

describe("Consolidated Filter Popovers — Tests", () => {
  it("Creative dropdown contains both Format and Shape sections", () => {
    const popoverHtml = renderToStaticMarkup(
      <CreativeFilterPopover
        facets={mockFacets}
        filter={{}}
        onToggleFormat={noop}
        onToggleShape={noop}
      />,
    );
    expect(popoverHtml).toContain("Creative");

    const contentHtml = renderToStaticMarkup(
      <CreativeFilterContent
        facets={mockFacets}
        filter={{}}
        onToggleFormat={noop}
        onToggleShape={noop}
      />,
    );
    expect(contentHtml).toContain("Format");
    expect(contentHtml).toContain("Shape");
    expect(contentHtml).toContain("Video");
    expect(contentHtml).toContain("Image");
    expect(contentHtml).toContain("Portrait");
    expect(contentHtml).toContain("Square");
  });

  it("Creative dropdown trigger reflects single and compound active state", () => {
    const singleFormat = renderToStaticMarkup(
      <CreativeFilterPopover
        facets={mockFacets}
        filter={{ mediaTypes: ["VIDEO"] }}
        onToggleFormat={noop}
        onToggleShape={noop}
      />,
    );
    expect(singleFormat).toContain("Video");

    const compound = renderToStaticMarkup(
      <CreativeFilterPopover
        facets={mockFacets}
        filter={{ mediaTypes: ["VIDEO"], shapeFamilies: ["portrait"] }}
        onToggleFormat={noop}
        onToggleShape={noop}
      />,
    );
    expect(compound).toContain("Video · Portrait");

    const multi = renderToStaticMarkup(
      <CreativeFilterPopover
        facets={mockFacets}
        filter={{ mediaTypes: ["VIDEO", "IMAGE"], shapeFamilies: ["portrait"] }}
        onToggleFormat={noop}
        onToggleShape={noop}
      />,
    );
    expect(multi).toContain("Creative · 3");
  });

  it("Geography dropdown maintains distinct Reached and Targeted sections", () => {
    const popoverHtml = renderToStaticMarkup(
      <GeographyFilterPopover
        facets={mockFacets}
        filter={{ reachedCountries: ["FR"], targetCountries: ["ES"] }}
        onToggleReachedCountry={noop}
        onToggleTargetCountry={noop}
      />,
    );
    expect(popoverHtml).toContain("Geography · 2");

    const contentHtml = renderToStaticMarkup(
      <GeographyFilterContent
        facets={mockFacets}
        filter={{ reachedCountries: ["FR"], targetCountries: ["ES"] }}
        onToggleReachedCountry={noop}
        onToggleTargetCountry={noop}
      />,
    );
    expect(contentHtml).toContain("Reached Countries (Delivery)");
    expect(contentHtml).toContain("Targeted Countries (Declared)");
    expect(contentHtml).toContain("France");
    expect(contentHtml).toContain("Spain");
  });

  it("Evidence dropdown surfaces EU and UK transparency options", () => {
    const popoverHtml = renderToStaticMarkup(
      <EvidenceFilterPopover
        facets={mockFacets}
        filter={{ hasEuTransparencyEvidence: true }}
        onSetBoolean={noop}
        onSetRange={noop}
        onClearRange={noop}
      />,
    );
    expect(popoverHtml).toContain("EU Evidence");

    const contentHtml = renderToStaticMarkup(
      <EvidenceFilterContent
        facets={mockFacets}
        filter={{ hasEuTransparencyEvidence: true }}
        onSetBoolean={noop}
        onSetRange={noop}
        onClearRange={noop}
      />,
    );
    expect(contentHtml).toContain("European Union (EU)");
    expect(contentHtml).toContain("United Kingdom (UK)");
  });

  it("Category dropdown exposes Advertiser Page Category semantics and tooltip", async () => {
    const { CategoryFilterPopover } = await import("../category-filter-popover");
    const html = renderToStaticMarkup(
      <CategoryFilterPopover
        facets={mockFacets}
        filter={{ pageCategories: ["Apparel & clothing"] }}
        onToggleCategory={noop}
      />,
    );
    expect(html).toContain("Category: Apparel &amp; clothing");
    expect(html).toContain("Advertiser Page Category");
    expect(html).toContain("not a classification of this creative");
  });

  it("Brand dropdown exposes searchable brand multi-select on primary rail", async () => {
    const { BrandFilterPopover } = await import("../brand-filter-popover");
    const html = renderToStaticMarkup(
      <BrandFilterPopover
        facets={mockFacets}
        filter={{ brandIds: ["brand-1"] }}
        onToggleBrand={noop}
      />,
    );
    expect(html).toContain("Evolv");
  });
});
