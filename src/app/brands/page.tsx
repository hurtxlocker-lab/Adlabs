import type { Metadata } from "next";
import { Header } from "@/components/navigation/header";
import {
  getBrandDirectory,
  type BrandDirectorySort,
} from "@/features/brands/queries";
import { BrandCard, type LensKind } from "@/features/brands/brand-card";
import {
  BrandAtlasControls,
  LENS_NARRATION,
} from "@/features/brands/atlas-controls";

export const metadata: Metadata = {
  title: "Brands — AdLabs",
  description:
    "The Competitive Landscape: a living atlas of how the world's best brands run advertising.",
};

const SORT_KEYS: BrandDirectorySort[] = [
  "MOST_CREATIVES",
  "RECENTLY_ACTIVE",
  "REACH_SCALE",
  "SOCIAL_AUTHORITY",
];

function observedDays(
  items: Awaited<ReturnType<typeof getBrandDirectory>>,
): number {
  if (items.length === 0) return 0;
  const min = Math.min(...items.map((i) => i.creativeFootprint.lastSeenAt.getTime()));
  return Math.max(1, Math.floor((Date.now() - min) / 86_400_000));
}

export default async function BrandsPage({
  searchParams,
}: {
  searchParams?: Promise<{ sort?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const requested = (params.sort ?? "MOST_CREATIVES") as LensKind;
  const sort: BrandDirectorySort = SORT_KEYS.includes(requested)
    ? (requested as BrandDirectorySort)
    : "MOST_CREATIVES";

  const items = await getBrandDirectory(sort);

  const totalCreatives = items.reduce((s, i) => s + i.creativeFootprint.creativeCount, 0);
  const activeCount = items.filter(
    (i) => i.creativeFootprint.activeCreativeCount > 0,
  ).length;
  const days = observedDays(items);
  const narration = LENS_NARRATION[sort] ?? "";
  const lens: LensKind = sort;

  return (
    <>
      <Header corpusCount={totalCreatives} active="brands" />

      <main className="mx-auto max-w-[1400px] px-6 pb-24 pt-12">
        {/* ===== Atlas hero — editorial statement + quiet facts ===== */}
        <section aria-labelledby="atlas-title">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-[#686e7b]">
            The Competitive Landscape
          </p>
          <h1
            id="atlas-title"
            className="mt-3 max-w-3xl text-3xl font-medium leading-[1.15] tracking-[-0.02em] text-[#f3f4f6]"
          >
            How the world&apos;s best brands run advertising.
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[#8e95a2]">
            A living atlas of foreign creative strategy — every brand below is an
            active advertiser whose moves are disclosed, archived, and searchable.
            Study the patterns. Borrow the conviction.
          </p>

          {/* Quiet facts strip */}
          <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-2 border-y border-[#20242e] py-3 font-mono text-[11px] tabular-nums text-[#8e95a2]">
            <span>
              <span className="text-[#f3f4f6]">{items.length}</span> brands
            </span>
            <span>
              <span className="text-[#f3f4f6]">{totalCreatives}</span> creatives
            </span>
            <span>
              <span className="text-[#f3f4f6]">{activeCount}</span> currently active
            </span>
            <span>
              <span className="text-[#f3f4f6]">{days}</span> days observed
            </span>
            <span className="text-[#4e535e]">EU · UK disclosed</span>
          </div>
        </section>

        {/* ===== Controls ===== */}
        <section aria-label="Directory controls" className="mt-10">
          <BrandAtlasControls entries={items} activeLens={lens} />
          <p className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-[#4e535e]">
            {narration}
          </p>
        </section>

        {/* ===== Polaroid wall ===== */}
        {items.length === 0 ? (
          <div className="mt-20 rounded-[4px] border border-dashed border-[#20242e] py-24 text-center">
            <p className="font-mono text-sm text-[#686e7b]">
              No brands in the atlas yet.
            </p>
            <p className="mt-1 font-mono text-xs text-[#4e535e]">
              Ingestion populates this landscape.
            </p>
          </div>
        ) : (
          <section
            aria-label="Brand dossiers"
            className="mt-8 grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          >
            {items.map((item, idx) => (
              <BrandCard key={item.brand.slug} item={item} lens={lens} eager={idx === 0} />
            ))}
          </section>
        )}
      </main>
    </>
  );
}

