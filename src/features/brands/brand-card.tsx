import "server-only";

/**
 * BrandCard — the Polaroid Dossier.
 *
 * Consumes the BrandDirectoryItem read model. No SQL/projection knowledge.
 * Card contract: portrait, brand, category, creative activity (context line
 * per lens), EU/UK labels. Truthful text only — no fake analytics.
 */

import type { BrandDirectoryItem } from "@/features/brands/queries";

export type LensKind = "MOST_CREATIVES" | "RECENTLY_ACTIVE" | "REACH_SCALE" | "SOCIAL_AUTHORITY";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

/** Truthful recency text — no invented activity history. */
function recencyText(lastSeenAt: Date, now = Date.now()): string {
  const days = Math.floor((now - lastSeenAt.getTime()) / 86_400_000);
  if (days <= 0) return "Seen today";
  if (days === 1) return "Seen 1d ago";
  if (days < 30) return `Seen ${days}d ago`;
  if (days < 365) return `Lapsed · last seen ${Math.floor(days / 30)}mo ago`;
  return `Lapsed · last seen ${Math.floor(days / 365)}y ago`;
}

/** Contextual intelligence line per active lens — makes ordering legible. */
function contextLine(
  item: BrandDirectoryItem,
  lens: LensKind,
): string {
  const { creativeFootprint: cf, transparency: t, authority: a } = item;
  switch (lens) {
    case "RECENTLY_ACTIVE":
      return recencyText(cf.lastSeenAt);
    case "REACH_SCALE":
      return t.peakEuReach !== null
        ? `Peak EU reach ${formatCompact(t.peakEuReach)}`
        : "No EU reach disclosed";
    case "SOCIAL_AUTHORITY":
      return a.instagramFollowers !== null
        ? `Instagram ${formatCompact(a.instagramFollowers)}`
        : a.facebookLikes !== null
          ? `Facebook ${formatCompact(a.facebookLikes)}`
          : "No authority data";
    case "MOST_CREATIVES":
    default:
      if (cf.libraryTotalAds !== null) {
        return `${cf.libraryTotalAds.toLocaleString()} ads in library`;
      }
      return cf.activeCreativeCount > 0
        ? `${cf.creativeCount} scraped creatives · ${cf.activeCreativeCount} active`
        : `${cf.creativeCount} scraped creatives`;
  }
}

export function BrandCard({
  item,
  lens = "MOST_CREATIVES",
  eager = false,
}: {
  item: BrandDirectoryItem;
  lens?: LensKind;
  /** True for the first likely-LCP portrait: loads eager with high priority. */
  eager?: boolean;
}) {
  // Server component render: reading the clock here is intentional and stable per request.
  // eslint-disable-next-line react-hooks/purity -- see comment above
  const nowMs = Date.now();
  const lapsed = nowMs - item.creativeFootprint.lastSeenAt.getTime() > 14 * 86_400_000;

  // First likely LCP portrait is eager/high; the page passes eager via prop order.
  return (
    <a
      href={`/discover?brand=${item.brand.slug}`}
      className={`group block ${lapsed ? "opacity-70 hover:opacity-100" : ""}`}
    >
      {/* Polaroid frame */}
      <div className="rounded-[4px] border border-[#20242e] bg-[#0c0e14] p-2 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-[#3a4154] group-hover:shadow-[0_8px_28px_rgba(0,0,0,0.45)]">
        {/* Portrait */}
        <div className="overflow-hidden rounded-[2px] bg-[#14171c]">
          {item.portrait ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.portrait.url}
              alt={`${item.brand.name} representative creative`}
              loading={eager ? "eager" : "lazy"}
              fetchPriority={eager ? "high" : "auto"}
              decoding="async"
              className="aspect-[4/5] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex aspect-[4/5] w-full items-center justify-center">
              <span className="font-mono text-xs text-[#4e535e]">no creative</span>
            </div>
          )}
        </div>

        {/* Dossier body */}
        <div className="px-1 pb-1 pt-3">
          {/* Name + explicit transparency labels */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[15px] font-medium leading-tight tracking-[-0.01em] text-[#f3f4f6]">
              {item.brand.name}
            </h3>
            {(item.transparency.hasEuEvidence || item.transparency.hasUkEvidence) && (
              <span className="shrink-0 pt-1 font-mono text-[10px] uppercase tracking-[0.06em] text-[#8e95a2]">
                {[
                  item.transparency.hasEuEvidence ? "EU" : null,
                  item.transparency.hasUkEvidence ? "UK" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
          </div>

          {/* Category line */}
          <p className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.05em] text-[#686e7b]">
            {item.brand.category ?? "Brand"}
          </p>

          {/* Contextual intelligence line (lens-aware) */}
          <p className="mt-3 font-mono text-[11px] tabular-nums text-[#f3f4f6]">
            {contextLine(item, lens)}
          </p>

          {/* Secondary deployment fact — never promoted above the lens line.
              Factual only: canonical ad deployments currently Running. */}
          {item.creativeFootprint.libraryTotalAds !== null ? (
            <p className="mt-1 font-mono text-[10px] tabular-nums text-[#686e7b]">
              {item.creativeFootprint.creativeCount} in corpus
              {item.creativeFootprint.activeCreativeCount > 0
                ? ` · ${item.creativeFootprint.activeCreativeCount} active`
                : ""}
            </p>
          ) : (
            item.creativeFootprint.activeAdCount > 0 && (
              <p className="mt-1 font-mono text-[10px] tabular-nums text-[#686e7b]">
                {item.creativeFootprint.activeAdCount} active ads in corpus
              </p>
            )
          )}

          {/* Honest recency for non-recency lenses */}
          {lens !== "RECENTLY_ACTIVE" && (
            <p className="mt-1 font-mono text-[10px] text-[#686e7b]">
              {recencyText(item.creativeFootprint.lastSeenAt)}
            </p>
          )}

          {/* Target age ranges — EU/UK transparency disclosures kept SEPARATE
              (independent regional targeting regimes; never merged into one
              envelope). Source term: "target age" — declared targeting
              constraints, NOT observed audience composition. Rendered only when
              the region actually discloses it; no fake fallback. */}
          {((item.transparency.euTargetAgeMin !== null && item.transparency.euTargetAgeMax !== null) ||
            (item.transparency.ukTargetAgeMin !== null && item.transparency.ukTargetAgeMax !== null)) && (
            <p
              className="mt-1 font-mono text-[10px] text-[#686e7b]"
              title="Target age range disclosed in EU/UK transparency data — declared targeting, not observed audience."
            >
              {[
                item.transparency.euTargetAgeMin !== null && item.transparency.euTargetAgeMax !== null
                  ? `EU ${item.transparency.euTargetAgeMin}–${item.transparency.euTargetAgeMax}`
                  : null,
                item.transparency.ukTargetAgeMin !== null && item.transparency.ukTargetAgeMax !== null
                  ? `UK ${item.transparency.ukTargetAgeMin}–${item.transparency.ukTargetAgeMax}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}

          {/* Combined reported EU reach — subordinate except on REACH_SCALE.
              SUM of per-ad disclosures; people may be counted more than once.
              Never impressions / unique reach / brand reach. */}
          {lens === "REACH_SCALE" &&
            item.transparency.combinedEuReach !== null &&
            item.transparency.combinedEuReach > 0 && (
              <p
                className="mt-0.5 font-mono text-[10px] text-[#8e95a2]"
                title="Sum of reported EU reach across observed ads. People may be counted more than once."
              >
                Combined reported EU reach {formatCompact(item.transparency.combinedEuReach)}
              </p>
            )}
        </div>
      </div>

      {/* Inspect affordance */}
      <p className="mt-1.5 px-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[#4e535e] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        Inspect →
      </p>
    </a>
  );
}
