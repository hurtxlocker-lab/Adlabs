import { adDiscoveryIndex } from "@/db/schema";
import { asc, desc, sql, type SQL } from "drizzle-orm";
import type { DiscoverySort } from "./types";

/**
 * Returns deterministic ORDER BY clauses for a given sort enum.
 * Every sort includes deterministic tie-breakers ending with `ad_id ASC`.
 *
 * @param sort The sort option enum
 * @param useColumnNamesOnly If true, uses unqualified column identifiers (for CTE projections)
 */
export function getDiscoverySortClauses(
  sort: DiscoverySort = "RECENTLY_SEEN",
  useColumnNamesOnly = false,
): SQL<unknown>[] {
  if (useColumnNamesOnly) {
    switch (sort) {
      case "RECENTLY_SEEN":
        return [sql`last_seen_at DESC`, sql`ad_id ASC`];

      case "OLDEST_SEEN":
        return [sql`last_seen_at ASC`, sql`ad_id ASC`];

      case "NEWEST_STARTED":
        return [sql`start_date DESC NULLS LAST`, sql`last_seen_at DESC`, sql`ad_id ASC`];

      case "OLDEST_STARTED":
        return [sql`start_date ASC NULLS LAST`, sql`last_seen_at DESC`, sql`ad_id ASC`];

      case "EU_REACH_DESC":
        return [sql`latest_eu_total_reach DESC NULLS LAST`, sql`last_seen_at DESC`, sql`ad_id ASC`];

      case "EU_REACH_ASC":
        return [sql`latest_eu_total_reach ASC NULLS LAST`, sql`last_seen_at DESC`, sql`ad_id ASC`];

      case "INSTAGRAM_FOLLOWERS_DESC":
        return [sql`latest_instagram_followers DESC NULLS LAST`, sql`last_seen_at DESC`, sql`ad_id ASC`];

      case "INSTAGRAM_FOLLOWERS_ASC":
        return [sql`latest_instagram_followers ASC NULLS LAST`, sql`last_seen_at DESC`, sql`ad_id ASC`];

      case "CREATIVE_REUSE_DESC":
        return [sql`exact_creative_reuse_count DESC NULLS LAST`, sql`last_seen_at DESC`, sql`ad_id ASC`];

      case "CREATIVE_REUSE_ASC":
        return [sql`exact_creative_reuse_count ASC NULLS LAST`, sql`last_seen_at DESC`, sql`ad_id ASC`];

      default:
        return [sql`last_seen_at DESC`, sql`ad_id ASC`];
    }
  }

  // Standard table-qualified clauses for ad_discovery_index
  switch (sort) {
    case "RECENTLY_SEEN":
      return [desc(adDiscoveryIndex.lastSeenAt), asc(adDiscoveryIndex.adId)];

    case "OLDEST_SEEN":
      return [asc(adDiscoveryIndex.lastSeenAt), asc(adDiscoveryIndex.adId)];

    case "NEWEST_STARTED":
      return [
        sql`${adDiscoveryIndex.startDate} DESC NULLS LAST`,
        desc(adDiscoveryIndex.lastSeenAt),
        asc(adDiscoveryIndex.adId),
      ];

    case "OLDEST_STARTED":
      return [
        sql`${adDiscoveryIndex.startDate} ASC NULLS LAST`,
        desc(adDiscoveryIndex.lastSeenAt),
        asc(adDiscoveryIndex.adId),
      ];

    case "EU_REACH_DESC":
      return [
        sql`${adDiscoveryIndex.latestEuTotalReach} DESC NULLS LAST`,
        desc(adDiscoveryIndex.lastSeenAt),
        asc(adDiscoveryIndex.adId),
      ];

    case "EU_REACH_ASC":
      return [
        sql`${adDiscoveryIndex.latestEuTotalReach} ASC NULLS LAST`,
        desc(adDiscoveryIndex.lastSeenAt),
        asc(adDiscoveryIndex.adId),
      ];

    case "INSTAGRAM_FOLLOWERS_DESC":
      return [
        sql`${adDiscoveryIndex.latestInstagramFollowers} DESC NULLS LAST`,
        desc(adDiscoveryIndex.lastSeenAt),
        asc(adDiscoveryIndex.adId),
      ];

    case "INSTAGRAM_FOLLOWERS_ASC":
      return [
        sql`${adDiscoveryIndex.latestInstagramFollowers} ASC NULLS LAST`,
        desc(adDiscoveryIndex.lastSeenAt),
        asc(adDiscoveryIndex.adId),
      ];

    case "CREATIVE_REUSE_DESC":
      return [
        sql`${adDiscoveryIndex.exactCreativeReuseCount} DESC NULLS LAST`,
        desc(adDiscoveryIndex.lastSeenAt),
        asc(adDiscoveryIndex.adId),
      ];

    case "CREATIVE_REUSE_ASC":
      return [
        sql`${adDiscoveryIndex.exactCreativeReuseCount} ASC NULLS LAST`,
        desc(adDiscoveryIndex.lastSeenAt),
        asc(adDiscoveryIndex.adId),
      ];

    default:
      return [desc(adDiscoveryIndex.lastSeenAt), asc(adDiscoveryIndex.adId)];
  }
}
