import { adDiscoveryIndex } from "@/db/schema";
import { sql, type SQL } from "drizzle-orm";
import type { DiscoverySort } from "./types";

export interface DiscoveryCursorPayload {
  v: 1;
  sort: DiscoverySort;
  values: Array<string | number | boolean | null>;
}

export class DiscoveryCursorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscoveryCursorError";
  }
}

/**
 * Encodes a discovery cursor payload to a Base64URL string.
 */
export function encodeDiscoveryCursor(payload: DiscoveryCursorPayload): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decodes and validates a discovery cursor string against the requested sort.
 */
export function decodeDiscoveryCursor(
  cursorStr: string,
  expectedSort: DiscoverySort,
): DiscoveryCursorPayload {
  try {
    let base64 = cursorStr.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) {
      base64 += "=";
    }
    const json = Buffer.from(base64, "base64").toString("utf8");
    const payload = JSON.parse(json) as DiscoveryCursorPayload;

    if (!payload || payload.v !== 1 || !Array.isArray(payload.values)) {
      throw new DiscoveryCursorError("Invalid cursor structure");
    }

    if (payload.sort !== expectedSort) {
      throw new DiscoveryCursorError(
        `Cursor sort mismatch: cursor was created for sort "${payload.sort}", but requested sort is "${expectedSort}"`,
      );
    }

    return payload;
  } catch (err) {
    if (err instanceof DiscoveryCursorError) throw err;
    throw new DiscoveryCursorError("Malformed or corrupted cursor string");
  }
}

/**
 * Compiles a cursor payload into a SQL WHERE condition for pagination.
 */
export function compileCursorPredicate(
  cursor: DiscoveryCursorPayload,
  useColumnNamesOnly = false,
): SQL<unknown> {
  const { sort, values } = cursor;

  const colAdId = useColumnNamesOnly ? sql`ad_id` : sql`${adDiscoveryIndex.adId}`;
  const colLastSeen = useColumnNamesOnly ? sql`last_seen_at` : sql`${adDiscoveryIndex.lastSeenAt}`;
  const colStartDate = useColumnNamesOnly ? sql`start_date` : sql`${adDiscoveryIndex.startDate}`;
  const colEuReach = useColumnNamesOnly ? sql`latest_eu_total_reach` : sql`${adDiscoveryIndex.latestEuTotalReach}`;
  const colIgFollowers = useColumnNamesOnly ? sql`latest_instagram_followers` : sql`${adDiscoveryIndex.latestInstagramFollowers}`;
  const colReuse = useColumnNamesOnly ? sql`exact_creative_reuse_count` : sql`${adDiscoveryIndex.exactCreativeReuseCount}`;

  switch (sort) {
    case "RECENTLY_SEEN": {
      const [lastSeenStr, adId] = values as [string, string];
      return sql`(${colLastSeen} < ${lastSeenStr}::timestamptz OR (${colLastSeen} = ${lastSeenStr}::timestamptz AND ${colAdId} > ${adId}))`;
    }

    case "OLDEST_SEEN": {
      const [lastSeenStr, adId] = values as [string, string];
      return sql`(${colLastSeen} > ${lastSeenStr}::timestamptz OR (${colLastSeen} = ${lastSeenStr}::timestamptz AND ${colAdId} > ${adId}))`;
    }

    case "NEWEST_STARTED": {
      const [startStr, lastSeenStr, adId] = values as [string | null, string, string];
      if (startStr !== null) {
        return sql`(${colStartDate} < ${startStr}::timestamptz OR ${colStartDate} IS NULL OR (${colStartDate} = ${startStr}::timestamptz AND (${colLastSeen} < ${lastSeenStr}::timestamptz OR (${colLastSeen} = ${lastSeenStr}::timestamptz AND ${colAdId} > ${adId}))))`;
      } else {
        return sql`(${colStartDate} IS NULL AND (${colLastSeen} < ${lastSeenStr}::timestamptz OR (${colLastSeen} = ${lastSeenStr}::timestamptz AND ${colAdId} > ${adId})))`;
      }
    }

    case "OLDEST_STARTED": {
      const [startStr, lastSeenStr, adId] = values as [string | null, string, string];
      if (startStr !== null) {
        return sql`(${colStartDate} > ${startStr}::timestamptz OR ${colStartDate} IS NULL OR (${colStartDate} = ${startStr}::timestamptz AND (${colLastSeen} < ${lastSeenStr}::timestamptz OR (${colLastSeen} = ${lastSeenStr}::timestamptz AND ${colAdId} > ${adId}))))`;
      } else {
        return sql`(${colStartDate} IS NULL AND (${colLastSeen} < ${lastSeenStr}::timestamptz OR (${colLastSeen} = ${lastSeenStr}::timestamptz AND ${colAdId} > ${adId})))`;
      }
    }

    case "EU_REACH_DESC": {
      const [reachStr, lastSeenStr, adId] = values as [string | null, string, string];
      if (reachStr !== null) {
        return sql`(${colEuReach} < ${reachStr}::bigint OR ${colEuReach} IS NULL OR (${colEuReach} = ${reachStr}::bigint AND (${colLastSeen} < ${lastSeenStr}::timestamptz OR (${colLastSeen} = ${lastSeenStr}::timestamptz AND ${colAdId} > ${adId}))))`;
      } else {
        return sql`(${colEuReach} IS NULL AND (${colLastSeen} < ${lastSeenStr}::timestamptz OR (${colLastSeen} = ${lastSeenStr}::timestamptz AND ${colAdId} > ${adId})))`;
      }
    }

    case "EU_REACH_ASC": {
      const [reachStr, lastSeenStr, adId] = values as [string | null, string, string];
      if (reachStr !== null) {
        return sql`(${colEuReach} > ${reachStr}::bigint OR ${colEuReach} IS NULL OR (${colEuReach} = ${reachStr}::bigint AND (${colLastSeen} < ${lastSeenStr}::timestamptz OR (${colLastSeen} = ${lastSeenStr}::timestamptz AND ${colAdId} > ${adId}))))`;
      } else {
        return sql`(${colEuReach} IS NULL AND (${colLastSeen} < ${lastSeenStr}::timestamptz OR (${colLastSeen} = ${lastSeenStr}::timestamptz AND ${colAdId} > ${adId})))`;
      }
    }

    case "INSTAGRAM_FOLLOWERS_DESC": {
      const [folStr, lastSeenStr, adId] = values as [string | null, string, string];
      if (folStr !== null) {
        return sql`(${colIgFollowers} < ${folStr}::bigint OR ${colIgFollowers} IS NULL OR (${colIgFollowers} = ${folStr}::bigint AND (${colLastSeen} < ${lastSeenStr}::timestamptz OR (${colLastSeen} = ${lastSeenStr}::timestamptz AND ${colAdId} > ${adId}))))`;
      } else {
        return sql`(${colIgFollowers} IS NULL AND (${colLastSeen} < ${lastSeenStr}::timestamptz OR (${colLastSeen} = ${lastSeenStr}::timestamptz AND ${colAdId} > ${adId})))`;
      }
    }

    case "INSTAGRAM_FOLLOWERS_ASC": {
      const [folStr, lastSeenStr, adId] = values as [string | null, string, string];
      if (folStr !== null) {
        return sql`(${colIgFollowers} > ${folStr}::bigint OR ${colIgFollowers} IS NULL OR (${colIgFollowers} = ${folStr}::bigint AND (${colLastSeen} < ${lastSeenStr}::timestamptz OR (${colLastSeen} = ${lastSeenStr}::timestamptz AND ${colAdId} > ${adId}))))`;
      } else {
        return sql`(${colIgFollowers} IS NULL AND (${colLastSeen} < ${lastSeenStr}::timestamptz OR (${colLastSeen} = ${lastSeenStr}::timestamptz AND ${colAdId} > ${adId})))`;
      }
    }

    case "CREATIVE_REUSE_DESC": {
      const [reuseVal, lastSeenStr, adId] = values as [number | null, string, string];
      if (reuseVal !== null) {
        return sql`(${colReuse} < ${reuseVal} OR ${colReuse} IS NULL OR (${colReuse} = ${reuseVal} AND (${colLastSeen} < ${lastSeenStr}::timestamptz OR (${colLastSeen} = ${lastSeenStr}::timestamptz AND ${colAdId} > ${adId}))))`;
      } else {
        return sql`(${colReuse} IS NULL AND (${colLastSeen} < ${lastSeenStr}::timestamptz OR (${colLastSeen} = ${lastSeenStr}::timestamptz AND ${colAdId} > ${adId})))`;
      }
    }

    case "CREATIVE_REUSE_ASC": {
      const [reuseVal, lastSeenStr, adId] = values as [number | null, string, string];
      if (reuseVal !== null) {
        return sql`(${colReuse} > ${reuseVal} OR ${colReuse} IS NULL OR (${colReuse} = ${reuseVal} AND (${colLastSeen} < ${lastSeenStr}::timestamptz OR (${colLastSeen} = ${lastSeenStr}::timestamptz AND ${colAdId} > ${adId}))))`;
      } else {
        return sql`(${colReuse} IS NULL AND (${colLastSeen} < ${lastSeenStr}::timestamptz OR (${colLastSeen} = ${lastSeenStr}::timestamptz AND ${colAdId} > ${adId})))`;
      }
    }

    default: {
      const [lastSeenStr, adId] = values as [string, string];
      return sql`(${colLastSeen} < ${lastSeenStr}::timestamptz OR (${colLastSeen} = ${lastSeenStr}::timestamptz AND ${colAdId} > ${adId}))`;
    }
  }
}
