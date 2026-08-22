"use client";

/**
 * ActiveFilterTokens — compact removable tokens for the active filter state.
 *
 * Displays primary filtered creative group count and active filter tokens.
 */

export interface ActiveFilterToken {
  label: string;
  onRemove: () => void;
}

export interface ActiveFilterTokensProps {
  tokens: ActiveFilterToken[];
  totalCount: number;
  totalAdsCount?: number;
  onClearAll: () => void;
}

export function ActiveFilterTokens({
  tokens,
  totalCount,
  totalAdsCount,
  onClearAll,
}: ActiveFilterTokensProps) {
  const hasActiveFilters = tokens.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#16181f]/60">
      <span
        className="text-[11px] font-mono text-[#686e7b] mr-1"
        aria-live="polite"
      >
        Showing {totalCount.toLocaleString()} {totalCount === 1 ? "creative" : "creatives"}
        {totalAdsCount && totalAdsCount > totalCount ? (
          <span className="text-[#525866] ml-1">({totalAdsCount.toLocaleString()} ads)</span>
        ) : null}
      </span>

      {tokens.map((token, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-sans border border-[#d46b3840] text-[#d46b38] bg-[#d46b380c]"
        >
          {token.label}
          <button
            type="button"
            onClick={token.onRemove}
            aria-label={`Remove ${token.label} filter`}
            className="hover:text-[#f3f4f6] transition-colors ml-0.5 text-[#d46b3880]"
          >
            ×
          </button>
        </span>
      ))}

      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-[11px] font-sans text-[#686e7b] hover:text-[#9da2ad] transition-colors underline underline-offset-2 ml-1"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
