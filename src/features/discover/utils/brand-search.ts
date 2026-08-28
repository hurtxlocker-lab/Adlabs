/**
 * src/features/discover/utils/brand-search.ts
 *
 * Pure, zero-dependency brand search engine for Discover.
 * Operates in-memory over SearchableBrand items with sub-millisecond execution.
 */

export interface BrandCatalogueItem {
  slug: string;
  name: string;
  category: string | null;
  creativeCount: number;
}

export type SearchableBrand = BrandCatalogueItem;

/**
 * Searches and ranks brands based on query.
 *
 * Ranking criteria:
 *  1. Exact name match (case-insensitive) or exact slug match
 *  2. Name starts with query
 *  3. Slug starts with query
 *  4. Any word in name starts with query (e.g., "Greens" -> "AG1 by Athletic Greens")
 *  5. Name contains query
 *  6. Category contains query
 *  7. Slug contains query
 *
 * Tie-breaker: higher creativeCount DESC, then alphabetical name ASC.
 */
export function searchBrands(
  brands: SearchableBrand[],
  rawQuery: string,
): SearchableBrand[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    // Return all brands ordered by creative volume DESC, name ASC
    return [...brands].sort(
      (a, b) => b.creativeCount - a.creativeCount || a.name.localeCompare(b.name),
    );
  }

  const queryWords = query.split(/\s+/).filter((w) => w.length > 0);

  interface ScoredBrand {
    brand: SearchableBrand;
    rank: number;
  }

  const scored: ScoredBrand[] = [];

  for (const brand of brands) {
    const nameLower = brand.name.toLowerCase();
    const slugLower = brand.slug.toLowerCase();
    const catLower = (brand.category ?? "").toLowerCase();

    // 1. Exact match
    if (nameLower === query || slugLower === query) {
      scored.push({ brand, rank: 1 });
      continue;
    }

    // 2. Name starts with query
    if (nameLower.startsWith(query)) {
      scored.push({ brand, rank: 2 });
      continue;
    }

    // 3. Slug starts with query
    if (slugLower.startsWith(query)) {
      scored.push({ brand, rank: 3 });
      continue;
    }

    // 4. Any word in name starts with query or all query words match words in name
    const nameWords = nameLower.split(/\s+/);
    const wordPrefixMatch = nameWords.some((w) => w.startsWith(query));
    const allWordsMatch =
      queryWords.length > 1 &&
      queryWords.every((qw) =>
        nameWords.some((nw) => nw.startsWith(qw) || nw.includes(qw)),
      );

    if (wordPrefixMatch || allWordsMatch) {
      scored.push({ brand, rank: 4 });
      continue;
    }

    // 5. Name contains query substring
    if (nameLower.includes(query)) {
      scored.push({ brand, rank: 5 });
      continue;
    }

    // 6. Category contains query
    if (catLower.includes(query)) {
      scored.push({ brand, rank: 6 });
      continue;
    }

    // 7. Slug contains query
    if (slugLower.includes(query)) {
      scored.push({ brand, rank: 7 });
      continue;
    }
  }

  return scored
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (b.brand.creativeCount !== a.brand.creativeCount) {
        return b.brand.creativeCount - a.brand.creativeCount;
      }
      return a.brand.name.localeCompare(b.brand.name);
    })
    .map((s) => s.brand);
}
