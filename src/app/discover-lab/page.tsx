import { notFound } from "next/navigation";
import { getAdLibraryItems } from "@/features/ad-library";
import { Header } from "@/components/navigation/header";
import { PackedField } from "@/features/discover/components/packed-field/packed-field";

export const dynamic = "force-dynamic";

interface DiscoverLabPageProps {
  searchParams?: Promise<{
    seed?: string | string[];
  }>;
}

export default async function DiscoverLabPage({ searchParams }: DiscoverLabPageProps) {
  // Production guard: /discover-lab is a development-only experiment page.
  // Returns 404 in any environment other than local development.
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const resolvedParams = searchParams ? await searchParams : undefined;
  const seed = typeof resolvedParams?.seed === "string" ? resolvedParams.seed : undefined;
  const items = await getAdLibraryItems();

  return (
    <div className="min-h-screen bg-[#07080a] text-[#f3f4f6] flex flex-col selection:bg-[#d46b3820]">
      <Header corpusCount={items.length} />

      <main className="flex-1 adlabs-canvas py-8 sm:py-12 pb-32 sm:pb-20 flex flex-col gap-10 lg:gap-14">
        {/* Prototype Header & Orientation */}
        <section className="flex flex-col gap-2 max-w-3xl">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl sm:text-4xl font-normal tracking-tight text-[#f3f4f6] font-editorial">
              Discover Lab
            </h1>
            <span className="font-mono text-[11px] uppercase tracking-wider text-[#d46b38] bg-[#d46b3815] border border-[#d46b3830] px-2 py-0.5 rounded-[3px]">
              Packed Field v1 Experiment
            </span>
          </div>
          <p className="text-sm text-[#9da2ad] font-sans leading-relaxed">
            Experimental rectilinear packed field composition. Single visual plate topology, shared edge boundaries, and uncropped source fidelity.
          </p>
        </section>

        {/* Generative Field Composition Surface */}
        {items.length === 0 ? (
          <div className="w-full py-20 px-4 text-center border border-[#161820] bg-[#090b10] flex flex-col items-center justify-center gap-2">
            <p className="text-sm text-[#f3f4f6] font-medium font-sans">
              No creatives available in corpus.
            </p>
          </div>
        ) : (
          <PackedField items={items} baseSeed={seed} />
        )}
      </main>

      {/* Quiet Grounded Footer */}
      <footer className="w-full border-t border-[#16181f] py-6 bg-[#050608] text-xs font-sans text-[#686e7b]">
        <div className="adlabs-canvas flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="tracking-tight">AdLabs Lab</span>
          <span className="font-mono text-xs text-[#8e95a2]">
            Authored Editorial Field Prototype
          </span>
        </div>
      </footer>
    </div>
  );
}
