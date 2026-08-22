"use client";

import { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export interface LoadMoreButtonProps {
  currentLimit: number;
  increment?: number;
  totalCreativesCount: number;
  displayedCount: number;
}

/**
 * LoadMoreButton — Minimal editorial continuation control.
 *
 * Appends the next page slice (e.g. +72 creative groups) while maintaining
 * scroll position and deterministic server-side pagination.
 */
export function LoadMoreButton({
  currentLimit,
  increment = 72,
  totalCreativesCount,
  displayedCount,
}: LoadMoreButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleLoadMore = () => {
    const nextLimit = currentLimit + increment;
    const params = new URLSearchParams(searchParams.toString());
    params.set("limit", String(nextLimit));

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  return (
    <div className="w-full flex flex-col items-center justify-center pt-8 pb-4 gap-2">
      <button
        type="button"
        onClick={handleLoadMore}
        disabled={isPending}
        className="px-6 py-2.5 text-xs font-sans font-medium text-[#f3f4f6] bg-[#0c0e14] border border-[#2a2f3d] rounded-[3px] hover:border-[#d46b38] hover:text-[#e07945] active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer"
        aria-label={`Load next ${increment} creatives`}
      >
        {isPending ? "Loading..." : "Load more creatives"}
      </button>
      <span className="font-mono text-[11px] text-[#686e7b]">
        Showing {displayedCount} of {totalCreativesCount} creatives
      </span>
    </div>
  );
}
