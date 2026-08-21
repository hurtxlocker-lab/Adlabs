import { Suspense } from "react";
import Link from "next/link";
import { getAdLibraryItemsByIds } from "@/features/ad-library";
import { Header } from "@/components/navigation/header";
import { FilterPanel } from "@/features/discover/components/filter-panel";
import { PackedField } from "@/features/discover/components/packed-field/packed-field";
import {
  queryDiscoveryAds,
  queryDiscoveryFacets,
} from "@/discovery/filters";
import {
  parseDiscoveryFiltersFromParams,
  parseSortFromParams,
} from "@/features/discover/utils/url-filters";

/**
 * Discover page — evidence-driven ad discovery.
 *
 * Data query flow:
 *   URL searchParams
 *     ↓ parseDiscoveryFiltersFromParams()             — pure URL codec
 *     ↓ queryDiscoveryAds() + queryDiscoveryFacets()  — parallel (filter engine)
 *     ↓ getAdLibraryItemsByIds()                      — bulk hydration (4-5 SQL queries)
 *     ↓ PackedField                                   — rectilinear authored plate topology
 *
 * Logical DB query fanout on a default (no-filter) request:
 *   1  queryDiscoveryAds — 1 SQL query (filter + sort + limit)
 *   2  queryDiscoveryFacets — 12 parallel SQL queries (one per facet dimension)
 *   3  getAdLibraryItemsByIds — up to 5 SQL queries (ads, media, cards, card media,
 *      derivatives) — bounded bulk, never one query per ad
 *
 *   Total logical: ~18 SQL operations, all parallelized where possible.
 */

export const dynamic = "force-dynamic";

interface DiscoverPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  const resolvedParams = await searchParams;

  // Parse URL → filter input (pure codec, no validation here)
  const filterInput = parseDiscoveryFiltersFromParams(resolvedParams);
  const sort = parseSortFromParams(resolvedParams) ?? "RECENTLY_SEEN";

  // Run discovery query + facets in parallel
  const [result, facets] = await Promise.all([
    queryDiscoveryAds({ filters: filterInput, sort, pageSize: 72 }),
    queryDiscoveryFacets({ filters: filterInput }),
  ]);

  // Bulk hydrate ordered ad IDs — 4-5 bounded SQL queries, order preserved
  const adIds = result.items.map((x) => x.adId);
  const items = await getAdLibraryItemsByIds(adIds);

  return (
    <div className="min-h-screen bg-[#07080a] text-[#f3f4f6] flex flex-col selection:bg-[#d46b3820]">
      <Header corpusCount={items.length} />

      <main className="flex-1 adlabs-canvas py-8 sm:py-12 pb-32 sm:pb-20 flex flex-col gap-8 lg:gap-10">
        {/* Page orientation */}
        <section className="flex flex-col gap-2 max-w-2xl">
          <h1 className="text-3xl sm:text-4xl font-normal tracking-tight text-[#f3f4f6] font-editorial">
            Discover
          </h1>
          <p className="text-sm text-[#9da2ad] font-sans leading-relaxed">
            Commercial creative and messaging across monitored brands.
          </p>
        </section>

        {/* Filter rail */}
        <section className="w-full pb-6 border-b border-[#16181f]">
          <Suspense
            fallback={
              <div className="h-10 w-full bg-[#0c0e13] animate-pulse rounded-none" />
            }
          >
            <FilterPanel facets={facets} totalCount={items.length} />
          </Suspense>
        </section>

        {/* Creative field — Packed Field Topology */}
        <section className="w-full">
          {items.length === 0 ? (
            <EmptyState />
          ) : (
            <PackedField items={items} />
          )}
        </section>
      </main>

      <footer className="w-full border-t border-[#16181f] py-6 bg-[#050608] text-xs font-sans text-[#686e7b]">
        <div className="adlabs-canvas flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="tracking-tight">AdLabs</span>
          <span className="font-mono text-xs text-[#8e95a2]">
            Factual Creative Observations
          </span>
        </div>
      </footer>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="w-full py-20 px-4 text-center border border-[#161820] bg-[#090b10] flex flex-col items-center justify-center gap-3">
      <p className="text-sm text-[#f3f4f6] font-medium font-sans">
        No ads match this evidence set.
      </p>
      <p className="text-xs text-[#686e7b] font-sans">
        Try adjusting your filters to expand the result set.
      </p>
      <Link
        href="/discover"
        className="mt-2 text-xs font-sans text-[#d46b38] hover:text-[#e07945] underline underline-offset-4 transition-colors"
      >
        Clear all filters
      </Link>
    </div>
  );
}
