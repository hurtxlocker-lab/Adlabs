"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BrandDirectoryItem } from "@/features/brands/queries";

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

export function BrandAtlasControls({
  entries,
  activeLens = "MOST_CREATIVES",
}: {
  /** Server-sorted entries for the ACTIVE lens (arrive via URL param). */
  entries: BrandDirectoryItem[];
  activeLens?: SortLens;
}) {
  const router = useRouter();
  // useTransition: buttons stay clickable during flight; every click starts a
  // new transition (Next serializes same-tab navigations — last one wins).
  // The URL param is the single source of truth for which lens is active.
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");

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
        (e.brand.category ?? "").toLowerCase().includes(q),
    );
  }, [entries, query]);

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-4"
      data-filtered-count={filtered.length}
    >
      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search brands or categories…"
          aria-label="Search brands"
          className="w-72 rounded-[3px] border border-[#20242e] bg-[#0c0e14] px-3 py-2 font-mono text-xs text-[#f3f4f6] placeholder:text-[#4e535e] focus:border-[#d46b38] focus:outline-none"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] text-[#4e535e]">
          /
        </kbd>
      </div>

      {/* Sort lenses — URL-param authoritative. aria-pressed reflects SERVER truth
          (activeLens prop), never optimistic guesses. isPending shows a subtle
          spinner on the whole group while the next lens loads. Buttons always
          clickable — last click wins. */}
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
  );
}

export { LENS_NARRATION };
