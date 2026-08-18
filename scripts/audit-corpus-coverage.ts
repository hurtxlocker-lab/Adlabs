import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env") as {
  loadEnvConfig: (dir: string) => void;
};
loadEnvConfig(projectRoot);

import { db, closeDatabaseConnection } from "../src/db/client";
import { adDiscoveryIndex, ads, brands, sourceAccounts, adObservations, adTransparencyObservations } from "../src/db/schema";
import { sql, eq, inArray } from "drizzle-orm";
import { queryDiscoveryAds, queryDiscoveryFacets } from "../src/discovery/filters";

async function main() {
  try {
    console.log("==================================================");
    console.log("PHASE 3.5 CORPUS AUDIT & FILTER VERIFICATION");
    console.log("==================================================");

    // 1. Raw DB row counts
    const totalAds = await db.select({ count: sql<number>`count(*)::int` }).from(ads);
    const totalIndexed = await db.select({ count: sql<number>`count(*)::int` }).from(adDiscoveryIndex);
    const totalBrands = await db.select({ count: sql<number>`count(*)::int` }).from(brands);
    const totalAccounts = await db.select({ count: sql<number>`count(*)::int` }).from(sourceAccounts);
    const totalObservations = await db.select({ count: sql<number>`count(*)::int` }).from(adObservations);
    const totalTransparencyObs = await db.select({ count: sql<number>`count(*)::int` }).from(adTransparencyObservations);

    console.log("\n--- DATABASE TOTALS ---");
    console.log(`- Canonical Ads: ${totalAds[0].count}`);
    console.log(`- Discovery Index Rows: ${totalIndexed[0].count}`);
    console.log(`- Brands: ${totalBrands[0].count}`);
    console.log(`- Source Accounts: ${totalAccounts[0].count}`);
    console.log(`- Ad Observations: ${totalObservations[0].count}`);
    console.log(`- Ad Transparency Observations: ${totalTransparencyObs[0].count}`);

    // 2. Breakdown by Brand
    console.log("\n--- BRAND BREAKDOWN IN DISCOVERY INDEX ---");
    const brandBreakdown = await db.execute(sql`
      SELECT 
        b.name as brand_name,
        b.slug as brand_slug,
        count(adi.ad_id)::int as ad_count,
        count(adi.ad_id) FILTER (WHERE adi.has_eu_transparency_evidence)::int as eu_count,
        count(adi.ad_id) FILTER (WHERE adi.has_uk_transparency_evidence)::int as uk_count,
        count(adi.ad_id) FILTER (WHERE adi.has_br_transparency_evidence)::int as br_count,
        array_agg(DISTINCT unnest_target) FILTER (WHERE unnest_target IS NOT NULL) as target_countries,
        array_agg(DISTINCT unnest_reached) FILTER (WHERE unnest_reached IS NOT NULL) as reached_countries
      FROM ad_discovery_index adi
      JOIN brands b ON adi.brand_id = b.id
      LEFT JOIN LATERAL unnest(adi.target_countries) as unnest_target ON true
      LEFT JOIN LATERAL unnest(adi.reached_countries) as unnest_reached ON true
      GROUP BY b.name, b.slug
      ORDER BY ad_count DESC
    `);
    console.table(brandBreakdown);

    // 3. Dimension Coverage & Variability in ad_discovery_index
    console.log("\n--- DIMENSION COVERAGE & VARIABILITY ---");
    const [stats] = await db.execute(sql`
      SELECT
        count(*)::int as total_rows,
        
        -- Formats
        count(representative_media_type)::int as format_populated,
        count(DISTINCT representative_media_type)::int as format_distinct,
        
        -- Activity & Dates
        count(is_active)::int as active_populated,
        count(start_date)::int as start_date_populated,
        
        -- Platforms
        count(publisher_platforms) FILTER (WHERE array_length(publisher_platforms, 1) > 0)::int as platforms_populated,
        
        -- Countries
        count(target_countries) FILTER (WHERE array_length(target_countries, 1) > 0)::int as target_countries_populated,
        count(reached_countries) FILTER (WHERE array_length(reached_countries, 1) > 0)::int as reached_countries_populated,
        
        -- Transparency Evidence
        count(*) FILTER (WHERE has_eu_transparency_evidence)::int as eu_evidence_count,
        count(*) FILTER (WHERE has_uk_transparency_evidence)::int as uk_evidence_count,
        count(*) FILTER (WHERE has_br_transparency_evidence)::int as br_evidence_count,
        
        -- EU Reach & Age/Gender
        count(latest_eu_total_reach)::int as eu_reach_populated,
        min(latest_eu_total_reach) as eu_reach_min,
        max(latest_eu_total_reach) as eu_reach_max,
        count(latest_eu_target_age_min)::int as eu_age_populated,
        count(DISTINCT latest_eu_target_gender) FILTER (WHERE latest_eu_target_gender IS NOT NULL)::int as eu_gender_distinct,
        
        -- UK Reach & Age/Gender
        count(latest_uk_total_reach)::int as uk_reach_populated,
        min(latest_uk_total_reach) as uk_reach_min,
        max(latest_uk_total_reach) as uk_reach_max,
        count(latest_uk_target_age_min)::int as uk_age_populated,
        count(DISTINCT latest_uk_target_gender) FILTER (WHERE latest_uk_target_gender IS NOT NULL)::int as uk_gender_distinct,
        
        -- Account Enrichment
        count(latest_page_category)::int as category_populated,
        count(DISTINCT latest_page_category) FILTER (WHERE latest_page_category IS NOT NULL)::int as category_distinct,
        count(latest_instagram_followers)::int as ig_followers_populated,
        min(latest_instagram_followers) as ig_followers_min,
        max(latest_instagram_followers) as ig_followers_max,
        
        -- Creative Reuse
        count(exact_creative_reuse_count)::int as creative_reuse_populated,
        min(exact_creative_reuse_count) as creative_reuse_min,
        max(exact_creative_reuse_count) as creative_reuse_max
      FROM ad_discovery_index
    `);

    const tot = Number(stats.total_rows);
    console.log(`Total Corpus Rows: ${tot}`);
    console.log(`- representative_media_type: ${stats.format_populated}/${tot} (${((Number(stats.format_populated)/tot)*100).toFixed(1)}%), ${stats.format_distinct} distinct`);
    console.log(`- is_active: ${stats.active_populated}/${tot} (${((Number(stats.active_populated)/tot)*100).toFixed(1)}%)`);
    console.log(`- start_date: ${stats.start_date_populated}/${tot} (${((Number(stats.start_date_populated)/tot)*100).toFixed(1)}%)`);
    console.log(`- publisher_platforms: ${stats.platforms_populated}/${tot} (${((Number(stats.platforms_populated)/tot)*100).toFixed(1)}%)`);
    console.log(`- target_countries: ${stats.target_countries_populated}/${tot} (${((Number(stats.target_countries_populated)/tot)*100).toFixed(1)}%)`);
    console.log(`- reached_countries: ${stats.reached_countries_populated}/${tot} (${((Number(stats.reached_countries_populated)/tot)*100).toFixed(1)}%)`);
    console.log(`- EU Transparency Evidence: ${stats.eu_evidence_count}/${tot} (${((Number(stats.eu_evidence_count)/tot)*100).toFixed(1)}%)`);
    console.log(`  - EU Reach: ${stats.eu_reach_populated}/${tot}, range [${stats.eu_reach_min}, ${stats.eu_reach_max}]`);
    console.log(`  - EU Age: ${stats.eu_age_populated}/${tot}`);
    console.log(`  - EU Gender distinct values: ${stats.eu_gender_distinct}`);
    console.log(`- UK Transparency Evidence: ${stats.uk_evidence_count}/${tot} (${((Number(stats.uk_evidence_count)/tot)*100).toFixed(1)}%)`);
    console.log(`  - UK Reach: ${stats.uk_reach_populated}/${tot}, range [${stats.uk_reach_min}, ${stats.uk_reach_max}]`);
    console.log(`  - UK Age: ${stats.uk_age_populated}/${tot}`);
    console.log(`  - UK Gender distinct values: ${stats.uk_gender_distinct}`);
    console.log(`- BR Transparency Evidence: ${stats.br_evidence_count}/${tot} (0% as expected for current cohorts)`);
    console.log(`- Advertiser Category: ${stats.category_populated}/${tot}, ${stats.category_distinct} distinct categories`);
    console.log(`- Advertiser IG Followers: ${stats.ig_followers_populated}/${tot}, range [${stats.ig_followers_min}, ${stats.ig_followers_max}]`);
    console.log(`- Creative Reuse Count: ${stats.creative_reuse_populated}/${tot}, range [${stats.creative_reuse_min}, ${stats.creative_reuse_max}]`);

    // 4. Disjunctive Facet Engine Audit
    console.log("\n--- DISJUNCTIVE FACETS AUDIT ---");
    const facets = await queryDiscoveryFacets({});
    console.log("Media Types:", facets.mediaTypes);
    console.log("Platforms:", facets.publisherPlatforms);
    console.log("Target Countries:", facets.targetCountries);
    console.log("Reached Countries:", facets.reachedCountries);
    console.log("Transparency Evidence:", facets.transparencyEvidence);
    console.log("EU Reach Bands:", facets.euReachBands);
    console.log("Creative Reuse Bands:", facets.creativeReuseBands);
    console.log("Instagram Follower Bands:", facets.instagramFollowerBands);
    console.log("Page Categories:", facets.pageCategories);

    // 5. Real End-to-End Filter Queries
    console.log("\n--- REAL END-TO-END FILTER QUERIES ---");

    // Helper to load ad index rows for returned IDs
    async function loadIndexedAds(ids: string[]) {
      if (ids.length === 0) return [];
      return db
        .select({
          adId: adDiscoveryIndex.adId,
          brandName: brands.name,
          mediaType: adDiscoveryIndex.representativeMediaType,
          isActive: adDiscoveryIndex.isActive,
          platforms: adDiscoveryIndex.publisherPlatforms,
          targetCountries: adDiscoveryIndex.targetCountries,
          reachedCountries: adDiscoveryIndex.reachedCountries,
          hasEu: adDiscoveryIndex.hasEuTransparencyEvidence,
          hasUk: adDiscoveryIndex.hasUkTransparencyEvidence,
          euReach: adDiscoveryIndex.latestEuTotalReach,
          ukReach: adDiscoveryIndex.latestUkTotalReach,
          euAgeMin: adDiscoveryIndex.latestEuTargetAgeMin,
          euAgeMax: adDiscoveryIndex.latestEuTargetAgeMax,
          ukAgeMin: adDiscoveryIndex.latestUkTargetAgeMin,
          ukAgeMax: adDiscoveryIndex.latestUkTargetAgeMax,
          igFollowers: adDiscoveryIndex.latestInstagramFollowers,
        })
        .from(adDiscoveryIndex)
        .innerJoin(brands, eq(adDiscoveryIndex.brandId, brands.id))
        .where(inArray(adDiscoveryIndex.adId, ids));
    }

    // Query 1: EU Reach >= 1000
    const q1 = await queryDiscoveryAds({
      filters: { hasEuTransparencyEvidence: true, euReachMin: 1000 },
      sort: "EU_REACH_DESC",
      pageSize: 10,
    });
    const q1Details = await loadIndexedAds(q1.items.map((i) => i.adId));
    console.log(`\nQuery 1 (EU Reach >= 1000, Sort: EU_REACH_DESC): ${q1.items.length} items (Next cursor: ${!!q1.nextCursor})`);
    for (const item of q1Details) {
      console.log(` - Ad ${item.adId} (${item.brandName}): EU Reach = ${item.euReach}, Target = [${item.targetCountries.join(", ")}], Reached = [${item.reachedCountries.join(", ")}]`);
    }

    // Query 2: Target FR with Age Overlap [25, 44]
    const q2 = await queryDiscoveryAds({
      filters: { targetCountries: ["FR"], euTargetAgeMin: 25, euTargetAgeMax: 44 },
      sort: "RECENTLY_SEEN",
      pageSize: 10,
    });
    console.log(`\nQuery 2 (Target FR + Age 25-44 Overlap): ${q2.items.length} items`);

    // Query 3: Cross-market delivery: Reached ES
    const q3 = await queryDiscoveryAds({
      filters: { reachedCountries: ["ES"] },
      sort: "RECENTLY_SEEN",
      pageSize: 10,
    });
    const q3Details = await loadIndexedAds(q3.items.map((i) => i.adId));
    console.log(`\nQuery 3 (Reached ES - Nida cross-market): ${q3.items.length} items`);
    for (const item of q3Details) {
      console.log(` - Ad ${item.adId} (${item.brandName}): Reached = [${item.reachedCountries.join(", ")}], Target = [${item.targetCountries.join(", ")}]`);
    }

    // Query 4: UK Transparency Evidence (Evolv)
    const q4 = await queryDiscoveryAds({
      filters: { hasUkTransparencyEvidence: true },
      sort: "RECENTLY_SEEN",
      pageSize: 10,
    });
    const q4Details = await loadIndexedAds(q4.items.map((i) => i.adId));
    console.log(`\nQuery 4 (UK Transparency - Evolv): ${q4.items.length} items`);
    for (const item of q4Details) {
      console.log(` - Ad ${item.adId} (${item.brandName}): UK Reach = ${item.ukReach ?? "null"}, UK Age = ${item.ukAgeMin}-${item.ukAgeMax}`);
    }

    // Query 5: India Non-Regulated Baseline (No transparency, Instagram, Active)
    const q5 = await queryDiscoveryAds({
      filters: {
        hasEuTransparencyEvidence: false,
        hasUkTransparencyEvidence: false,
        isActive: true,
        publisherPlatforms: ["INSTAGRAM"],
      },
      sort: "RECENTLY_SEEN",
      pageSize: 10,
    });
    console.log(`\nQuery 5 (India Baseline - No Transparency, IG, Active): ${q5.items.length} items`);

    // Query 6: IG Followers >= 50,000
    const q6 = await queryDiscoveryAds({
      filters: { instagramFollowersMin: 50000 },
      sort: "INSTAGRAM_FOLLOWERS_DESC",
      pageSize: 10,
    });
    const q6Details = await loadIndexedAds(q6.items.map((i) => i.adId));
    console.log(`\nQuery 6 (IG Followers >= 50K): ${q6.items.length} items`);
    for (const item of q6Details) {
      console.log(` - Ad ${item.adId} (${item.brandName}): IG Followers = ${item.igFollowers}`);
    }

    // Query 7: Diversity limit per brand = 2
    const q7 = await queryDiscoveryAds({
      sort: "RECENTLY_SEEN",
      limitPerBrand: 2,
      pageSize: 20,
    });
    const q7Details = await loadIndexedAds(q7.items.map((i) => i.adId));
    console.log(`\nQuery 7 (Diversity Limit = 2 per brand): ${q7.items.length} items returned`);
    const brandCounts: Record<string, number> = {};
    for (const item of q7Details) {
      brandCounts[item.brandName] = (brandCounts[item.brandName] || 0) + 1;
    }
    console.log("Brand distribution in result:", brandCounts);

  } finally {
    await closeDatabaseConnection();
  }
}

main().catch(console.error);
