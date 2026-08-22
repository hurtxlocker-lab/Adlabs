import { db as defaultDb } from "@/db/client";
import {
  adCards,
  adDiscoveryIndex,
  adMedia,
  adObservations,
  ads,
  adTransparencyObservations,
  cardMedia,
  mediaAssets,
  sourceAccountObservations,
  sourceAccounts,
} from "@/db/schema";
import type { DbOrTx } from "@/ingestion/persistence/types";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { calculateCopyMetrics } from "./copy-metrics";
import {
  resolveRepresentativeCreativeFacts,
  type CardEntity,
  type MediaAssetEntity,
} from "./representative-creative";
import type {
  AdDiscoveryIndexRow,
  NewAdDiscoveryIndexRow,
  RebuildDiscoveryIndexOptions,
  RebuildDiscoveryIndexResult,
} from "./types";

/**
 * Normalizes and deduplicates an array of country codes, returning a sorted uppercase list.
 */
function mergeCountryArrays(...arrays: (string[] | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;
    for (const c of arr) {
      if (typeof c === "string" && c.trim().length > 0) {
        set.add(c.trim().toUpperCase());
      }
    }
  }
  return Array.from(set).sort();
}

/**
 * Counts distinct canonical ads referencing a specific media SHA256 within a brand.
 */
async function countBrandShaDistinctAds(
  brandId: string,
  sha256: string,
  dbClient: DbOrTx,
): Promise<{ count: number; peerAdIds: string[] }> {
  const directMatches = await dbClient
    .select({ adId: adMedia.adId })
    .from(adMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, adMedia.mediaAssetId))
    .innerJoin(ads, eq(ads.id, adMedia.adId))
    .innerJoin(sourceAccounts, eq(sourceAccounts.id, ads.sourceAccountId))
    .where(
      and(
        eq(sourceAccounts.brandId, brandId),
        eq(mediaAssets.sha256, sha256),
      ),
    );

  const cardMatches = await dbClient
    .select({ adId: adCards.adId })
    .from(adCards)
    .innerJoin(cardMedia, eq(cardMedia.adCardId, adCards.id))
    .innerJoin(mediaAssets, eq(mediaAssets.id, cardMedia.mediaAssetId))
    .innerJoin(ads, eq(ads.id, adCards.adId))
    .innerJoin(sourceAccounts, eq(sourceAccounts.id, ads.sourceAccountId))
    .where(
      and(
        eq(sourceAccounts.brandId, brandId),
        eq(mediaAssets.sha256, sha256),
      ),
    );

  const peerIds = new Set<string>();
  for (const m of directMatches) peerIds.add(m.adId);
  for (const m of cardMatches) peerIds.add(m.adId);

  return {
    count: peerIds.size,
    peerAdIds: Array.from(peerIds),
  };
}

/**
 * Projects a single canonical ad into `ad_discovery_index`.
 *
 * This function reads truth from canonical and observational tables, evaluates deterministic
 * representative creative, copy, reuse, and transparency rules, and performs an idempotent upsert.
 */
export async function projectAd(
  adId: string,
  executor?: DbOrTx,
): Promise<AdDiscoveryIndexRow | null> {
  const dbClient = executor ?? defaultDb;

  // 1. Fetch canonical ad with brandId through sourceAccounts
  const [adRow] = await dbClient
    .select({
      ad: ads,
      brandId: sourceAccounts.brandId,
    })
    .from(ads)
    .innerJoin(sourceAccounts, eq(sourceAccounts.id, ads.sourceAccountId))
    .where(eq(ads.id, adId));

  if (!adRow) {
    // If ad no longer exists, clean up projection row if any
    await dbClient.delete(adDiscoveryIndex).where(eq(adDiscoveryIndex.adId, adId));
    return null;
  }
  const { ad, brandId } = adRow;

  // 2. Fetch previous projection to track representative SHA identity changes (X -> Y)
  const [previousProjection] = await dbClient
    .select({
      previousSha: adDiscoveryIndex.representativeMediaSha256,
    })
    .from(adDiscoveryIndex)
    .where(eq(adDiscoveryIndex.adId, adId));

  const oldRepresentativeSha = previousProjection?.previousSha ?? null;

  // 3. Fetch cards with card media
  const cardRows = await dbClient
    .select({
      id: adCards.id,
      position: adCards.position,
      title: adCards.title,
      body: adCards.body,
      description: adCards.description,
      ctaText: adCards.ctaText,
      mediaId: mediaAssets.id,
      mediaSha256: mediaAssets.sha256,
      mediaType: mediaAssets.mediaType,
      width: mediaAssets.width,
      height: mediaAssets.height,
      durationMs: mediaAssets.durationMs,
      role: cardMedia.role,
    })
    .from(adCards)
    .leftJoin(cardMedia, eq(cardMedia.adCardId, adCards.id))
    .leftJoin(mediaAssets, eq(cardMedia.mediaAssetId, mediaAssets.id))
    .where(eq(adCards.adId, adId))
    .orderBy(adCards.position);

  const cardsMap = new Map<string, CardEntity>();
  for (const row of cardRows) {
    if (!cardsMap.has(row.id)) {
      cardsMap.set(row.id, {
        id: row.id,
        position: row.position,
        headline: row.title,
        body: row.body,
        description: row.description,
        ctaText: row.ctaText,
        media: [],
      });
    }
    if (row.mediaId && row.mediaType) {
      cardsMap.get(row.id)!.media.push({
        id: row.mediaId,
        sha256: row.mediaSha256 ?? null,
        mediaType: row.mediaType as "IMAGE" | "VIDEO" | "UNKNOWN",
        width: row.width,
        height: row.height,
        durationMs: row.durationMs,
        role: row.role,
      });
    }
  }
  const cards = Array.from(cardsMap.values());

  // 4. Fetch direct media
  const directMediaRows = await dbClient
    .select({
      id: mediaAssets.id,
      sha256: mediaAssets.sha256,
      mediaType: mediaAssets.mediaType,
      width: mediaAssets.width,
      height: mediaAssets.height,
      durationMs: mediaAssets.durationMs,
      role: adMedia.role,
      position: adMedia.position,
    })
    .from(adMedia)
    .innerJoin(mediaAssets, eq(adMedia.mediaAssetId, mediaAssets.id))
    .where(eq(adMedia.adId, adId))
    .orderBy(adMedia.position);

  const directMedia: MediaAssetEntity[] = directMediaRows.map((m) => ({
    id: m.id,
    sha256: m.sha256,
    mediaType: m.mediaType as "IMAGE" | "VIDEO" | "UNKNOWN",
    width: m.width,
    height: m.height,
    durationMs: m.durationMs,
    role: m.role,
    position: m.position,
  }));

  // 5. Resolve representative creative & copy metrics
  const repCreative = resolveRepresentativeCreativeFacts(
    {
      id: ad.id,
      headline: ad.headline,
      primaryText: ad.primaryText,
      description: ad.description,
      ctaText: ad.ctaText,
      ctaType: ad.ctaType,
      displayFormat: ad.displayFormat ?? "UNKNOWN",
    },
    cards,
    directMedia,
  );
  const copyMetrics = calculateCopyMetrics(
    repCreative.primaryText,
    repCreative.headline,
  );

  // 6. Resolve exact creative reuse for new representative SHA
  const newRepresentativeSha = repCreative.mediaSha256 ?? null;
  let exactCreativeReuseCount: number | null = null;

  if (newRepresentativeSha) {
    const reuseResult = await countBrandShaDistinctAds(brandId, newRepresentativeSha, dbClient);
    exactCreativeReuseCount = Math.max(1, reuseResult.count);
  }

  // 7. Resolve latest source account observation
  const [latestAccountObs] = await dbClient
    .select()
    .from(sourceAccountObservations)
    .where(eq(sourceAccountObservations.sourceAccountId, ad.sourceAccountId))
    .orderBy(
      desc(sourceAccountObservations.observedAt),
      desc(sourceAccountObservations.createdAt),
      desc(sourceAccountObservations.id),
    )
    .limit(1);

  // 8. Resolve latest regional transparency observations independently per region (single DISTINCT ON query)
  interface TransparencyQueryResult extends Record<string, unknown> {
    id: string;
    region: string;
    total_reach: string | null;
    target_age_min: number | null;
    target_age_max: number | null;
    target_gender: string | null;
    target_countries: string[] | null;
    reached_countries: string[] | null;
    observed_at: Date;
  }

  const transparencyRows = await dbClient.execute<TransparencyQueryResult>(
    sql`
      SELECT DISTINCT ON (ato.region)
        ato.id,
        ato.region,
        ato.total_reach,
        ato.target_age_min,
        ato.target_age_max,
        ato.target_gender,
        ato.target_countries,
        ato.reached_countries,
        ato.observed_at
      FROM ${adTransparencyObservations} ato
      JOIN ${adObservations} ao ON ao.id = ato.ad_observation_id
      WHERE ao.ad_id = ${adId}
      ORDER BY ato.region, ato.observed_at DESC, ao.observed_at DESC, ato.created_at DESC, ato.id DESC
    `,
  );

  const rawRows = Array.isArray(transparencyRows)
    ? transparencyRows
    : (transparencyRows as unknown as { rows: TransparencyQueryResult[] }).rows ?? [];

  const euObs = rawRows.find((r) => r.region === "EU") ?? null;
  const ukObs = rawRows.find((r) => r.region === "UK") ?? null;
  const brObs = rawRows.find((r) => r.region === "BR") ?? null;

  // 9. Aggregate target and reached countries (deterministic union)
  const allTargetCountries = mergeCountryArrays(
    euObs?.target_countries,
    ukObs?.target_countries,
    brObs?.target_countries,
  );
  const allReachedCountries = mergeCountryArrays(
    euObs?.reached_countries,
    ukObs?.reached_countries,
    brObs?.reached_countries,
  );

  // 10. Build projection row
  const projectionRow: NewAdDiscoveryIndexRow = {
    adId: ad.id,
    brandId,
    sourceAccountId: ad.sourceAccountId,
    sourceAdId: ad.sourceAdId,

    isActive: ad.isActiveObserved,
    startDate: ad.platformStartAt,
    firstSeenAt: ad.firstSeenAt,
    lastSeenAt: ad.lastSeenAt,

    representativeMediaType: repCreative.mediaType,
    representativeMediaAssetId: repCreative.mediaAssetId,
    representativeMediaSha256: newRepresentativeSha,
    representativeShapeFamily: repCreative.shapeFamily,
    representativeAspectRatio: repCreative.aspectRatio ? String(repCreative.aspectRatio) : null,
    videoDurationMs: repCreative.videoDurationMs,
    ctaType: ad.ctaType,
    publisherPlatforms: ad.publisherPlatforms ?? [],

    copyLengthChars: copyMetrics.copyLengthChars,
    copyLengthWords: copyMetrics.copyLengthWords,

    exactCreativeReuseCount,

    latestPageCategory: latestAccountObs?.pageCategory ?? null,
    latestInstagramFollowers: latestAccountObs?.instagramFollowers ?? null,
    latestFacebookLikes: latestAccountObs?.facebookLikes ?? null,
    latestFacebookVerified: latestAccountObs?.facebookVerified ?? null,
    latestInstagramVerified: latestAccountObs?.instagramVerified ?? null,

    hasEuTransparencyEvidence: Boolean(euObs),
    hasUkTransparencyEvidence: Boolean(ukObs),
    hasBrTransparencyEvidence: Boolean(brObs),

    latestEuTotalReach: euObs?.total_reach != null ? BigInt(euObs.total_reach) : null,
    latestUkTotalReach: ukObs?.total_reach != null ? BigInt(ukObs.total_reach) : null,
    latestBrTotalReach: brObs?.total_reach != null ? BigInt(brObs.total_reach) : null,

    latestEuTransparencyObservedAt: euObs ? new Date(euObs.observed_at) : null,
    latestUkTransparencyObservedAt: ukObs ? new Date(ukObs.observed_at) : null,
    latestBrTransparencyObservedAt: brObs ? new Date(brObs.observed_at) : null,

    latestEuTargetAgeMin: euObs?.target_age_min ?? null,
    latestEuTargetAgeMax: euObs?.target_age_max ?? null,
    latestEuTargetGender: euObs?.target_gender ?? null,

    latestUkTargetAgeMin: ukObs?.target_age_min ?? null,
    latestUkTargetAgeMax: ukObs?.target_age_max ?? null,
    latestUkTargetGender: ukObs?.target_gender ?? null,

    latestBrTargetAgeMin: brObs?.target_age_min ?? null,
    latestBrTargetAgeMax: brObs?.target_age_max ?? null,
    latestBrTargetGender: brObs?.target_gender ?? null,

    targetCountries: allTargetCountries,
    reachedCountries: allReachedCountries,

    projectedAt: new Date(),
  };

  // 11. Upsert into ad_discovery_index
  const [upserted] = await dbClient
    .insert(adDiscoveryIndex)
    .values(projectionRow)
    .onConflictDoUpdate({
      target: adDiscoveryIndex.adId,
      set: {
        brandId: projectionRow.brandId,
        sourceAccountId: projectionRow.sourceAccountId,
        sourceAdId: projectionRow.sourceAdId,
        isActive: projectionRow.isActive,
        startDate: projectionRow.startDate,
        firstSeenAt: projectionRow.firstSeenAt,
        lastSeenAt: projectionRow.lastSeenAt,
        representativeMediaType: projectionRow.representativeMediaType,
        representativeMediaAssetId: projectionRow.representativeMediaAssetId,
        representativeMediaSha256: projectionRow.representativeMediaSha256,
        representativeShapeFamily: projectionRow.representativeShapeFamily,
        representativeAspectRatio: projectionRow.representativeAspectRatio,
        videoDurationMs: projectionRow.videoDurationMs,
        ctaType: projectionRow.ctaType,
        publisherPlatforms: projectionRow.publisherPlatforms,
        copyLengthChars: projectionRow.copyLengthChars,
        copyLengthWords: projectionRow.copyLengthWords,
        exactCreativeReuseCount: projectionRow.exactCreativeReuseCount,
        latestPageCategory: projectionRow.latestPageCategory,
        latestInstagramFollowers: projectionRow.latestInstagramFollowers,
        latestFacebookLikes: projectionRow.latestFacebookLikes,
        latestFacebookVerified: projectionRow.latestFacebookVerified,
        latestInstagramVerified: projectionRow.latestInstagramVerified,
        hasEuTransparencyEvidence: projectionRow.hasEuTransparencyEvidence,
        hasUkTransparencyEvidence: projectionRow.hasUkTransparencyEvidence,
        hasBrTransparencyEvidence: projectionRow.hasBrTransparencyEvidence,
        latestEuTotalReach: projectionRow.latestEuTotalReach,
        latestUkTotalReach: projectionRow.latestUkTotalReach,
        latestBrTotalReach: projectionRow.latestBrTotalReach,
        latestEuTransparencyObservedAt: projectionRow.latestEuTransparencyObservedAt,
        latestUkTransparencyObservedAt: projectionRow.latestUkTransparencyObservedAt,
        latestBrTransparencyObservedAt: projectionRow.latestBrTransparencyObservedAt,
        latestEuTargetAgeMin: projectionRow.latestEuTargetAgeMin,
        latestEuTargetAgeMax: projectionRow.latestEuTargetAgeMax,
        latestEuTargetGender: projectionRow.latestEuTargetGender,
        latestUkTargetAgeMin: projectionRow.latestUkTargetAgeMin,
        latestUkTargetAgeMax: projectionRow.latestUkTargetAgeMax,
        latestUkTargetGender: projectionRow.latestUkTargetGender,
        latestBrTargetAgeMin: projectionRow.latestBrTargetAgeMin,
        latestBrTargetAgeMax: projectionRow.latestBrTargetAgeMax,
        latestBrTargetGender: projectionRow.latestBrTargetGender,
        targetCountries: projectionRow.targetCountries,
        reachedCountries: projectionRow.reachedCountries,
        projectedAt: projectionRow.projectedAt,
      },
    })
    .returning();

  // 12. Fanout A: Update reuse count on new SHA peers
  if (newRepresentativeSha) {
    const newShaResult = await countBrandShaDistinctAds(brandId, newRepresentativeSha, dbClient);
    const newCount = Math.max(1, newShaResult.count);
    const siblingNewIds = newShaResult.peerAdIds.filter((id) => id !== ad.id);

    if (siblingNewIds.length > 0) {
      await dbClient
        .update(adDiscoveryIndex)
        .set({
          exactCreativeReuseCount: newCount,
          projectedAt: new Date(),
        })
        .where(
          and(
            inArray(adDiscoveryIndex.adId, siblingNewIds),
            eq(adDiscoveryIndex.representativeMediaSha256, newRepresentativeSha),
          ),
        );
    }
  }

  // 13. Fanout B: Update reuse count on old SHA peers when representative SHA changed (X -> Y)
  if (oldRepresentativeSha && oldRepresentativeSha !== newRepresentativeSha) {
    const oldShaResult = await countBrandShaDistinctAds(brandId, oldRepresentativeSha, dbClient);
    const oldCount = oldShaResult.count > 0 ? oldShaResult.count : 1;

    if (oldShaResult.peerAdIds.length > 0) {
      await dbClient
        .update(adDiscoveryIndex)
        .set({
          exactCreativeReuseCount: oldCount,
          projectedAt: new Date(),
        })
        .where(
          and(
            inArray(adDiscoveryIndex.adId, oldShaResult.peerAdIds),
            eq(adDiscoveryIndex.representativeMediaSha256, oldRepresentativeSha),
          ),
        );
    }
  }

  return upserted ?? null;
}

/**
 * Refreshes all projected ads for a given source account (e.g. upon new account observation).
 */
export async function projectSourceAccount(
  sourceAccountId: string,
  executor?: DbOrTx,
): Promise<number> {
  const dbClient = executor ?? defaultDb;

  const accountAds = await dbClient
    .select({ id: ads.id })
    .from(ads)
    .where(eq(ads.sourceAccountId, sourceAccountId));

  let count = 0;
  for (const a of accountAds) {
    await projectAd(a.id, dbClient);
    count++;
  }
  return count;
}

/**
 * Refreshes all projected ads for a given brand.
 */
export async function projectBrand(
  brandId: string,
  executor?: DbOrTx,
): Promise<number> {
  const dbClient = executor ?? defaultDb;

  const brandAds = await dbClient
    .select({ id: ads.id })
    .from(ads)
    .innerJoin(sourceAccounts, eq(sourceAccounts.id, ads.sourceAccountId))
    .where(eq(sourceAccounts.brandId, brandId));

  let count = 0;
  for (const a of brandAds) {
    await projectAd(a.id, dbClient);
    count++;
  }
  return count;
}

/**
 * Rebuilds the discovery projection across all or targeted canonical ads.
 */
export async function rebuildDiscoveryIndex(
  options: RebuildDiscoveryIndexOptions = {},
  executor?: DbOrTx,
): Promise<RebuildDiscoveryIndexResult> {
  const startTime = Date.now();
  const dbClient = executor ?? defaultDb;
  const chunkSize = options.chunkSize ?? 20;

  if (options.destructiveTruncate) {
    await dbClient.delete(adDiscoveryIndex);
  }

  const query = dbClient
    .select({ id: ads.id })
    .from(ads);

  if (options.adIds && options.adIds.length > 0) {
    query.where(inArray(ads.id, options.adIds));
  } else if (options.adId) {
    query.where(eq(ads.id, options.adId));
  }

  const allAdRows = await query;
  let totalProjected = 0;

  for (let i = 0; i < allAdRows.length; i += chunkSize) {
    const chunk = allAdRows.slice(i, i + chunkSize);
    for (const row of chunk) {
      await projectAd(row.id, dbClient);
    }
    totalProjected += chunk.length;
  }

  return {
    totalProjected,
    totalDeleted: 0,
    durationMs: Date.now() - startTime,
  };
}
