import "server-only";
import { db } from "@/db/client";
import {
  ads,
  brands,
  sourceAccounts,
  adMedia,
  adCards,
  cardMedia,
  mediaAssets,
} from "@/db/schema";
import { resolveMediaUrl } from "@/storage";
import { eq, inArray, desc, and, or, ilike } from "drizzle-orm";
import type {
  AdLibraryItem,
  AdLibraryCardItem,
  AdLibraryMediaItem,
  AdLibraryQueryParams,
} from "./types";
import { resolveCreativeVariations, sanitizeDisplayCopy } from "./utils";

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

  // Factual format filter (VIDEO, IMAGE, DCO, etc.)
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
      ? await query
          .where(and(...conditions))
          .orderBy(desc(ads.firstSeenAt), desc(ads.createdAt))
      : await query.orderBy(desc(ads.firstSeenAt), desc(ads.createdAt));

  if (adRows.length === 0) {
    return [];
  }

  const adIds = adRows.map((r) => r.id);

  // 2. Fetch direct media assets via ad_media join
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

  // Group direct media by adId
  const directMediaByAdId = new Map<string, AdLibraryMediaItem[]>();

  for (const m of mediaRows) {
    if (!m.storageKey) continue;
    let mediaUrl: string;
    try {
      mediaUrl = resolveMediaUrl(m.storageKey);
    } catch {
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

    const list = directMediaByAdId.get(m.adId) ?? [];
    list.push(mediaItem);
    directMediaByAdId.set(m.adId, list);
  }

  // 3. Fetch cards and card media for DCO / carousel ads
  const cardRows = await db
    .select({
      adId: adCards.adId,
      cardId: adCards.id,
      position: adCards.position,
      title: adCards.title,
      body: adCards.body,
      description: adCards.description,
      ctaText: adCards.ctaText,
      ctaType: adCards.ctaType,
      destinationUrl: adCards.destinationUrl,
    })
    .from(adCards)
    .where(inArray(adCards.adId, adIds))
    .orderBy(adCards.position);

  const cardIds = cardRows.map((c) => c.cardId);

  let cardMediaRows: {
    adCardId: string;
    mediaAssetId: string;
    mediaType: string;
    role: string | null;
    position: number;
    storageKey: string | null;
    mimeType: string | null;
  }[] = [];

  if (cardIds.length > 0) {
    cardMediaRows = await db
      .select({
        adCardId: cardMedia.adCardId,
        mediaAssetId: mediaAssets.id,
        mediaType: mediaAssets.mediaType,
        role: cardMedia.role,
        position: cardMedia.position,
        storageKey: mediaAssets.storageKey,
        mimeType: mediaAssets.mimeType,
      })
      .from(cardMedia)
      .innerJoin(mediaAssets, eq(cardMedia.mediaAssetId, mediaAssets.id))
      .where(inArray(cardMedia.adCardId, cardIds))
      .orderBy(cardMedia.position);
  }

  // Group card media by adCardId
  const mediaByCardId = new Map<string, AdLibraryMediaItem[]>();
  for (const cm of cardMediaRows) {
    if (!cm.storageKey) continue;
    let mediaUrl: string;
    try {
      mediaUrl = resolveMediaUrl(cm.storageKey);
    } catch {
      continue;
    }

    const mediaItem: AdLibraryMediaItem = {
      id: cm.mediaAssetId,
      mediaType: (cm.mediaType as "IMAGE" | "VIDEO" | "UNKNOWN") ?? "UNKNOWN",
      role: cm.role ?? "card",
      position: cm.position,
      mimeType: cm.mimeType,
      mediaUrl,
    };

    const list = mediaByCardId.get(cm.adCardId) ?? [];
    list.push(mediaItem);
    mediaByCardId.set(cm.adCardId, list);
  }

  // Group structured cards by adId
  const cardsByAdId = new Map<string, AdLibraryCardItem[]>();
  for (const cr of cardRows) {
    const cardMediaList = mediaByCardId.get(cr.cardId) ?? [];
    const cardItem: AdLibraryCardItem = {
      id: cr.cardId,
      position: cr.position,
      headline: sanitizeDisplayCopy(cr.title),
      body: sanitizeDisplayCopy(cr.body),
      description: sanitizeDisplayCopy(cr.description),
      ctaText: cr.ctaText ?? null,
      ctaType: cr.ctaType ?? null,
      destinationUrl: cr.destinationUrl ?? null,
      media: cardMediaList,
    };

    const list = cardsByAdId.get(cr.adId) ?? [];
    list.push(cardItem);
    cardsByAdId.set(cr.adId, list);
  }

  // 4. Assemble canonical AdLibraryItem records with display-copy resolution
  const items: AdLibraryItem[] = [];

  for (const row of adRows) {
    const directMedia = directMediaByAdId.get(row.id) ?? [];
    const sourceCards = cardsByAdId.get(row.id) ?? [];
    const variations = resolveCreativeVariations(sourceCards);

    // Media list: if direct media is present, use it; otherwise, flatten unique variation media
    let media: AdLibraryMediaItem[];
    if (directMedia.length > 0) {
      media = directMedia;
    } else {
      const seenAssetIds = new Set<string>();
      media = [];
      for (const v of variations) {
        for (const m of v.media) {
          if (!seenAssetIds.has(m.id)) {
            seenAssetIds.add(m.id);
            media.push(m);
          }
        }
      }
    }

    if (media.length === 0) continue; // Require canonical media for discoverable atlas items

    // Display copy resolution:
    // 1. Sanitize ad-level fields to reject raw {{...}} template tokens
    // 2. If ad-level field is a template token or null, fall back to first concrete variation field
    let headline = sanitizeDisplayCopy(row.headline);
    if (!headline && variations.length > 0) {
      headline = variations.find((v) => v.headline !== null)?.headline ?? null;
    }

    let primaryText = sanitizeDisplayCopy(row.primaryText);
    if (!primaryText && variations.length > 0) {
      primaryText = variations.find((v) => v.body !== null)?.body ?? null;
    }

    let description = sanitizeDisplayCopy(row.description);
    if (!description && variations.length > 0) {
      description = variations.find((v) => v.description !== null)?.description ?? null;
    }

    const ctaText = row.ctaText ?? (variations.length > 0 ? variations[0].ctaText : null);
    const ctaType = row.ctaType ?? (variations.length > 0 ? variations[0].ctaType : null);
    const destinationUrl =
      row.destinationUrl ?? (variations.length > 0 ? variations[0].destinationUrl : null);

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
      primaryText,
      headline,
      description,
      ctaText,
      ctaType,
      destinationUrl,
      publisherPlatforms: row.publisherPlatforms,
      isActiveObserved: row.isActiveObserved,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      adLibraryUrl: row.adLibraryUrl,
      media,
      sourceCards,
      variations,
      cards: sourceCards,
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

  // Direct media
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

  const directMedia: AdLibraryMediaItem[] = [];
  for (const m of mediaRows) {
    if (!m.storageKey) continue;
    try {
      const mediaUrl = resolveMediaUrl(m.storageKey);
      directMedia.push({
        id: m.mediaAssetId,
        mediaType: (m.mediaType as "IMAGE" | "VIDEO" | "UNKNOWN") ?? "UNKNOWN",
        role: m.role,
        position: m.position,
        mimeType: m.mimeType,
        mediaUrl,
      });
    } catch {
      continue;
    }
  }

  // Cards
  const cardRows = await db
    .select({
      cardId: adCards.id,
      position: adCards.position,
      title: adCards.title,
      body: adCards.body,
      description: adCards.description,
      ctaText: adCards.ctaText,
      ctaType: adCards.ctaType,
      destinationUrl: adCards.destinationUrl,
    })
    .from(adCards)
    .where(eq(adCards.adId, id))
    .orderBy(adCards.position);

  const cardIds = cardRows.map((c) => c.cardId);

  let cardMediaRows: {
    adCardId: string;
    mediaAssetId: string;
    mediaType: string;
    role: string | null;
    position: number;
    storageKey: string | null;
    mimeType: string | null;
  }[] = [];

  if (cardIds.length > 0) {
    cardMediaRows = await db
      .select({
        adCardId: cardMedia.adCardId,
        mediaAssetId: mediaAssets.id,
        mediaType: mediaAssets.mediaType,
        role: cardMedia.role,
        position: cardMedia.position,
        storageKey: mediaAssets.storageKey,
        mimeType: mediaAssets.mimeType,
      })
      .from(cardMedia)
      .innerJoin(mediaAssets, eq(cardMedia.mediaAssetId, mediaAssets.id))
      .where(inArray(cardMedia.adCardId, cardIds))
      .orderBy(cardMedia.position);
  }

  const mediaByCardId = new Map<string, AdLibraryMediaItem[]>();
  for (const cm of cardMediaRows) {
    if (!cm.storageKey) continue;
    try {
      const mediaUrl = resolveMediaUrl(cm.storageKey);
      const mediaItem: AdLibraryMediaItem = {
        id: cm.mediaAssetId,
        mediaType: (cm.mediaType as "IMAGE" | "VIDEO" | "UNKNOWN") ?? "UNKNOWN",
        role: cm.role ?? "card",
        position: cm.position,
        mimeType: cm.mimeType,
        mediaUrl,
      };
      const list = mediaByCardId.get(cm.adCardId) ?? [];
      list.push(mediaItem);
      mediaByCardId.set(cm.adCardId, list);
    } catch {
      continue;
    }
  }

  const sourceCards: AdLibraryCardItem[] = cardRows.map((cr) => ({
    id: cr.cardId,
    position: cr.position,
    headline: sanitizeDisplayCopy(cr.title),
    body: sanitizeDisplayCopy(cr.body),
    description: sanitizeDisplayCopy(cr.description),
    ctaText: cr.ctaText ?? null,
    ctaType: cr.ctaType ?? null,
    destinationUrl: cr.destinationUrl ?? null,
    media: mediaByCardId.get(cr.cardId) ?? [],
  }));

  const variations = resolveCreativeVariations(sourceCards);

  // Resolve media list
  let media: AdLibraryMediaItem[];
  if (directMedia.length > 0) {
    media = directMedia;
  } else {
    const seenAssetIds = new Set<string>();
    media = [];
    for (const v of variations) {
      for (const m of v.media) {
        if (!seenAssetIds.has(m.id)) {
          seenAssetIds.add(m.id);
          media.push(m);
        }
      }
    }
  }

  let headline = sanitizeDisplayCopy(row.headline);
  if (!headline && variations.length > 0) {
    headline = variations.find((v) => v.headline !== null)?.headline ?? null;
  }

  let primaryText = sanitizeDisplayCopy(row.primaryText);
  if (!primaryText && variations.length > 0) {
    primaryText = variations.find((v) => v.body !== null)?.body ?? null;
  }

  let description = sanitizeDisplayCopy(row.description);
  if (!description && variations.length > 0) {
    description = variations.find((v) => v.description !== null)?.description ?? null;
  }

  const ctaText = row.ctaText ?? (variations.length > 0 ? variations[0].ctaText : null);
  const ctaType = row.ctaType ?? (variations.length > 0 ? variations[0].ctaType : null);
  const destinationUrl =
    row.destinationUrl ?? (variations.length > 0 ? variations[0].destinationUrl : null);

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
    primaryText,
    headline,
    description,
    ctaText,
    ctaType,
    destinationUrl,
    publisherPlatforms: row.publisherPlatforms,
    isActiveObserved: row.isActiveObserved,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    adLibraryUrl: row.adLibraryUrl,
    media,
    sourceCards,
    variations,
    cards: sourceCards,
  };
}
