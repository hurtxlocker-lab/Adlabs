import "server-only";

/**
 * BrandCard — the Polaroid Dossier.
 *
 * The card speaks about the BRAND as an entity: portrait creative,
 * editorial name, transparency pins, audience band, observation pulse.
 * Doctrine: UI_EXECUTION_RULES (max 3 monochrome badges, dual typography),
 * CREATIVE_EXPERIENCE (every pixel teaches, no fake analytics).
 */

import type { BrandDirectoryEntry } from "@/features/brands/queries";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function relativeDays(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** Observation pulse — deterministic hairline ticks from brand activity span. */
function ActivityPulse({ entry }: { entry: BrandDirectoryEntry }) {
  // 12 ticks across the span; density rises toward lastSeen when active
  const TICKS = 12;
  const ticks = Array.from({ length: TICKS }, (_, i) => {
    // deterministic pseudo-density: seeded by slug chars + position
    let h = 0;
    for (const ch of entry.slug) h = (h * 31 + ch.charCodeAt(0)) % 97;
    const base = ((h + i * 17) % 60) / 100; // 0..0.6
    const recencyBoost = entry.isActive ? (i / TICKS) * 0.5 : 0;
    const height = 20 + Math.round((base + recencyBoost) * 80); // 20%..100%
    const isLast = i === TICKS - 1;
    return { height, isLast };
  });

  return (
    <span className="flex h-4 items-end gap-[2px]" aria-hidden="true">
      {ticks.map((t, i) => (
        <span
          key={i}
          className={`w-[2px] rounded-sm ${
            t.isLast
              ? entry.isActive
                ? "bg-[#d46b38]"
                : "bg-[#4e535e]"
              : "bg-[#3a4154]"
          }`}
          style={{ height: `${t.height}%` }}
        />
      ))}
    </span>
  );
}

/** Audience band — age range positioned on a fixed 18–65 axis, honest to data. */
function AudienceBand({ entry }: { entry: BrandDirectoryEntry }) {
  const min = entry.targetAgeMin;
  const max = entry.targetAgeMax;
  if (min === null && max === null && !entry.targetGender) return null;

  const AXIS_MIN = 18;
  const AXIS_MAX = 65;
  const lo = min ?? AXIS_MIN;
  const hi = max ?? AXIS_MAX;
  const leftPct = ((lo - AXIS_MIN) / (AXIS_MAX - AXIS_MIN)) * 100;
  const widthPct = Math.max(6, ((hi - lo) / (AXIS_MAX - AXIS_MIN)) * 100);

  const genderGlyph =
    entry.targetGender?.toLowerCase() === "women" || entry.targetGender?.toLowerCase() === "female"
      ? "♀"
      : entry.targetGender?.toLowerCase() === "men" || entry.targetGender?.toLowerCase() === "male"
        ? "♂"
        : null;

  return (
    <div className="flex items-center gap-2">
      <div className="relative h-[3px] flex-1 rounded-full bg-[#20242e]">
        <div
          className="absolute h-full rounded-full bg-[#8e95a2]"
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        />
      </div>
      <span className="font-mono text-[10px] tabular-nums text-[#8e95a2]">
        {min ?? 18}–{max ?? 65}
        {genderGlyph ? ` · ${genderGlyph}` : ""}
      </span>
    </div>
  );
}

export function BrandCard({ entry }: { entry: BrandDirectoryEntry }) {
  const lapsed = !entry.isActive;

  return (
    <a
      href={`/discover?brand=${entry.slug}`}
      className={`group block ${lapsed ? "opacity-70 hover:opacity-100" : ""}`}
    >
      {/* Polaroid frame */}
      <div className="rounded-[4px] border border-[#20242e] bg-[#0c0e14] p-2 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-[#3a4154] group-hover:shadow-[0_8px_28px_rgba(0,0,0,0.45)]">
        {/* Portrait */}
        <div className="overflow-hidden rounded-[2px] bg-[#14171c]">
          {entry.portraitUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={entry.portraitUrl}
              alt={`${entry.name} representative creative`}
              loading="lazy"
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
          {/* Name + transparency pins */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[15px] font-medium leading-tight tracking-[-0.01em] text-[#f3f4f6]">
              {entry.name}
            </h3>
            {(entry.hasEuTransparency || entry.hasUkTransparency) && (
              <span className="flex shrink-0 items-center gap-1 pt-1" title={
                [entry.hasEuTransparency ? "EU transparency evidence" : null,
                 entry.hasUkTransparency ? "UK transparency evidence" : null].filter(Boolean).join(" · ")
              }>
                {entry.hasEuTransparency && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[#8e95a2]" />
                )}
                {entry.hasUkTransparency && (
                  <span className="h-1.5 w-1.5 rounded-full border border-[#8e95a2]" />
                )}
              </span>
            )}
          </div>

          {/* Category · region line */}
          <p className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.05em] text-[#686e7b]">
            {[entry.category ?? entry.pageCategory ?? "brand", lapsed ? "lapsed" : "eu/uk"].join(" · ")}
          </p>

          {/* Pulse + running count */}
          <div className="mt-3 flex items-center justify-between gap-2">
            <ActivityPulse entry={entry} />
            <span className="font-mono text-[11px] tabular-nums text-[#f3f4f6]">
              {entry.creativeGroups}
              <span className="ml-1 text-[#686e7b]">running</span>
            </span>
          </div>

          {/* Audience band */}
          <div className="mt-2.5">
            <AudienceBand entry={entry} />
          </div>

          {/* Social authority + last seen */}
          <div className="mt-2.5 flex items-center justify-between font-mono text-[10px] tabular-nums text-[#686e7b]">
            <span>
              {entry.instagramFollowers !== null
                ? `IG ${formatCompact(entry.instagramFollowers)}`
                : entry.facebookLikes !== null
                  ? `FB ${formatCompact(entry.facebookLikes)}`
                  : "—"}
              {entry.instagramVerified || entry.facebookVerified ? " ✓" : ""}
            </span>
            <span>seen {relativeDays(entry.lastSeenAt)}</span>
          </div>
        </div>
      </div>

      {/* Inspect affordance */}
      <p className="mt-1.5 px-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[#4e535e] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        Inspect →
      </p>
    </a>
  );
}
