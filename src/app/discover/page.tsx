import { Suspense } from "react";
import { getAdLibraryItems } from "@/features/ad-library";
import { Header } from "@/components/navigation/header";
import { SearchBar } from "@/features/discover/components/search-bar";
import { CreativeCard } from "@/features/discover/components/creative-card";
import { partitionIntoClusters } from "@/features/discover/utils/cluster-rhythm";

interface DiscoverPageProps {
  searchParams: Promise<{
    search?: string;
    format?: string;
    brand?: string;
    active?: string;
  }>;
}

export const dynamic = "force-dynamic";

export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  const resolvedParams = await searchParams;
  const items = await getAdLibraryItems(resolvedParams);

  // Total count for orientation
  const allItems =
    resolvedParams.search || resolvedParams.format
      ? await getAdLibraryItems()
      : items;

  // Extract available formats from corpus
  const availableFormats = Array.from(
    new Set(
      allItems
        .map((i) => i.displayFormat)
        .filter((f): f is string => Boolean(f)),
    ),
  );

  const clusters = partitionIntoClusters(items);

  return (
    <div className="min-h-screen bg-[#07080a] text-[#f3f4f6] flex flex-col selection:bg-[#d46b3820]">
      <Header corpusCount={allItems.length} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 pb-32 sm:pb-20 flex flex-col gap-10">
        {/* Page Orientation */}
        <section className="flex flex-col gap-2 max-w-2xl">
          <h1 className="text-3xl sm:text-4xl font-normal tracking-tight text-[#f3f4f6] font-editorial">
            Discover
          </h1>
          <p className="text-sm text-[#9da2ad] font-sans leading-relaxed">
            Commercial creative and messaging across monitored brands.
          </p>
        </section>

        {/* Search Aperture & Factual Filters */}
        <section className="w-full pb-6 border-b border-[#16181f]">
          <Suspense
            fallback={
              <div className="h-10 w-full bg-[#0c0e13] animate-pulse" />
            }
          >
            <SearchBar
              currentSearch={resolvedParams.search}
              currentFormat={resolvedParams.format || "ALL"}
              availableFormats={availableFormats}
            />
          </Suspense>
        </section>

        {/* Creative Field: Deterministic Cluster Rhythm */}
        <section className="w-full flex flex-col gap-14 sm:gap-20">
          {items.length === 0 ? (
            <div className="w-full py-20 px-4 text-center border border-[#161820] bg-[#090b10] flex flex-col items-center justify-center gap-2">
              <p className="text-sm text-[#f3f4f6] font-medium font-sans">
                No matching creatives found.
              </p>
              <p className="text-xs text-[#686e7b] font-sans">
                Try adjusting active search filters to view all monitored creatives.
              </p>
            </div>
          ) : (
            clusters.map((cluster) => {
              if (cluster.type === "lead-companion") {
                const lead = cluster.items[0];
                const companions = cluster.items.slice(1);

                return (
                  <div
                    key={cluster.id}
                    className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start"
                  >
                    {/* Dominant Lead Artifact (7 cols) */}
                    {lead && (
                      <div className="lg:col-span-7">
                        <CreativeCard item={lead.item} layoutRole="lead" />
                      </div>
                    )}

                    {/* Stacked Supporting Companions (5 cols) */}
                    {companions.length > 0 && (
                      <div className="lg:col-span-5 flex flex-col gap-8 lg:gap-10">
                        {companions.map((c) => (
                          <CreativeCard
                            key={c.item.id}
                            item={c.item}
                            layoutRole="supporting"
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
                    className="flex flex-col gap-10 lg:gap-14"
                  >
                    {/* Balanced Offset Duo (Side-by-Side) */}
                    {duo.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 items-start">
                        {duo.map((c, idx) => (
                          <div
                            key={c.item.id}
                            className={idx === 1 ? "md:pt-8 lg:pt-14" : ""}
                          >
                            <CreativeCard
                              item={c.item}
                              layoutRole="offset"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Wide Centerpiece Interruption */}
                    {wide && (
                      <div className="w-full pt-2 sm:pt-4 border-t border-[#12141c]/60">
                        <CreativeCard item={wide.item} layoutRole="wide" />
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
                  className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start"
                >
                  {/* Stacked Supporting Companions (5 cols left) */}
                  {companions.length > 0 && (
                    <div className="lg:col-span-5 flex flex-col gap-8 lg:gap-10">
                      {companions.map((c) => (
                        <CreativeCard
                          key={c.item.id}
                          item={c.item}
                          layoutRole="supporting"
                        />
                      ))}
                    </div>
                  )}

                  {/* Dominant Lead Artifact (7 cols right) */}
                  {lead && (
                    <div className="lg:col-span-7">
                      <CreativeCard item={lead.item} layoutRole="lead" />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </section>
      </main>

      {/* Quiet Grounded Footer */}
      <footer className="w-full border-t border-[#16181f] py-6 bg-[#050608] text-xs font-sans text-[#686e7b]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="tracking-tight">AdLabs</span>
          <span className="font-mono text-xs text-[#8e95a2]">
            Factual Creative Observations
          </span>
        </div>
      </footer>
    </div>
  );
}
