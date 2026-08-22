import { formatCompactNumber } from "@/features/discover/utils/formatters";

export interface EvidenceOverlayProps {
  hasEuEvidence?: boolean;
  euReach?: bigint | number | null;
  hasUkEvidence?: boolean;
  ukReach?: bigint | number | null;
  className?: string;
}

/**
 * Formats regional reach cleanly into compact representation (e.g. 24.8K, 1.2M).
 * Returns null if reach is missing, null, or <= 0 (never co-erces to 0).
 */
export function formatRegionalReach(reach: bigint | number | null | undefined): string | null {
  if (reach === null || reach === undefined) return null;
  const num = typeof reach === "bigint" ? Number(reach) : reach;
  if (num <= 0 || isNaN(num)) return null;
  return formatCompactNumber(num);
}

/**
 * Signature AdLabs Gallery evidence overlay artifact.
 *
 * Rendered directly ON the creative as a small ink slab with a terracotta marker dot.
 * Reflects verified EU / UK transparency facts only. Never guesses or estimates.
 */
export function EvidenceOverlay({
  hasEuEvidence,
  euReach,
  hasUkEvidence,
  ukReach,
  className = "",
}: EvidenceOverlayProps) {
  const formattedEuReach = formatRegionalReach(euReach);
  const formattedUkReach = formatRegionalReach(ukReach);

  let label: string | null = null;
  let accessibleLabel: string | null = null;

  if (hasEuEvidence) {
    if (formattedEuReach) {
      label = `EU · ${formattedEuReach}`;
      accessibleLabel = `EU transparency evidence: ${formattedEuReach} verified reach`;
    } else {
      label = "EU evidence";
      accessibleLabel = "EU transparency evidence present (reach unavailable)";
    }
  } else if (hasUkEvidence) {
    if (formattedUkReach) {
      label = `UK · ${formattedUkReach}`;
      accessibleLabel = `UK transparency evidence: ${formattedUkReach} verified reach`;
    } else {
      label = "UK evidence";
      accessibleLabel = "UK transparency evidence present (reach unavailable)";
    }
  }

  if (!label) {
    return null;
  }

  return (
    <div
      className={`absolute top-2 left-2 z-10 inline-flex items-center gap-1.5 px-2 py-0.5 bg-[#07080a]/90 border border-white/10 rounded-[3px] font-mono text-[10px] sm:text-[11px] text-[#e5e7eb] tracking-wide select-none pointer-events-none ${className}`}
      aria-label={accessibleLabel ?? label}
    >
      <span
        className="w-1.5 h-1.5 rounded-full bg-[#d46b38] shrink-0"
        aria-hidden="true"
      />
      <span>{label}</span>
    </div>
  );
}
