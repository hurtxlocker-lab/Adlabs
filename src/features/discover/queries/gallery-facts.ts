import "server-only";
import { db } from "@/db/client";
import { adDiscoveryIndex } from "@/db/schema";
import { inArray } from "drizzle-orm";

export interface DiscoveryGalleryFacts {
  adId: string;
  videoDurationMs: number | null;
  exactCreativeReuseCount: number | null;
  hasEuTransparencyEvidence: boolean;
  latestEuTotalReach: bigint | null;
  hasUkTransparencyEvidence: boolean;
  latestUkTotalReach: bigint | null;
}

/**
 * Fetches gallery-specific projection facts for an array of canonical ad IDs.
 *
 * Runs exactly ONE bounded SQL query over `ad_discovery_index` to retrieve
 * provenance evidence (EU/UK reach facts, video duration, and exact reuse counts).
 * Returns a Map keyed by canonical adId for O(1) card enrichment.
 */
export async function getDiscoveryGalleryFacts(
  adIds: string[],
): Promise<Map<string, DiscoveryGalleryFacts>> {
  if (adIds.length === 0) return new Map();

  const rows = await db
    .select({
      adId: adDiscoveryIndex.adId,
      videoDurationMs: adDiscoveryIndex.videoDurationMs,
      exactCreativeReuseCount: adDiscoveryIndex.exactCreativeReuseCount,
      hasEuTransparencyEvidence: adDiscoveryIndex.hasEuTransparencyEvidence,
      latestEuTotalReach: adDiscoveryIndex.latestEuTotalReach,
      hasUkTransparencyEvidence: adDiscoveryIndex.hasUkTransparencyEvidence,
      latestUkTotalReach: adDiscoveryIndex.latestUkTotalReach,
    })
    .from(adDiscoveryIndex)
    .where(inArray(adDiscoveryIndex.adId, adIds));

  const map = new Map<string, DiscoveryGalleryFacts>();
  for (const r of rows) {
    map.set(r.adId, {
      adId: r.adId,
      videoDurationMs: r.videoDurationMs,
      exactCreativeReuseCount: r.exactCreativeReuseCount,
      hasEuTransparencyEvidence: r.hasEuTransparencyEvidence,
      latestEuTotalReach: r.latestEuTotalReach,
      hasUkTransparencyEvidence: r.hasUkTransparencyEvidence,
      latestUkTotalReach: r.latestUkTotalReach,
    });
  }

  return map;
}
