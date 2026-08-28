"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  searchBrands,
  type SearchableBrand,
} from "@/features/discover/utils/brand-search";

export interface BrandSearchBarProps {
  brands: SearchableBrand[];
  selectedSlugs: string[];
  onToggleBrandSlug: (slug: string) => void;
  onClearAllBrands?: () => void;
  brandNameMap?: Record<string, string>;
}

export function BrandSearchBar({
  brands,
  selectedSlugs,
  onToggleBrandSlug,
  onClearAllBrands,
  brandNameMap,
}: BrandSearchBarProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Single search helper over in-memory catalogue (<1ms)
  const results = useMemo(() => {
    return searchBrands(brands, query);
  }, [brands, query]);

  // Keep highlighted item in bounds when results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [results.length, query]);

  // Global "/" keyboard shortcut to focus (safe against typing in editable elements)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable ||
        Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));

      if (!isEditable && e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll active item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setIsOpen(true);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        results.length > 0 ? (prev + 1) % results.length : 0,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        results.length > 0 ? (prev - 1 + results.length) % results.length : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[highlightedIndex]) {
        onToggleBrandSlug(results[highlightedIndex].slug);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  const getBrandDisplayName = (slug: string): string => {
    return (
      brandNameMap?.[slug] ??
      brands.find((b) => b.slug === slug)?.name ??
      slug
    );
  };

  return (
    <div ref={containerRef} className="relative w-full flex flex-col gap-2 font-sans">
      {/* Primary Input Container */}
      <div className="relative flex items-center w-full">
        {/* Search Icon */}
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#686e7b] pointer-events-none text-xs">
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search brands (e.g. Huel, Rhode, Garnier)..."
          aria-label="Search brands"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls="brand-search-results"
          role="combobox"
          className="w-full bg-[#0c0e14] border border-[#20242e] focus:border-[#d46b38] rounded-[3px] pl-9 pr-16 py-2 text-xs text-[#f3f4f6] placeholder:text-[#4e535e] focus:outline-none transition-colors"
        />

        {/* Action button: Clear query or Shortcut indicator */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="text-[#686e7b] hover:text-[#f3f4f6] text-xs px-1 cursor-pointer"
              aria-label="Clear search input"
            >
              ✕
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-[#686e7b] bg-[#14171f] border border-[#20242e] rounded-[2px] select-none pointer-events-none">
              /
            </kbd>
          )}
        </div>
      </div>

      {/* Selected Brand Pills Strip (when active) */}
      {selectedSlugs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-[10.5px] font-mono uppercase tracking-[0.05em] text-[#686e7b] mr-0.5">
            Active:
          </span>
          {selectedSlugs.map((slug) => (
            <span
              key={slug}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[#d46b3815] border border-[#d46b3840] text-[#f3f4f6] text-[11px] rounded-[2px] font-sans"
            >
              <span>{getBrandDisplayName(slug)}</span>
              <button
                type="button"
                onClick={() => onToggleBrandSlug(slug)}
                className="text-[#d46b38] hover:text-[#f3f4f6] cursor-pointer"
                aria-label={`Remove ${getBrandDisplayName(slug)} brand filter`}
              >
                ✕
              </button>
            </span>
          ))}
          {selectedSlugs.length > 1 && onClearAllBrands && (
            <button
              type="button"
              onClick={onClearAllBrands}
              className="text-[10px] font-mono text-[#686e7b] hover:text-[#f3f4f6] underline cursor-pointer ml-1"
            >
              Clear all brands
            </button>
          )}
        </div>
      )}

      {/* Autocomplete Dropdown List */}
      {isOpen && (
        <div
          id="brand-search-results"
          role="listbox"
          ref={listRef}
          className="absolute left-0 top-full mt-1 w-full max-h-72 overflow-y-auto bg-[#0c0e14] border border-[#20242e] rounded-[3px] shadow-[0_12px_36px_rgba(0,0,0,0.6)] z-50 p-1 flex flex-col gap-0.5 font-sans"
        >
          {results.length > 0 ? (
            results.map((b, idx) => {
              const isSelected = selectedSlugs.includes(b.slug);
              const isHighlighted = idx === highlightedIndex;

              return (
                <div
                  key={b.slug}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent input blur
                    onToggleBrandSlug(b.slug);
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`flex items-center justify-between gap-3 px-3 py-2 text-xs rounded-[2px] cursor-pointer transition-colors select-none ${
                    isHighlighted
                      ? "bg-[#161a24] text-[#f3f4f6]"
                      : "text-[#9da2ad] hover:text-[#f3f4f6]"
                  } ${isSelected ? "bg-[#d46b3810]" : ""}`}
                >
                  {/* Left: Checkbox + Brand Name + Category */}
                  <div className="flex items-center gap-2.5 truncate">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      readOnly
                      tabIndex={-1}
                      className="accent-[#d46b38] w-3.5 h-3.5 rounded-[2px] pointer-events-none"
                    />
                    <span
                      className={`truncate ${
                        isSelected ? "text-[#f3f4f6] font-medium" : "text-[#f3f4f6]"
                      }`}
                    >
                      {b.name}
                    </span>
                    {b.category && (
                      <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.04em] text-[#686e7b]">
                        {b.category}
                      </span>
                    )}
                  </div>

                  {/* Right: Creatives count (no internal IDs, no ads metric) */}
                  <span className="shrink-0 font-mono text-[10.5px] text-[#686e7b] tabular-nums">
                    {b.creativeCount} {b.creativeCount === 1 ? "creative" : "creatives"}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="py-6 text-center text-xs text-[#686e7b]">
              No brands matching &quot;{query}&quot;
            </div>
          )}
        </div>
      )}
    </div>
  );
}
