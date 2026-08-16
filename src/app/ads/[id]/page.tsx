import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdLibraryItemById } from "@/features/ad-library";
import {
  formatDisplayFormat,
  formatFactualDate,
} from "@/features/ad-library/utils";
import { Header } from "@/components/navigation/header";
import { DetailMediaPlayer } from "@/features/discover/components/detail-media-player";

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

  const isObservedActive = item.isActiveObserved;
  const variations = item.variations ?? [];
  const isMultiVariation = variations.length > 1;
  const formattedFormat = formatDisplayFormat(
    item.displayFormat,
    variations.length,
  );

  return (
    <div className="min-h-screen bg-[#07080a] text-[#f3f4f6] flex flex-col selection:bg-[#d46b3820]">
      <Header />

      <main className="flex-1 adlabs-canvas py-8 sm:py-12 pb-32 sm:pb-20 flex flex-col gap-8">
        {/* Navigation Breadcrumb & Factual Source Anchor */}
        <div className="flex items-center justify-between">
          <Link
            href="/discover"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-sans text-[#9da2ad] hover:text-[#e07945] transition-colors"
          >
            <span>←</span>
            Discover
          </Link>

          <div className="text-xs font-mono text-[#8e95a2] tabular-nums">
            Source ID: <span className="text-[#f3f4f6]">{item.sourceAdId}</span>
          </div>
        </div>

        {/* Two-Column Factual Composition */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start">
          {/* Left Column: Creative Inspection (7 cols) */}
          <section className="lg:col-span-7 flex flex-col gap-6">
            {isMultiVariation ? (
              /* Multi-Variation Unfolded Sequence */
              <div className="flex flex-col gap-8">
                {/* Section Header */}
                <div className="flex items-center justify-between border-b border-[#16181f] pb-3">
                  <h2 className="text-xs font-mono text-[#8e95a2] uppercase tracking-wider">
                    Creative variations ({variations.length})
                  </h2>
                  <span className="font-mono text-xs text-[#686e7b]">
                    {formattedFormat}
                  </span>
                </div>

                {/* Direct Sequential Variations */}
                <div className="flex flex-col divide-y divide-[#16181f]">
                  {variations.map((variation, idx) => {
                    const variationPrimaryMedia =
                      variation.media.find((m) => m.role !== "preview") ??
                      variation.media[0];
                    const variationPreview = variation.media.find(
                      (m) => m.role === "preview",
                    );
                    const isVideo =
                      variationPrimaryMedia?.mediaType === "VIDEO";

                    return (
                      <div
                        key={variation.id}
                        className={`flex flex-col gap-4 ${
                          idx > 0 ? "pt-10" : ""
                        }`}
                      >
                        {/* Variation Position & Optional CTA */}
                        <div className="flex items-center justify-between text-xs font-mono text-[#8e95a2]">
                          <span className="text-[#f3f4f6] font-medium">
                            Variation {idx + 1}
                          </span>
                          {variation.ctaText && (
                            <span className="text-[#8e95a2] border border-[#1a1d25] bg-[#0c0e13] px-2 py-0.5">
                              {variation.ctaText}
                            </span>
                          )}
                        </div>

                        {/* Media Mount */}
                        <div className="relative w-full bg-[#030406] border border-[#161820] flex items-center justify-center min-h-[380px] sm:min-h-[460px] max-h-[660px] overflow-hidden">
                          <div className="absolute inset-0 w-full h-full flex items-center justify-center">
                            {isVideo && variationPrimaryMedia ? (
                              <video
                                src={variationPrimaryMedia.mediaUrl}
                                poster={variationPreview?.mediaUrl}
                                preload="none"
                                controls
                                playsInline
                                className="w-full h-full max-w-full max-h-full object-contain object-center"
                              />
                            ) : variationPrimaryMedia ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={variationPrimaryMedia.mediaUrl}
                                alt={variation.headline || `Variation ${idx + 1}`}
                                className="w-full h-full max-w-full max-h-full object-contain object-center"
                              />
                            ) : (
                              <span className="font-mono text-xs text-[#686e7b]">
                                Variation Asset
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Variation Copy Deck */}
                        <div className="flex flex-col gap-2 pt-1">
                          {variation.headline && (
                            <h3 className="font-editorial text-xl sm:text-2xl text-[#f3f4f6] leading-snug">
                              {variation.headline}
                            </h3>
                          )}

                          {variation.body && (
                            <p className="font-sans text-sm text-[#9da2ad] leading-[1.75] whitespace-pre-line border-l-2 border-[#1c202a] pl-4">
                              {variation.body}
                            </p>
                          )}

                          {variation.description && (
                            <p className="font-mono text-xs text-[#686e7b]">
                              {variation.description}
                            </p>
                          )}

                          {variation.destinationUrl && (
                            <a
                              href={variation.destinationUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-sans text-[#8e95a2] hover:text-[#e07945] transition-colors truncate pt-1 inline-flex items-center gap-1"
                            >
                              <span>{variation.destinationUrl}</span>
                              <span aria-hidden="true">↗</span>
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Single-Creative Hero Presentation */
              <DetailMediaPlayer item={item} />
            )}
          </section>

          {/* Right Column: Editorial Dossier & Marginal Evidence (5 cols) */}
          <section className="lg:col-span-5 flex flex-col gap-7 pt-1">
            {/* Brand Header & Observation State */}
            <div className="flex items-baseline justify-between gap-4 pb-5 border-b border-[#16181f]">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-mono text-[#8e95a2] uppercase tracking-wider">
                  Brand
                </span>
                <h1 className="text-2xl sm:text-3xl font-normal tracking-tight text-[#f3f4f6] font-editorial">
                  {item.brand.name}
                </h1>
              </div>

              <div>
                {isObservedActive === true && (
                  <span className="text-xs font-mono text-[#f3f4f6] bg-[#111319] border border-[#20242e] px-2.5 py-1">
                    Active when observed
                  </span>
                )}
                {isObservedActive === false && (
                  <span className="text-xs font-mono text-[#8e95a2] bg-[#111319] border border-[#161820] px-2.5 py-1">
                    Inactive
                  </span>
                )}
              </div>
            </div>

            {/* Single Creative Ad Copy (only when not multi-variation) */}
            {!isMultiVariation && (
              <>
                {item.headline && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-mono text-[#8e95a2] uppercase tracking-wider">
                      Headline
                    </span>
                    <p className="text-xl sm:text-2xl font-medium text-[#f3f4f6] leading-snug font-editorial">
                      {item.headline}
                    </p>
                  </div>
                )}

                {item.primaryText && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-mono text-[#8e95a2] uppercase tracking-wider">
                      Creative Copy
                    </span>
                    <p className="text-sm sm:text-base text-[#9da2ad] leading-[1.75] font-sans whitespace-pre-line border-l-2 border-[#1c202a] pl-4">
                      {item.primaryText}
                    </p>
                  </div>
                )}

                {item.description && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-mono text-[#8e95a2] uppercase tracking-wider">
                      Description
                    </span>
                    <p className="text-xs text-[#686e7b] leading-relaxed font-sans">
                      {item.description}
                    </p>
                  </div>
                )}

                {item.ctaText && (
                  <div className="flex flex-col gap-2 pt-4 border-t border-[#16181f]">
                    <span className="text-xs font-mono text-[#8e95a2] uppercase tracking-wider">
                      Call to Action
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1 text-xs font-sans font-medium bg-[#12151b] text-[#f3f4f6] border border-[#20242e]">
                        {item.ctaText}
                      </span>
                      {item.destinationUrl && (
                        <a
                          href={item.destinationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-sans text-[#9da2ad] hover:text-[#e07945] transition-colors truncate max-w-[220px]"
                        >
                          {item.destinationUrl}
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Observation Timestamps */}
            <div className="pt-5 border-t border-[#16181f] grid grid-cols-2 gap-4 text-xs">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-mono text-[#8e95a2] uppercase tracking-wider">
                  First Seen
                </span>
                <span className="text-[#f3f4f6] font-mono tabular-nums text-sm">
                  {formatFactualDate(item.firstSeenAt)}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-mono text-[#8e95a2] uppercase tracking-wider">
                  Last Seen
                </span>
                <span className="text-[#f3f4f6] font-mono tabular-nums text-sm">
                  {formatFactualDate(item.lastSeenAt)}
                </span>
              </div>
            </div>

            {/* Platform Markers & Source Links */}
            <div className="pt-5 border-t border-[#16181f] flex flex-col gap-3">
              <span className="text-xs font-mono text-[#8e95a2] uppercase tracking-wider">
                Platforms
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {item.publisherPlatforms.map((p) => (
                  <span
                    key={p}
                    className="px-2.5 py-0.5 text-xs font-mono bg-[#0c0e13] border border-[#1a1d25] text-[#9da2ad]"
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
                    className="inline-flex items-center gap-1.5 text-xs font-sans text-[#9da2ad] hover:text-[#e07945] transition-colors"
                  >
                    <span>View in Meta Ad Library</span>
                    <span aria-hidden="true">↗</span>
                  </a>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Grounded Footer */}
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
