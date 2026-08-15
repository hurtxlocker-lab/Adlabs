import "server-only";
import { db } from "@/db/client";
import { ads, brands, sourceAccounts, adMedia, mediaAssets } from "@/db/schema";
import { resolveMediaUrl } from "@/storage";
import { eq, inArray, desc, and, or, ilike } from "drizzle-orm";
import type {
  AdLibraryItem,
  AdLibraryMediaItem,
  AdLibraryQueryParams,
} from "./types";

/**
 * Retrieves factual ad library items for Discover surfaces.
 * Based on pure domain parameters (search, format, brand, active state).
 */
export async function getAdLibraryItems(
  params?: AdLibraryQueryParams,
): Promise<AdLibraryItem[]> {
  const conditions = [];

  // Factual search across brand name, headline, primary text, and source ad ID
  if (params?.search && params.search.trim() !== "") {
    const term = `%${params.search.trim()}%`;
    conditions.push(
      or(
        ilike(brands.name, term),
        ilike(ads.headline, term),
        ilike(ads.primaryText, term),
        ilike(ads.sourceAdId, term),
      ),
    );
  }

  // Factual format filter (VIDEO, IMAGE, etc.)
  if (params?.format && params.format.trim() !== "") {
    const fmt = params.format.trim().toUpperCase();
    conditions.push(eq(ads.displayFormat, fmt));
  }

  // Factual brand slug filter
  if (params?.brand && params.brand.trim() !== "") {
    conditions.push(eq(brands.slug, params.brand.trim().toLowerCase()));
  }

  // Factual observed active state filter
  if (params?.active !== undefined && params.active !== "") {
    if (params.active === "true") {
      conditions.push(eq(ads.isActiveObserved, true));
    } else if (params.active === "false") {
      conditions.push(eq(ads.isActiveObserved, false));
    }
  }

  // 1. Fetch ads with source account and brand
  const query = db
    .select({
      id: ads.id,
      source: ads.source,
      sourceAdId: ads.sourceAdId,
      displayFormat: ads.displayFormat,
      primaryText: ads.primaryText,
      headline: ads.headline,
      description: ads.description,
      ctaText: ads.ctaText,
      ctaType: ads.ctaType,
      destinationUrl: ads.destinationUrl,
      publisherPlatforms: ads.publisherPlatforms,
      isActiveObserved: ads.isActiveObserved,
      firstSeenAt: ads.firstSeenAt,
      lastSeenAt: ads.lastSeenAt,
      adLibraryUrl: ads.adLibraryUrl,
      brandId: brands.id,
      brandName: brands.name,
      brandSlug: brands.slug,
    })
    .from(ads)
    .innerJoin(sourceAccounts, eq(ads.sourceAccountId, sourceAccounts.id))
    .innerJoin(brands, eq(sourceAccounts.brandId, brands.id));

  const adRows =
    conditions.length > 0
      ? await query.where(and(...conditions)).orderBy(desc(ads.firstSeenAt), desc(ads.createdAt))
      : await query.orderBy(desc(ads.firstSeenAt), desc(ads.createdAt));

  if (adRows.length === 0) {
    return [];
  }

  const adIds = adRows.map((r) => r.id);

  // 2. Fetch associated media assets via ad_media join
  const mediaRows = await db
    .select({
      adId: adMedia.adId,
      mediaAssetId: mediaAssets.id,
      mediaType: mediaAssets.mediaType,
      role: adMedia.role,
      position: adMedia.position,
      storageKey: mediaAssets.storageKey,
      mimeType: mediaAssets.mimeType,
    })
    .from(adMedia)
    .innerJoin(mediaAssets, eq(adMedia.mediaAssetId, mediaAssets.id))
    .where(inArray(adMedia.adId, adIds))
    .orderBy(adMedia.position);

  // Group media by adId
  const mediaByAdId = new Map<string, AdLibraryMediaItem[]>();

  for (const m of mediaRows) {
    if (!m.storageKey) continue;

    let mediaUrl: string;
    try {
      mediaUrl = resolveMediaUrl(m.storageKey);
    } catch {
      // Safely skip any legacy non-canonical media keys
      continue;
    }

    const mediaItem: AdLibraryMediaItem = {
      id: m.mediaAssetId,
      mediaType: (m.mediaType as "IMAGE" | "VIDEO" | "UNKNOWN") ?? "UNKNOWN",
      role: m.role,
      position: m.position,
      mimeType: m.mimeType,
      mediaUrl,
    };

    const list = mediaByAdId.get(m.adId) ?? [];
    list.push(mediaItem);
    mediaByAdId.set(m.adId, list);
  }

  // 3. Assemble AdLibraryItem records (only returning items with resolved media)
  const items: AdLibraryItem[] = [];

  for (const row of adRows) {
    const media = mediaByAdId.get(row.id) ?? [];
    if (media.length === 0) continue; // Require canonical media for discoverable atlas items

    items.push({
      id: row.id,
      source: row.source,
      sourceAdId: row.sourceAdId,
      brand: {
        id: row.brandId,
        name: row.brandName,
        slug: row.brandSlug,
      },
      displayFormat: row.displayFormat,
      primaryText: row.primaryText,
      headline: row.headline,
      description: row.description,
      ctaText: row.ctaText,
      ctaType: row.ctaType,
      destinationUrl: row.destinationUrl,
      publisherPlatforms: row.publisherPlatforms,
      isActiveObserved: row.isActiveObserved,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      adLibraryUrl: row.adLibraryUrl,
      media,
    });
  }

  return items;
}

/**
 * Retrieves a single factual ad library item by internal UUID.
 */
export async function getAdLibraryItemById(
  id: string,
): Promise<AdLibraryItem | null> {
  const adRows = await db
    .select({
      id: ads.id,
      source: ads.source,
      sourceAdId: ads.sourceAdId,
      displayFormat: ads.displayFormat,
      primaryText: ads.primaryText,
      headline: ads.headline,
      description: ads.description,
      ctaText: ads.ctaText,
      ctaType: ads.ctaType,
      destinationUrl: ads.destinationUrl,
      publisherPlatforms: ads.publisherPlatforms,
      isActiveObserved: ads.isActiveObserved,
      firstSeenAt: ads.firstSeenAt,
      lastSeenAt: ads.lastSeenAt,
      adLibraryUrl: ads.adLibraryUrl,
      brandId: brands.id,
      brandName: brands.name,
      brandSlug: brands.slug,
    })
    .from(ads)
    .innerJoin(sourceAccounts, eq(ads.sourceAccountId, sourceAccounts.id))
    .innerJoin(brands, eq(sourceAccounts.brandId, brands.id))
    .where(eq(ads.id, id))
    .limit(1);

  if (adRows.length === 0) {
    return null;
  }

  const row = adRows[0];

  const mediaRows = await db
    .select({
      mediaAssetId: mediaAssets.id,
      mediaType: mediaAssets.mediaType,
      role: adMedia.role,
      position: adMedia.position,
      storageKey: mediaAssets.storageKey,
      mimeType: mediaAssets.mimeType,
    })
    .from(adMedia)
    .innerJoin(mediaAssets, eq(adMedia.mediaAssetId, mediaAssets.id))
    .where(eq(adMedia.adId, id))
    .orderBy(adMedia.position);

  const media: AdLibraryMediaItem[] = [];
  for (const m of mediaRows) {
    if (!m.storageKey) continue;
    try {
      const mediaUrl = resolveMediaUrl(m.storageKey);
      media.push({
        id: m.mediaAssetId,
        mediaType: (m.mediaType as "IMAGE" | "VIDEO" | "UNKNOWN") ?? "UNKNOWN",
        role: m.role,
        position: m.position,
        mimeType: m.mimeType,
        mediaUrl,
      });
    } catch {
      // Safely skip legacy non-canonical storage keys
      continue;
    }
  }

  return {
    id: row.id,
    source: row.source,
    sourceAdId: row.sourceAdId,
    brand: {
      id: row.brandId,
      name: row.brandName,
      slug: row.brandSlug,
    },
    displayFormat: row.displayFormat,
    primaryText: row.primaryText,
    headline: row.headline,
    description: row.description,
    ctaText: row.ctaText,
    ctaType: row.ctaType,
    destinationUrl: row.destinationUrl,
    publisherPlatforms: row.publisherPlatforms,
    isActiveObserved: row.isActiveObserved,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    adLibraryUrl: row.adLibraryUrl,
    media,
  };
}
