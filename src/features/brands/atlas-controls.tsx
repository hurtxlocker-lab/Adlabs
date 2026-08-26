"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BrandDirectoryEntry } from "@/features/brands/queries";

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
  entries: BrandDirectoryEntry[];
  activeLens?: SortLens;
}) {
  const router = useRouter();
  const [lens, setLens] = useState<SortLens>(activeLens);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);

  // Client-side search filter — instant UI response (SLO <50ms), server owns ordering.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.category ?? "").toLowerCase().includes(q) ||
        (e.pageCategory ?? "").toLowerCase().includes(q),
    );
  }, [entries, query]);

  // Expose filtered count for the parent grid via data attribute on the section root

  function selectLens(next: SortLens) {
    if (next === lens) return;
    setLens(next);
    setPending(true);
    // Server round-trip carries the SQL ORDER BY — deterministic ranking authority.
    router.push(`/brands?sort=${next}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4" data-filtered-count={filtered.length}>
      {/* Search — instant client-side filter */}
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

      {/* Sort lenses — server-authoritative ordering */}
      <div role="group" aria-label="Sort lens" className="flex items-center gap-1">
        {LENSES.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => selectLens(l.id)}
            aria-pressed={lens === l.id}
            disabled={pending}
            className={`rounded-[3px] px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.05em] transition-colors disabled:opacity-60 ${
              lens === l.id
                ? "bg-[#1c2026] text-[#f3f4f6] ring-1 ring-inset ring-[#d46b38]"
                : "text-[#686e7b] hover:text-[#f3f4f6]"
            }`}
          >
            {l.label}
          </button>
        ))}
        {pending && (
          <span className="ml-1 h-3 w-3 animate-spin rounded-full border border-[#4e535e] border-t-transparent" />
        )}
      </div>
    </div>
  );
}

export { LENS_NARRATION };
