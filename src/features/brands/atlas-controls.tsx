"use client";

import { useMemo, useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { BrandDirectoryItem } from "@/features/brands/queries";
import type { LensKind } from "@/features/brands/brand-card";

export type SortLens = "MOST_CREATIVES" | "RECENTLY_ACTIVE" | "REACH_SCALE" | "SOCIAL_AUTHORITY";

const LENSES: Array<{ id: SortLens; label: string }> = [
  { id: "MOST_CREATIVES", label: "Most Creatives" },
  { id: "RECENTLY_ACTIVE", label: "Recently Active" },
  { id: "REACH_SCALE", label: "Reach Scale" },
  { id: "SOCIAL_AUTHORITY", label: "Social Authority" },
];

const LENS_NARRATION: Record<SortLens, string> = {
  MOST_CREATIVES: "Ranked by disclosed creative volume.",
  RECENTLY_ACTIVE: "Ranked by latest observation recency.",
  REACH_SCALE: "Ranked by disclosed EU reach — where reported.",
  SOCIAL_AUTHORITY: "Ranked by Instagram audience size — where known.",
};

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function recencyText(lastSeenAt: Date, now = Date.now()): string {
  const days = Math.floor((now - lastSeenAt.getTime()) / 86_400_000);
  if (days <= 0) return "Seen today";
  if (days === 1) return "Seen 1d ago";
  if (days < 30) return `Seen ${days}d ago`;
  if (days < 365) return `Lapsed · last seen ${Math.floor(days / 30)}mo ago`;
  return `Lapsed · last seen ${Math.floor(days / 365)}y ago`;
}

function contextLine(item: BrandDirectoryItem, lens: LensKind): string {
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
    default:
      return cf.activeCreativeCount > 0
        ? `${cf.creativeCount} creatives · ${cf.activeCreativeCount} active`
        : `${cf.creativeCount} creatives`;
  }
}

/** Client-safe Brand Card item for live-filtered list rendering */
function ClientBrandCard({
  item,
  lens = "MOST_CREATIVES",
  eager = false,
}: {
  item: BrandDirectoryItem;
  lens?: LensKind;
  eager?: boolean;
}) {
  const nowMs = Date.now();
  const lastSeenDate =
    item.creativeFootprint.lastSeenAt instanceof Date
      ? item.creativeFootprint.lastSeenAt
      : new Date(item.creativeFootprint.lastSeenAt);
  const lapsed = nowMs - lastSeenDate.getTime() > 14 * 86_400_000;

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

          {/* Secondary deployment fact */}
          {item.creativeFootprint.activeAdCount > 0 && (
            <p className="mt-1 font-mono text-[10px] tabular-nums text-[#686e7b]">
              {item.creativeFootprint.activeAdCount} active ads
            </p>
          )}

          {/* Honest recency for non-recency lenses */}
          {lens !== "RECENTLY_ACTIVE" && (
            <p className="mt-1 font-mono text-[10px] text-[#686e7b]">
              {recencyText(lastSeenDate)}
            </p>
          )}

          {/* Target age ranges */}
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

          {/* Combined reported EU reach */}
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

export function BrandAtlasView({
  entries,
  activeLens = "MOST_CREATIVES",
}: {
  /** Server-sorted entries for the ACTIVE lens (arrive via URL param). */
  entries: BrandDirectoryItem[];
  activeLens?: SortLens;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Global '/' keyboard shortcut to focus search input
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function selectLens(next: SortLens) {
    startTransition(() => {
      router.push(`/brands?sort=${next}`, { scroll: false });
    });
  }

  // Client-side search filter — instant UI response (SLO <50ms), server owns ordering.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.brand.name.toLowerCase().includes(q) ||
        (e.brand.category ?? "").toLowerCase().includes(q) ||
        e.brand.slug.toLowerCase().includes(q),
    );
  }, [entries, query]);

  const narration = LENS_NARRATION[activeLens] ?? "";

  return (
    <div className="flex flex-col gap-8">
      {/* Controls Bar */}
      <section aria-label="Directory controls" className="mt-2 flex flex-col gap-3">
        <div
          className="flex flex-wrap items-center justify-between gap-4"
          data-filtered-count={filtered.length}
        >
          {/* Search */}
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search brands or categories…"
              aria-label="Search brands"
              className="w-72 rounded-[3px] border border-[#20242e] bg-[#0c0e14] px-3 py-2 font-mono text-xs text-[#f3f4f6] placeholder:text-[#4e535e] focus:border-[#d46b38] focus:outline-none"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-[#686e7b] hover:text-[#f3f4f6]"
              >
                ✕
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] text-[#4e535e]">
                /
              </kbd>
            )}
          </div>

          {/* Sort lenses */}
          <div role="group" aria-label="Sort lens" className="flex items-center gap-1">
            {LENSES.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => selectLens(l.id)}
                aria-pressed={l.id === activeLens}
                className={`rounded-[3px] px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.05em] transition-colors ${
                  l.id === activeLens && !isPending
                    ? "bg-[#1c2026] text-[#f3f4f6] ring-1 ring-inset ring-[#d46b38]"
                    : "text-[#686e7b] hover:text-[#f3f4f6]"
                }`}
              >
                {l.label}
              </button>
            ))}
            {isPending && (
              <span
                className="ml-1 h-2.5 w-2.5 animate-spin rounded-full border border-[#8e95a2] border-t-transparent"
                aria-label="Loading sorted results"
              />
            )}
          </div>
        </div>

        {/* Active lens narration */}
        <p className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[#4e535e]">
          {narration}
          {query && (
            <span className="ml-2 lowercase text-[#8e95a2]">
              ({filtered.length} of {entries.length} brands matching &ldquo;{query}&rdquo;)
            </span>
          )}
        </p>
      </section>

      {/* Polaroid Wall Grid */}
      {entries.length === 0 ? (
        <div className="mt-12 rounded-[4px] border border-dashed border-[#20242e] py-24 text-center">
          <p className="font-mono text-sm text-[#686e7b]">No brands in the atlas yet.</p>
          <p className="mt-1 font-mono text-xs text-[#4e535e]">
            Ingestion populates this landscape.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-12 rounded-[4px] border border-dashed border-[#20242e] py-16 text-center">
          <p className="font-mono text-sm text-[#8e95a2]">
            No brands matching &ldquo;{query}&rdquo;
          </p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="mt-3 font-mono text-xs text-[#d46b38] underline hover:text-[#f3f4f6]"
          >
            Clear filter
          </button>
        </div>
      ) : (
        <section
          aria-label="Brand dossiers"
          className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        >
          {filtered.map((item, idx) => (
            <ClientBrandCard
              key={item.brand.slug}
              item={item}
              lens={activeLens}
              eager={idx === 0}
            />
          ))}
        </section>
      )}
    </div>
  );
}

/** Backward-compatible export for standalone controls */
export function BrandAtlasControls({
  entries,
  activeLens = "MOST_CREATIVES",
}: {
  entries: BrandDirectoryItem[];
  activeLens?: SortLens;
}) {
  return <BrandAtlasView entries={entries} activeLens={activeLens} />;
}

export { LENS_NARRATION };
