"use client";

import type { AdLibraryItem } from "@/features/ad-library/types";
import { GalleryAdCard } from "./gallery-ad-card";
import type { DiscoveryGalleryFacts } from "@/features/discover/queries/gallery-facts";

export interface CanonicalGalleryProps {
  items: AdLibraryItem[];
  facts?: Map<string, DiscoveryGalleryFacts>;
  className?: string;
}

/**
 * CanonicalGallery — Deterministic row-major responsive grid for AdLabs Discover.
 *
 * Responsiveness:
 *  - >= 1720px: 5 columns
 *  - 1280–1719px: 4 columns
 *  - 900–1279px: 3 columns
 *  - 600–899px: 2 columns
 *  - < 600px: 1 column
 *
 * Employs deterministic row-major CSS Grid to guarantee that analytical sort orders
 * (Recently Seen, Longevity, EU Reach) strictly read left-to-right across rows (1, 2, 3, 4)
 * while preserving each creative's natural aspect ratio with top alignment.
 */
export function CanonicalGallery({
  items,
  facts,
  className = "",
}: CanonicalGalleryProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="canonical-gallery"
      className={`w-full grid grid-cols-1 min-[600px]:grid-cols-2 min-[900px]:grid-cols-3 min-[1280px]:grid-cols-4 min-[1720px]:grid-cols-5 gap-4 lg:gap-5 items-start auto-rows-auto ${className}`}
    >
      {items.map((item, idx) => (
        <GalleryAdCard
          key={item.id}
          item={item}
          facts={facts?.get(item.id)}
          priority={idx < 2}
        />
      ))}
    </div>
  );
}
