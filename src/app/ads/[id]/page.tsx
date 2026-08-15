import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdLibraryItemById } from "@/features/ad-library";
import { formatFactualDate, getPrimaryMedia } from "@/features/ad-library/utils";
import { Header } from "@/components/navigation/header";

interface AdDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export const dynamic = "force-dynamic";

export default async function AdDetailPage({ params }: AdDetailPageProps) {
  const { id } = await params;
  const item = await getAdLibraryItemById(id);

  if (!item) {
    notFound();
  }

  const { video, preview, displayMedia } = getPrimaryMedia(item);
  const isVideo = item.displayFormat === "VIDEO" || video !== undefined;
  const isObservedActive = item.isActiveObserved;

  return (
    <div className="min-h-screen bg-[#090a0e] text-[#ededed] flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 pb-28 sm:pb-16 flex flex-col gap-6 sm:gap-8">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/discover"
            className="inline-flex items-center gap-1.5 text-xs font-sans text-zinc-400 hover:text-amber-300 transition-colors group"
          >
            <span className="group-hover:-translate-x-0.5 transition-transform">←</span>
            Discover
          </Link>

          <div className="text-xs font-sans text-zinc-500">
            Ad ID: <span className="text-zinc-300">{item.sourceAdId}</span>
          </div>
        </div>

        {/* Two-Column Factual Composition */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Creative Media Viewport (7 cols) */}
          <section className="lg:col-span-7 flex flex-col gap-3">
            <div className="relative w-full bg-[#06070a] border border-[#1b1e26] flex items-center justify-center min-h-[380px] sm:min-h-[520px] max-h-[720px] overflow-hidden">
              {isVideo && video ? (
                <video
                  src={video.mediaUrl}
                  poster={preview?.mediaUrl}
                  controls
                  playsInline
                  className="w-full h-full max-h-[720px] object-contain"
                />
              ) : displayMedia ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={displayMedia.mediaUrl}
                  alt={item.headline || item.brand.name}
                  className="w-full h-full max-h-[720px] object-contain"
                />
              ) : (
                <div className="w-full h-96 flex items-center justify-center text-zinc-600 font-sans text-xs">
                  Creative Media
                </div>
              )}
            </div>
          </section>

          {/* Right Column: Factual Copy & Observation Signals (5 cols) */}
          <section className="lg:col-span-5 flex flex-col gap-6 bg-[#0f1117] border border-[#1b1e26] p-6 sm:p-8">
            {/* Brand Header & Active State */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#181b22]">
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-sans text-zinc-500">
                  Brand
                </span>
                <h2 className="text-xl font-bold tracking-tight text-amber-400 font-sans">
                  {item.brand.name}
                </h2>
              </div>

              <div>
                {isObservedActive === true && (
                  <span className="text-xs font-sans text-zinc-300 bg-[#161920] border border-zinc-700 px-2.5 py-1 rounded-sm">
                    Active when observed
                  </span>
                )}
                {isObservedActive === false && (
                  <span className="text-xs font-sans text-zinc-500 bg-[#161920] border border-zinc-800 px-2.5 py-1 rounded-sm">
                    Inactive
                  </span>
                )}
              </div>
            </div>

            {/* Headline */}
            {item.headline && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-sans text-zinc-500">
                  Headline
                </span>
                <p className="text-base sm:text-lg font-semibold text-zinc-100 leading-snug font-sans">
                  {item.headline}
                </p>
              </div>
            )}

            {/* Primary Text */}
            {item.primaryText && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-sans text-zinc-500">
                  Creative Copy
                </span>
                <p className="text-sm text-zinc-300 leading-relaxed font-sans whitespace-pre-line">
                  {item.primaryText}
                </p>
              </div>
            )}

            {/* Description */}
            {item.description && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-sans text-zinc-500">
                  Description
                </span>
                <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                  {item.description}
                </p>
              </div>
            )}

            {/* Call to Action */}
            {item.ctaText && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-sans text-zinc-500">
                  Call to Action
                </span>
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 text-xs font-sans font-medium bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-sm">
                    {item.ctaText}
                  </span>
                  {item.destinationUrl && (
                    <a
                      href={item.destinationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-sans text-zinc-400 hover:text-amber-300 transition-colors truncate max-w-[200px]"
                    >
                      {item.destinationUrl}
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Observation Timestamps Grid */}
            <div className="pt-4 border-t border-[#181b22] grid grid-cols-2 gap-4 text-xs font-sans">
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-zinc-500">
                  First Seen
                </span>
                <span className="text-zinc-200">
                  {formatFactualDate(item.firstSeenAt)}
                </span>
              </div>

              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-zinc-500">
                  Last Seen
                </span>
                <span className="text-zinc-200">
                  {formatFactualDate(item.lastSeenAt)}
                </span>
              </div>
            </div>

            {/* Platform Markers & Source Links */}
            <div className="pt-4 border-t border-[#181b22] flex flex-col gap-2">
              <span className="text-[11px] font-sans text-zinc-500">
                Platforms
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {item.publisherPlatforms.map((p) => (
                  <span
                    key={p}
                    className="px-2 py-0.5 text-xs font-sans bg-[#14161d] border border-[#22252e] text-zinc-300 rounded-sm"
                  >
                    {p}
                  </span>
                ))}
              </div>

              {item.adLibraryUrl && (
                <div className="pt-2">
                  <a
                    href={item.adLibraryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-sans text-zinc-400 hover:text-amber-300 transition-colors"
                  >
                    View in Meta Ad Library
                    <span aria-hidden="true">↗</span>
                  </a>
                </div>
              )}
            </div>
          </section>
        </div>
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
