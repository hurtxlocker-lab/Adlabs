import { Suspense } from "react";
import { getAdLibraryItemsByIds } from "@/features/ad-library";
import { Header } from "@/components/navigation/header";
import { FilterPanel } from "@/features/discover/components/filter-panel";
import { CreativeCard } from "@/features/discover/components/creative-card";
import { partitionIntoClusters } from "@/features/discover/utils/cluster-rhythm";
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
 *     ↓ parseDiscoveryFiltersFromParams()    — pure URL codec
 *     ↓ queryDiscoveryAds() + queryDiscoveryFacets()  — parallel (filter engine)
 *     ↓ getAdLibraryItemsByIds()             — bulk hydration (4-5 SQL queries)
 *     ↓ partitionIntoClusters()              — Packed Field layout
 *
 * Logical DB query fanout on a default (no-filter) request:
 *   1  queryDiscoveryAds — 1 SQL query (filter + sort + limit)
 *   2  queryDiscoveryFacets — 12 parallel SQL queries (one per facet dimension)
 *   3  getAdLibraryItemsByIds — up to 5 SQL queries (ads, media, cards, card media,
 *      derivatives) — bounded bulk, never one query per ad
 *
 *   Total logical: ~18 SQL operations, all parallelized where possible.
 *
 * Search: text search is intentionally removed from V1 Discover.
 * Rationale: legacy LIKE search queries a different data universe (canonical ads table)
 * which would cause filter counts and displayed results to diverge from the discovery
 * engine. Search will return as a first-class composable discovery predicate.
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

  const clusters = partitionIntoClusters(items);

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

        {/* Creative field */}
        <section className="w-full flex flex-col gap-14 sm:gap-20 2xl:gap-24">
          {items.length === 0 ? (
            <EmptyState />
          ) : (
            clusters.map((cluster) => {
              if (cluster.type === "lead-companion") {
                const lead = cluster.items[0];
                const companions = cluster.items.slice(1);

                return (
                  <div
                    key={cluster.id}
                    data-cluster={cluster.id}
                    className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 xl:gap-12 2xl:gap-16 items-start"
                  >
                    {lead && (
                      <div className="lg:col-span-7 2xl:col-span-8">
                        <CreativeCard
                          item={lead.item}
                          layoutRole="lead"
                          clusterId={cluster.id}
                        />
                      </div>
                    )}
                    {companions.length > 0 && (
                      <div className="lg:col-span-5 2xl:col-span-4 flex flex-col gap-8 lg:gap-10">
                        {companions.map((c) => (
                          <CreativeCard
                            key={c.item.id}
                            item={c.item}
                            layoutRole="supporting"
                            clusterId={cluster.id}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              if (cluster.type === "offset-duo-wide") {
                const duo = cluster.items.slice(0, 2);
                const wide = cluster.items[2];

                return (
                  <div
                    key={cluster.id}
                    data-cluster={cluster.id}
                    className="flex flex-col gap-10 lg:gap-14 2xl:gap-16"
                  >
                    {duo.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-10 xl:gap-12 2xl:gap-16 items-start">
                        {duo.map((c, idx) => (
                          <div
                            key={c.item.id}
                            className={idx === 1 ? "md:pt-8 lg:pt-14 2xl:pt-16" : ""}
                          >
                            <CreativeCard
                              item={c.item}
                              layoutRole="offset"
                              clusterId={cluster.id}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    {wide && (
                      <div className="w-full pt-2 sm:pt-4 border-t border-[#12141c]/60">
                        <CreativeCard
                          item={wide.item}
                          layoutRole="wide"
                          clusterId={cluster.id}
                        />
                      </div>
                    )}
                  </div>
                );
              }

              // mirrored-lead
              const companions = cluster.items.slice(0, 2);
              const lead = cluster.items[2];

              return (
                <div
                  key={cluster.id}
                  data-cluster={cluster.id}
                  className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 xl:gap-12 2xl:gap-16 items-start"
                >
                  {companions.length > 0 && (
                    <div className="lg:col-span-5 2xl:col-span-4 flex flex-col gap-8 lg:gap-10 order-2 lg:order-1">
                      {companions.map((c) => (
                        <CreativeCard
                          key={c.item.id}
                          item={c.item}
                          layoutRole="supporting"
                          clusterId={cluster.id}
                        />
                      ))}
                    </div>
                  )}
                  {lead && (
                    <div className="lg:col-span-7 2xl:col-span-8 order-1 lg:order-2">
                      <CreativeCard
                        item={lead.item}
                        layoutRole="lead"
                        clusterId={cluster.id}
                      />
                    </div>
                  )}
                </div>
              );
            })
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
    </div>
  );
}
