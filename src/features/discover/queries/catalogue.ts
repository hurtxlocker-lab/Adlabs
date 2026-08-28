import { db as defaultDb } from "@/db/client";
import { adDiscoveryIndex, brands } from "@/db/schema";
import type { DbOrTx } from "@/ingestion/persistence/types";
import { sql } from "drizzle-orm";
import type { BrandCatalogueItem } from "../utils/brand-search";

interface BrandCatalogueDbRow extends Record<string, unknown> {
  slug: string;
  name: string;
  category: string | null;
  creative_count: string | number;
}

/**
 * Returns stable corpus-level brand catalogue items for Discover search.
 *
 * Catalogue Semantics:
 *  - Covers all indexed/public brands available for Discover search.
 *  - creativeCount is the corpus-level DISTINCT exact creative groups for that brand.
 *  - Independent of contextual filter state applied to the gallery query.
 */
export async function getDiscoverBrandCatalogue(
  executor?: DbOrTx,
): Promise<BrandCatalogueItem[]> {
  const dbClient = executor ?? defaultDb;

  const result = await dbClient.execute<BrandCatalogueDbRow>(sql`
    SELECT
      ${brands.slug} as slug,
      ${brands.name} as name,
      max(${brands.category}) as category,
      count(DISTINCT ${adDiscoveryIndex.representativeMediaSha256})::int as creative_count
    FROM ${adDiscoveryIndex}
    INNER JOIN ${brands} ON ${brands.id} = ${adDiscoveryIndex.brandId}
    WHERE ${adDiscoveryIndex.representativeMediaSha256} IS NOT NULL
    GROUP BY ${brands.id}, ${brands.slug}, ${brands.name}
    ORDER BY creative_count DESC, ${brands.name} ASC
  `);

  const rows = Array.isArray(result)
    ? (result as BrandCatalogueDbRow[])
    : ((result as { rows?: BrandCatalogueDbRow[] })?.rows ?? []);

  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    category: r.category ?? null,
    creativeCount: Number(r.creative_count),
  }));
}
