import { Suspense } from "react";
import { getAdLibraryItems } from "@/features/ad-library";
import { Header } from "@/components/navigation/header";
import { SearchBar } from "@/features/discover/components/search-bar";
import { CreativeCard } from "@/features/discover/components/creative-card";

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

  // Total count for header orientation
  const allItems =
    resolvedParams.search || resolvedParams.format
      ? await getAdLibraryItems()
      : items;

  // Extract real available formats from corpus
  const availableFormats = Array.from(
    new Set(
      allItems
        .map((i) => i.displayFormat)
        .filter((f): f is string => Boolean(f)),
    ),
  );

  const leadItem = items.length > 0 ? items[0] : null;
  const supportingItem1 = items.length > 1 ? items[1] : null;
  const supportingItem2 = items.length > 2 ? items[2] : null;

  return (
    <div className="min-h-screen bg-[#090a0e] text-[#ededed] flex flex-col">
      <Header corpusCount={allItems.length} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 pb-28 sm:pb-16 flex flex-col gap-8">
        {/* Concise Orientation Header */}
        <section className="flex flex-col gap-1.5 max-w-2xl">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-100 font-sans">
            Discover Creative
          </h1>
          <p className="text-sm text-zinc-400 font-sans">
            Commercial creative and messaging across monitored brands.
          </p>
        </section>

        {/* Central Search & Factual Filters */}
        <section className="w-full pt-1 pb-4 border-b border-[#181b22]">
          <Suspense
            fallback={
              <div className="h-10 w-full bg-zinc-900/40 animate-pulse rounded-sm" />
            }
          >
            <SearchBar
              currentSearch={resolvedParams.search}
              currentFormat={resolvedParams.format || "ALL"}
              availableFormats={availableFormats}
            />
          </Suspense>
        </section>

        {/* Creative Field: Intentional 1 Lead + 2 Distinct Supporting Spatial Layout */}
        <section className="w-full">
          {items.length === 0 ? (
            <div className="w-full py-16 px-4 text-center border border-[#1b1e25] bg-[#0d0f14] flex flex-col items-center justify-center gap-2">
              <p className="text-sm text-zinc-300 font-medium">
                No matching advertising artifacts found in archive.
              </p>
              <p className="text-xs text-zinc-500">
                Try clearing active search filters to view all monitored creatives.
              </p>
            </div>
          ) : items.length <= 3 && leadItem ? (
            /* Authored layout for current 3-ad corpus */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
              {/* Lead Dominant Creative (7 cols) */}
              <div className="lg:col-span-7">
                <CreativeCard item={leadItem} layoutRole="lead" />
              </div>

              {/* Supporting Column (5 cols) with varied scale & rhythm */}
              <div className="lg:col-span-5 flex flex-col gap-6">
                {supportingItem1 && (
                  <CreativeCard
                    item={supportingItem1}
                    layoutRole="supporting-tall"
                  />
                )}
                {supportingItem2 && (
                  <CreativeCard
                    item={supportingItem2}
                    layoutRole="supporting-compact"
                  />
                )}
              </div>
            </div>
          ) : (
            /* Extended responsive grid if corpus expands */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
              {items.map((item) => (
                <CreativeCard
                  key={item.id}
                  item={item}
                  layoutRole="supporting-tall"
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="w-full border-t border-[#181b22] py-5 bg-[#08090c] text-xs text-zinc-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>AdLabs • Discover</span>
          <span>Factual Creative Observations</span>
        </div>
      </footer>
    </div>
  );
}
