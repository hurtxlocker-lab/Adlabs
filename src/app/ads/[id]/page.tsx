import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdLibraryItemById } from "@/features/ad-library";
import { formatDisplayFormat, formatFactualDate } from "@/features/ad-library/utils";
import { Header } from "@/components/navigation/header";
import { DetailMediaPlayer } from "@/features/discover/components/detail-media-player";
import { IntelligenceConsoleHero } from "@/features/ad-library/components/intelligence-console-hero";

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

  const variations = item.variations ?? [];
  const isMultiVariation = variations.length > 1;
  const formattedFormat = formatDisplayFormat(
    item.displayFormat,
    variations.length,
  );
  const siblings = item.dossier?.siblingDeployments ?? [];

  return (
    <div className="min-h-screen bg-[#080b12] text-[#f1f5f9] flex flex-col selection:bg-[#38bdf830]">
      <Header />

      <main className="flex-1 adlabs-canvas py-6 sm:py-8 pb-32 sm:pb-20 flex flex-col gap-8">
        {/* 1. Lean Identity Header Bar */}
        <div className="flex items-center justify-between py-2 border-b border-[#1e293b]/60">
          <Link
            href="/discover"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-sans text-[#94a3b8] hover:text-[#38bdf8] transition-colors"
          >
            <span>←</span>
            Discover
          </Link>

          <h1 className="text-lg sm:text-2xl font-normal tracking-tight text-white font-editorial uppercase">
            {item.brand.name}
          </h1>

          {item.adLibraryUrl ? (
            <a
              href={item.adLibraryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-sans text-[#94a3b8] hover:text-[#38bdf8] transition-colors inline-flex items-center gap-1 font-mono"
            >
              <span>Meta Library</span>
              <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <div className="w-12" />
          )}
        </div>

        {/* 2. INTELLIGENCE CONSOLE HERO (Dominant Surface) */}
        <section aria-label="Ad Intelligence Console Hero" className="w-full">
          <IntelligenceConsoleHero item={item} />
        </section>

        {isMultiVariation ? (
          /* =========================================================================
             DCO / CAROUSEL / MULTI-VARIATION SECONDARY REGION:
             - Copy Deck
             - Creative Variations
             - Deep Detail
             ========================================================================= */
          <div className="flex flex-col gap-10">
            {/* Compact Ad Copy / Primary Persuasion Deck */}
            {(item.headline || item.primaryText || item.description || item.ctaText) && (
              <section className="p-4 sm:p-5 bg-[#090b10] border border-[#161820] rounded-[6px] flex flex-col gap-3 max-w-3xl">
                {item.headline && (
                  <h2 className="text-xl sm:text-2xl font-medium text-[#f3f4f6] leading-snug font-editorial">
                    {item.headline}
                  </h2>
                )}

                {item.primaryText && (
                  <p className="text-sm text-[#9da2ad] leading-[1.75] font-sans whitespace-pre-line border-l-2 border-[#1c202a] pl-3.5">
                    {item.primaryText}
                  </p>
                )}

                {item.description && (
                  <p className="text-xs text-[#686e7b] leading-relaxed font-sans">
                    {item.description}
                  </p>
                )}

                {item.ctaText && (
                  <div className="flex items-center gap-3 pt-2 border-t border-[#161820]">
                    <span className="px-3 py-1 text-xs font-sans font-medium bg-[#12151b] text-[#f3f4f6] border border-[#20242e] rounded-[3px]">
                      {item.ctaText}
                    </span>
                    {item.destinationUrl && (
                      <a
                        href={item.destinationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-sans text-[#9da2ad] hover:text-[#e07945] transition-colors truncate max-w-sm"
                      >
                        {item.destinationUrl}
                      </a>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Creative Variations Deck */}
            <section className="flex flex-col gap-6">
              <div className="flex items-center justify-between border-b border-[#16181f] pb-3">
                <h2 className="text-xs font-mono text-[#8e95a2] uppercase tracking-wider">
                  Creative Variations ({variations.length})
                </h2>
                <span className="font-mono text-xs text-[#686e7b]">
                  {formattedFormat}
                </span>
              </div>

              <div className="flex flex-col divide-y divide-[#16181f]">
                {variations.map((variation, idx) => {
                  const variationPrimaryMedia =
                    variation.media.find((m) => m.role !== "preview") ??
                    variation.media[0];
                  const variationPreview = variation.media.find(
                    (m) => m.role === "preview",
                  );
                  const isVideo = variationPrimaryMedia?.mediaType === "VIDEO";

                  return (
                    <div
                      key={variation.id}
                      className={`flex flex-col gap-4 ${idx > 0 ? "pt-10" : ""}`}
                    >
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

                      {/* Media Display */}
                      <div className="relative w-full max-w-2xl bg-[#030406] border border-[#161820] flex items-center justify-center min-h-[380px] sm:min-h-[460px] max-h-[660px] overflow-hidden rounded-[4px]">
                        <div className="absolute inset-0 w-full h-full flex items-center justify-center">
                          {isVideo && variationPrimaryMedia ? (
                            <video
                              src={variationPrimaryMedia.mediaUrl}
                              poster={variationPreview?.detailImageUrl ?? variationPreview?.mediaUrl}
                              preload="none"
                              controls
                              playsInline
                              className="w-full h-full max-w-full max-h-full object-contain object-center"
                            />
                          ) : variationPrimaryMedia ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={variationPrimaryMedia.detailImageUrl ?? variationPrimaryMedia.mediaUrl}
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

                      {/* Variation Copy */}
                      {(variation.headline || variation.body || variation.description) && (
                        <div className="flex flex-col gap-2 pt-1 max-w-2xl">
                          {variation.headline && (
                            <h3 className="font-editorial text-xl text-[#f3f4f6] leading-snug">
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
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        ) : (
          /* =========================================================================
             SINGLE CREATIVE SECONDARY REGION:
             Two-Column Composition:
             Left (7 cols): Dominant Media Player
             Right (5 cols): Compact Copy & CTA Deck
             ========================================================================= */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            {/* Left: Creative Media Evidence (7 cols) */}
            <section className="lg:col-span-7 flex flex-col gap-4">
              <DetailMediaPlayer item={item} />
            </section>

            {/* Right: Compact Editorial Copy & CTA Deck (5 cols) */}
            <section className="lg:col-span-5 flex flex-col gap-4">
              <div className="flex flex-col gap-3.5 p-4 sm:p-5 bg-[#090b10] border border-[#161820] rounded-[6px]">
                {item.headline && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-mono text-[#8e95a2] uppercase tracking-wider">
                      Headline
                    </span>
                    <p className="text-xl font-medium text-[#f3f4f6] leading-snug font-editorial">
                      {item.headline}
                    </p>
                  </div>
                )}

                {item.primaryText && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-mono text-[#8e95a2] uppercase tracking-wider">
                      Creative Copy
                    </span>
                    <p className="text-sm text-[#9da2ad] leading-[1.75] font-sans whitespace-pre-line border-l-2 border-[#1c202a] pl-3.5">
                      {item.primaryText}
                    </p>
                  </div>
                )}

                {item.description && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-mono text-[#8e95a2] uppercase tracking-wider">
                      Description
                    </span>
                    <p className="text-xs text-[#686e7b] leading-relaxed font-sans">
                      {item.description}
                    </p>
                  </div>
                )}

                {item.ctaText && (
                  <div className="flex items-center gap-3 pt-2.5 border-t border-[#161820]">
                    <span className="px-3 py-1 text-xs font-sans font-medium bg-[#12151b] text-[#f3f4f6] border border-[#20242e] rounded-[3px]">
                      {item.ctaText}
                    </span>
                    {item.destinationUrl && (
                      <a
                        href={item.destinationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-sans text-[#9da2ad] hover:text-[#e07945] transition-colors truncate max-w-[200px]"
                      >
                        {item.destinationUrl}
                      </a>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* 3. Deep Detail: Sibling Deployments (only if exact creative reuse >= 2) */}
        {siblings.length > 0 && (
          <section className="pt-6 border-t border-[#16181f] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-xs text-[#8e95a2] uppercase tracking-wider">
                Exact Creative Deployments ({item.dossier?.exactCreativeReuseCount ?? siblings.length + 1})
              </h3>
              <span className="text-xs text-[#686e7b]">
                Other ads by {item.brand.name} sharing this exact representative creative binary
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {siblings.map((sib) => (
                <Link
                  key={sib.id}
                  href={`/ads/${sib.id}`}
                  className="flex flex-col gap-1.5 p-3 bg-[#090b10] border border-[#161820] hover:border-[#2a2f3d] transition-colors rounded-[4px] group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-[#f3f4f6] group-hover:text-[#e07945] transition-colors">
                      Meta Ad {sib.sourceAdId}
                    </span>
                    <div className="flex items-center gap-1">
                      {sib.hasEuEvidence && (
                        <span className="px-1 py-0.2 bg-[#12151b] border border-[#2a303f] font-mono text-[9px] text-[#8e95a2] rounded-[2px]">
                          EU
                        </span>
                      )}
                      {sib.hasUkEvidence && (
                        <span className="px-1 py-0.2 bg-[#12151b] border border-[#1e222d] font-mono text-[9px] text-[#686e7b] rounded-[2px]">
                          UK
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#686e7b]">
                    <span>{formatFactualDate(sib.firstSeenAt)}</span>
                    <span>→</span>
                    <span>{formatFactualDate(sib.lastSeenAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Grounded Footer */}
      <footer className="w-full border-t border-[#16181f] py-6 bg-[#050608] text-xs font-sans text-[#686e7b]">
        <div className="adlabs-canvas flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="tracking-tight">AdLabs</span>
          <span className="font-mono text-xs text-[#8e95a2]">
            Concentrated Ad Intelligence Hero
          </span>
        </div>
      </footer>
    </div>
  );
}
