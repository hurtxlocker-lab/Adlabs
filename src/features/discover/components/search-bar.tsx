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
    <div className="w-full flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
      {/* Search Input Aperture */}
      <div className="relative flex-1 group">
        <label htmlFor="ad-search" className="sr-only">
          Search creatives by brand, copy, or headline
        </label>
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#686e7b] group-focus-within:text-[#9da2ad] transition-colors">
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
              strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        <input
          id="ad-search"
          type="search"
          defaultValue={currentSearch}
          placeholder="Search by brand, copy, headline, or ID..."
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full pl-10 pr-10 py-2.5 bg-[#0c0e13] border border-[#1c202a] hover:border-[#2a2f3d] focus:border-[#d46b38] focus:bg-[#10131a] focus:outline-none text-sm text-[#f3f4f6] placeholder-[#686e7b] transition-all font-sans rounded-none"
        />

        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          <span className="hidden sm:inline text-xs font-mono text-[#686e7b] bg-[#141720] border border-[#1e222d] px-1.5 py-0.5">
            /
          </span>
        </div>
      </div>

      {/* Clean Typographic Format Toggles */}
      {filterOptions.length > 1 && (
        <div
          className="flex items-center gap-3 self-start sm:self-auto pt-1 sm:pt-0"
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
                className={`px-2 py-1 text-xs font-sans tracking-wide transition-colors ${
                  isSelected
                    ? "text-[#f3f4f6] font-medium border-b border-[#d46b38] pb-1"
                    : "text-[#686e7b] hover:text-[#9da2ad] border-b border-transparent pb-1"
                }`}
              >
                {fmt === "ALL"
                  ? "All"
                  : fmt.charAt(0) + fmt.slice(1).toLowerCase()}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
