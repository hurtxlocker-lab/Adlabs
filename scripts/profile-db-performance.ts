import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import { queryDiscoveryCreatives, queryDiscoveryFacets } from "@/discovery/filters";
import { getAdLibraryItemsByIds } from "@/features/ad-library";
import { parseDiscoveryFiltersFromParams } from "@/features/discover/utils/url-filters";

async function profileScenario(name: string, searchParams: Record<string, string>) {
  console.log(`\n==================================================`);
  console.log(`PROFILING: ${name}`);
  console.log(`Params:`, searchParams);
  console.log(`==================================================`);

  const t0 = performance.now();
  const filterInput = parseDiscoveryFiltersFromParams(searchParams);

  // 1. queryDiscoveryCreatives
  const tCreativesStart = performance.now();
  const creativesResult = await queryDiscoveryCreatives({
    filters: filterInput,
    sort: "EXPLORE",
    pageSize: 72,
  });
  const tCreativesEnd = performance.now();

  // 2. queryDiscoveryFacets
  const tFacetsStart = performance.now();
  const facetsResult = await queryDiscoveryFacets({
    filters: filterInput,
  });
  const tFacetsEnd = performance.now();

  // 3. Hydration (getAdLibraryItemsByIds)
  const tHydrateStart = performance.now();
  const representativeAdIds = creativesResult.items.map((x) => x.representativeAdId);
  const items = await getAdLibraryItemsByIds(representativeAdIds);
  const tHydrateEnd = performance.now();

  // 4. Parallel execution (as in page.tsx)
  const tParallelStart = performance.now();
  const [pCreatives, pFacets] = await Promise.all([
    queryDiscoveryCreatives({ filters: filterInput, sort: "EXPLORE", pageSize: 72 }),
    queryDiscoveryFacets({ filters: filterInput }),
  ]);
  const pItems = await getAdLibraryItemsByIds(pCreatives.items.map((x) => x.representativeAdId));
  const tParallelEnd = performance.now();

  const totalWallMs = performance.now() - t0;

  console.log({
    creativesQueryMs: Math.round(tCreativesEnd - tCreativesStart),
    facetsQueryMs: Math.round(tFacetsEnd - tFacetsStart),
    hydrationQueryMs: Math.round(tHydrateEnd - tHydrateStart),
    parallelExecutionMs: Math.round(tParallelEnd - tParallelStart),
    totalWallMs: Math.round(totalWallMs),
    returnedCreativesCount: creativesResult.items.length,
    hydratedItemsCount: items.length,
    parallelItemsCount: pItems.length,
    brandFacetsCount: facetsResult.brands.length,
    parallelBrandFacetsCount: pFacets.brands.length,
    totalCorpusCreatives: creativesResult.totalCreativesCount,
  });
}

async function main() {
  // Test connection acquisition
  const tConn0 = performance.now();
  await db.execute(sql`SELECT 1`);
  const connMs = Math.round(performance.now() - tConn0);
  console.log(`Database Connection Acquisition: ${connMs}ms`);

  // Scenario 1: Initial Discover Page Load (no filters)
  await profileScenario("Initial Page Load (No Filters)", {});

  // Scenario 2: Brand Filter Selection (e.g. brand="Gymshark" or top brand)
  const facets = await queryDiscoveryFacets({ filters: {} });
  const topBrand = facets.brands[0];
  if (topBrand) {
    await profileScenario(`Brand Filter Selection (${topBrand.brandName})`, {
      brand: topBrand.brandId,
    });
  }

  // Scenario 3: Creative / Media Type Filter (e.g. media=VIDEO)
  await profileScenario("Media Filter Selection (VIDEO)", {
    media: "VIDEO",
  });

  // Scenario 4: Compound Filter (Brand + Media + Active)
  if (topBrand) {
    await profileScenario("Compound Filter (Brand + VIDEO + Active)", {
      brand: topBrand.brandId,
      media: "VIDEO",
      active: "true",
    });
  }

  process.exit(0);
}

main().catch(console.error);
