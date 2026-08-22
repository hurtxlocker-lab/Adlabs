import { Suspense } from "react";
import Link from "next/link";
import { getAdLibraryItemsByIds } from "@/features/ad-library";
import { Header } from "@/components/navigation/header";
import { FilterPanel } from "@/features/discover/components/filter-panel";
import { CanonicalGallery } from "@/features/discover/components/gallery/canonical-gallery";
import { LoadMoreButton } from "@/features/discover/components/gallery/load-more-button";
import type { DiscoveryGalleryFacts } from "@/features/discover/queries/gallery-facts";
import {
  queryDiscoveryCreatives,
  queryDiscoveryFacets,
} from "@/discovery/filters";
import {
  parseDiscoveryFiltersFromParams,
  parseSortFromParams,
} from "@/features/discover/utils/url-filters";

/**
 * Discover page — evidence-driven canonical exact creative discovery gallery.
 *
 * Data query flow:
 *   URL searchParams
 *     ↓ parseDiscoveryFiltersFromParams()                — pure URL codec
 *     ↓ queryDiscoveryCreatives() + queryDiscoveryFacets() — parallel grouped query
 *     ↓ getAdLibraryItemsByIds(representativeAdIds)      — bulk hydration
 *     ↓ CanonicalGallery                                 — dense creative gallery
 */

export const dynamic = "force-dynamic";

interface DiscoverPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  const resolvedParams = await searchParams;

  // Parse URL → filter input (pure codec, no validation here)
  const filterInput = parseDiscoveryFiltersFromParams(resolvedParams);
  const sort = parseSortFromParams(resolvedParams) ?? "EXPLORE";

  // Parse pagination limit (default: 72 creative groups)
  const rawLimit = resolvedParams.limit;
  const currentLimit = Math.min(
    Math.max(
      parseInt(typeof rawLimit === "string" ? rawLimit : "72", 10) || 72,
      1,
    ),
    500,
  );

  // Run discovery creative group query + facets in parallel
  const [result, facets] = await Promise.all([
    queryDiscoveryCreatives({ filters: filterInput, sort, pageSize: currentLimit }),
    queryDiscoveryFacets({ filters: filterInput }),
  ]);

  // Hydrate representative canonical ads for each group (order strictly preserved)
  const representativeAdIds = result.items.map((x) => x.representativeAdId);
  const items = await getAdLibraryItemsByIds(representativeAdIds);

  // Map projection facts directly from creative groups (zero extra SQL round-trip)
  const galleryFacts = new Map<string, DiscoveryGalleryFacts>();
  for (const group of result.items) {
    galleryFacts.set(group.representativeAdId, {
      adId: group.representativeAdId,
      videoDurationMs: group.videoDurationMs,
      exactCreativeReuseCount: group.exactReuseCount,
      hasEuTransparencyEvidence: group.hasEuTransparencyEvidence,
      latestEuTotalReach: group.latestEuTotalReach,
      hasUkTransparencyEvidence: group.hasUkTransparencyEvidence,
      latestUkTotalReach: group.latestUkTotalReach,
    });
  }

  return (
    <div className="min-h-screen bg-[#07080a] text-[#f3f4f6] flex flex-col selection:bg-[#d46b3820]">
      <Header corpusCount={result.totalCreativesCount} />

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
            <FilterPanel
              facets={facets}
              totalCount={result.totalCreativesCount}
              totalAdsCount={result.totalCanonicalAdsCount}
            />
          </Suspense>
        </section>

        {/* Creative Gallery */}
        <section className="w-full">
          {items.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <CanonicalGallery items={items} facts={galleryFacts} />
              {result.hasMore && (
                <LoadMoreButton
                  currentLimit={currentLimit}
                  increment={72}
                  totalCreativesCount={result.totalCreativesCount}
                  displayedCount={items.length}
                />
              )}
            </>
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
        No creatives match this evidence set.
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
