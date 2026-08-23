import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NativePopover } from "../native-popover";
import { SortControl } from "../sort-control";
import { BrandFilterPopover } from "../brand-filter-popover";
import { mockFacets } from "./filter-semantics.test";

describe("NativePopover & Native Filter Controls", () => {
  it("renders trigger button cleanly without open state in static markup", () => {
    const html = renderToStaticMarkup(
      <NativePopover
        trigger={({ toggle }) => (
          <button type="button" onClick={toggle}>
            Open Popover
          </button>
        )}
      >
        {() => <div>Popover Content</div>}
      </NativePopover>,
    );

    expect(html).toContain("Open Popover");
    expect(html).not.toContain("Popover Content");
  });

  it("renders SortControl as accessible native select", () => {
    const onSort = vi.fn();
    const html = renderToStaticMarkup(
      <SortControl value="EXPLORE" onChange={onSort} />,
    );

    expect(html).toContain('<label for="sort-select"');
    expect(html).toContain('<select id="sort-select"');
    expect(html).toContain('value="EXPLORE"');
    expect(html).toContain('value="RECENTLY_SEEN"');
    expect(html).toContain('value="NEWEST_STARTED"');
  });

  it("renders BrandFilterPopover with human brand name token/trigger", () => {
    const onToggle = vi.fn();
    const brandId = mockFacets.brands[0].brandId;
    const brandName = mockFacets.brands[0].brandName;

    const html = renderToStaticMarkup(
      <BrandFilterPopover
        facets={mockFacets}
        filter={{ brandIds: [brandId] }}
        onToggleBrand={onToggle}
      />,
    );

    // Human name is present, NOT a UUID fallback
    expect(html).toContain(brandName);
    expect(html).not.toContain("Brand · 1");
  });

  it("uses brandNameMap when selected brand is outside current facet list", () => {
    const onToggle = vi.fn();
    const customBrandId = "11111111-2222-3333-4444-555555555555";
    const brandNameMap = { [customBrandId]: "Acme Corp" };

    const html = renderToStaticMarkup(
      <BrandFilterPopover
        facets={mockFacets}
        filter={{ brandIds: [customBrandId] }}
        onToggleBrand={onToggle}
        brandNameMap={brandNameMap}
      />,
    );

    expect(html).toContain("Acme Corp");
    expect(html).not.toContain(customBrandId);
  });
});
