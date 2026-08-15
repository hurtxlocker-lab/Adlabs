"use client";

import { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

interface SearchBarProps {
  currentSearch?: string;
  currentFormat?: string;
  availableFormats?: string[];
}

export function SearchBar({
  currentSearch = "",
  currentFormat = "ALL",
  availableFormats = ["VIDEO"],
}: SearchBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const handleSearchChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value.trim()) {
      params.set("search", value.trim());
    } else {
      params.delete("search");
    }

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  };

  const handleFormatChange = (format: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (format !== "ALL") {
      params.set("format", format);
    } else {
      params.delete("format");
    }

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  };

  const filterOptions = ["ALL", ...availableFormats];

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
      {/* Search Input Box */}
      <div className="relative flex-1 group">
        <label htmlFor="ad-search" className="sr-only">
          Search ads by brand, copy, or source ID
        </label>
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500 group-focus-within:text-zinc-300 transition-colors">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.75}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        <input
          id="ad-search"
          type="search"
          defaultValue={currentSearch}
          placeholder="Search by brand, copy, headline, or ad ID..."
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full pl-10 pr-10 py-2 bg-[#12141a] border border-[#22252d] hover:border-zinc-700 focus:border-amber-500/70 focus:bg-[#151820] focus:outline-none text-sm text-zinc-100 placeholder-zinc-500 transition-all font-sans rounded-sm"
        />

        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          <span className="hidden sm:inline text-[11px] font-sans text-zinc-600">
            /
          </span>
        </div>
      </div>

      {/* Format Filters (only showing real available formats) */}
      {filterOptions.length > 1 && (
        <div
          className="flex items-center gap-1 self-end sm:self-auto"
          role="group"
          aria-label="Format Filter"
        >
          {filterOptions.map((fmt) => {
            const isSelected = currentFormat === fmt;
            return (
              <button
                key={fmt}
                type="button"
                onClick={() => handleFormatChange(fmt)}
                className={`px-3 py-1.5 text-xs font-sans tracking-wide transition-all rounded-sm ${
                  isSelected
                    ? "bg-[#1f232b] text-zinc-100 font-medium border border-zinc-700"
                    : "text-zinc-400 hover:text-zinc-200 border border-transparent"
                }`}
              >
                {fmt === "ALL" ? "All Formats" : fmt.charAt(0) + fmt.slice(1).toLowerCase()}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
