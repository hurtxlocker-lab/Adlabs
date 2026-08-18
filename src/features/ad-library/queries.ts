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
  mediaDerivatives,
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
 * Resolves READY PREVIEW_LOOP preview-loop-v1 derivative URLs for a set of source media asset IDs.
 */
async function resolvePreviewLoopUrls(
  sourceMediaAssetIds: string[],
): Promise<Map<string, string>> {
  if (sourceMediaAssetIds.length === 0) return new Map();

  const derivativeRows = await db
    .select({
      sourceMediaAssetId: mediaDerivatives.sourceMediaAssetId,
      storageKey: mediaAssets.storageKey,
    })
    .from(mediaDerivatives)
    .innerJoin(
      mediaAssets,
      eq(mediaDerivatives.derivedMediaAssetId, mediaAssets.id),
    )
    .where(
      and(
        inArray(mediaDerivatives.sourceMediaAssetId, sourceMediaAssetIds),
        eq(mediaDerivatives.derivativeKind, "PREVIEW_LOOP"),
        eq(mediaDerivatives.recipeVersion, "preview-loop-v1"),
        eq(mediaDerivatives.status, "READY"),
      ),
    );

  const previewMap = new Map<string, string>();
  for (const row of derivativeRows) {
    if (!row.storageKey) continue;
    try {
      previewMap.set(row.sourceMediaAssetId, resolveMediaUrl(row.storageKey));
    } catch {
      // Ignore resolution failure on malformed key
    }
  }
  return previewMap;
}

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
      width: mediaAssets.width,
      height: mediaAssets.height,
    })
    .from(adMedia)
    .innerJoin(mediaAssets, eq(adMedia.mediaAssetId, mediaAssets.id))
    .where(inArray(adMedia.adId, adIds))
    .orderBy(adMedia.position);

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
    width: number | null;
    height: number | null;
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
        width: mediaAssets.width,
        height: mediaAssets.height,
      })
      .from(cardMedia)
      .innerJoin(mediaAssets, eq(cardMedia.mediaAssetId, mediaAssets.id))
      .where(inArray(cardMedia.adCardId, cardIds))
      .orderBy(cardMedia.position);
  }

  // Collect all unique video source media asset IDs to resolve derivatives
  const allVideoSourceAssetIds = Array.from(
    new Set(
      [...mediaRows, ...cardMediaRows]
        .filter((m) => m.mediaType === "VIDEO")
        .map((m) => m.mediaAssetId),
    ),
  );

  const previewLoopMap = await resolvePreviewLoopUrls(allVideoSourceAssetIds);

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

    const previewLoopUrl =
      m.mediaType === "VIDEO" ? previewLoopMap.get(m.mediaAssetId) ?? null : null;

    const mediaItem: AdLibraryMediaItem = {
      id: m.mediaAssetId,
      mediaType: (m.mediaType as "IMAGE" | "VIDEO" | "UNKNOWN") ?? "UNKNOWN",
      role: m.role,
      position: m.position,
      mimeType: m.mimeType,
      mediaUrl,
      previewLoopUrl,
      width: m.width,
      height: m.height,
    };

    const list = directMediaByAdId.get(m.adId) ?? [];
    list.push(mediaItem);
    directMediaByAdId.set(m.adId, list);
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

    const previewLoopUrl =
      cm.mediaType === "VIDEO" ? previewLoopMap.get(cm.mediaAssetId) ?? null : null;

    const mediaItem: AdLibraryMediaItem = {
      id: cm.mediaAssetId,
      mediaType: (cm.mediaType as "IMAGE" | "VIDEO" | "UNKNOWN") ?? "UNKNOWN",
      role: cm.role ?? "card",
      position: cm.position,
      mimeType: cm.mimeType,
      mediaUrl,
      previewLoopUrl,
      width: cm.width,
      height: cm.height,
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
    const media = directMediaByAdId.get(row.id) ?? [];
    const sourceCards = cardsByAdId.get(row.id) ?? [];

    // Factual copy resolution fallback:
    // If ad top-level headline/body is empty (common for DCO/carousels),
    // derive displayed headline/body from Card 0 to ensure presentation integrity.
    const card0 = sourceCards.length > 0 ? sourceCards[0] : undefined;
    const headline = sanitizeDisplayCopy(row.headline) || (card0?.headline ?? null);
    const primaryText = sanitizeDisplayCopy(row.primaryText) || (card0?.body ?? null);
    const description = sanitizeDisplayCopy(row.description) || (card0?.description ?? null);
    const ctaText = row.ctaText ?? (card0?.ctaText ?? null);
    const ctaType = row.ctaType ?? (card0?.ctaType ?? null);
    const destinationUrl = row.destinationUrl ?? (card0?.destinationUrl ?? null);

    // Resolve deduped product-facing creative variations from raw source cards
    const variations = resolveCreativeVariations(sourceCards);

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
 * Bulk-hydrates a set of canonical ad IDs into AdLibraryItem records,
 * preserving the EXACT input ordering.
 *
 * This is the correct hydration path for discovery-engine results where
 * ordering is determined upstream by queryDiscoveryAds. It issues bounded
 * bulk queries (ads join, direct media, cards, card media, derivatives) —
 * never one query per ad.
 *
 * Missing canonical rows (deleted or not yet propagated) are skipped
 * and omitted from the result; callers must not assume length === adIds.length.
 */
export async function getAdLibraryItemsByIds(
  adIds: string[],
): Promise<AdLibraryItem[]> {
  if (adIds.length === 0) return [];

  // 1. Fetch ads with source account and brand in one bulk query
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
    .where(inArray(ads.id, adIds));

  if (adRows.length === 0) return [];

  // Build index of fetched rows by ad ID for O(1) lookup during assembly
  const adRowById = new Map(adRows.map((r) => [r.id, r]));

  // 2. Fetch direct media assets in one bulk query
  const mediaRows = await db
    .select({
      adId: adMedia.adId,
      mediaAssetId: mediaAssets.id,
      mediaType: mediaAssets.mediaType,
      role: adMedia.role,
      position: adMedia.position,
      storageKey: mediaAssets.storageKey,
      mimeType: mediaAssets.mimeType,
      width: mediaAssets.width,
      height: mediaAssets.height,
    })
    .from(adMedia)
    .innerJoin(mediaAssets, eq(adMedia.mediaAssetId, mediaAssets.id))
    .where(inArray(adMedia.adId, adIds))
    .orderBy(adMedia.position);

  // 3. Fetch cards in one bulk query
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

  // 4. Fetch card media in one bulk query (only if cards exist)
  let cardMediaRows: {
    adCardId: string;
    mediaAssetId: string;
    mediaType: string;
    role: string | null;
    position: number;
    storageKey: string | null;
    mimeType: string | null;
    width: number | null;
    height: number | null;
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
        width: mediaAssets.width,
        height: mediaAssets.height,
      })
      .from(cardMedia)
      .innerJoin(mediaAssets, eq(cardMedia.mediaAssetId, mediaAssets.id))
      .where(inArray(cardMedia.adCardId, cardIds))
      .orderBy(cardMedia.position);
  }

  // 5. Resolve derivative preview-loop URLs for all video assets in one bulk query
  const allVideoSourceAssetIds = Array.from(
    new Set(
      [...mediaRows, ...cardMediaRows]
        .filter((m) => m.mediaType === "VIDEO")
        .map((m) => m.mediaAssetId),
    ),
  );
  const previewLoopMap = await resolvePreviewLoopUrls(allVideoSourceAssetIds);

  // Index direct media by adId
  const directMediaByAdId = new Map<string, AdLibraryMediaItem[]>();
  for (const m of mediaRows) {
    if (!m.storageKey) continue;
    let mediaUrl: string;
    try {
      mediaUrl = resolveMediaUrl(m.storageKey);
    } catch {
      continue;
    }
    const previewLoopUrl =
      m.mediaType === "VIDEO" ? previewLoopMap.get(m.mediaAssetId) ?? null : null;
    const mediaItem: AdLibraryMediaItem = {
      id: m.mediaAssetId,
      mediaType: (m.mediaType as "IMAGE" | "VIDEO" | "UNKNOWN") ?? "UNKNOWN",
      role: m.role,
      position: m.position,
      mimeType: m.mimeType,
      mediaUrl,
      previewLoopUrl,
      width: m.width,
      height: m.height,
    };
    const list = directMediaByAdId.get(m.adId) ?? [];
    list.push(mediaItem);
    directMediaByAdId.set(m.adId, list);
  }

  // Index card media by cardId
  const mediaByCardId = new Map<string, AdLibraryMediaItem[]>();
  for (const cm of cardMediaRows) {
    if (!cm.storageKey) continue;
    let mediaUrl: string;
    try {
      mediaUrl = resolveMediaUrl(cm.storageKey);
    } catch {
      continue;
    }
    const previewLoopUrl =
      cm.mediaType === "VIDEO" ? previewLoopMap.get(cm.mediaAssetId) ?? null : null;
    const mediaItem: AdLibraryMediaItem = {
      id: cm.mediaAssetId,
      mediaType: (cm.mediaType as "IMAGE" | "VIDEO" | "UNKNOWN") ?? "UNKNOWN",
      role: cm.role ?? "card",
      position: cm.position,
      mimeType: cm.mimeType,
      mediaUrl,
      previewLoopUrl,
      width: cm.width,
      height: cm.height,
    };
    const list = mediaByCardId.get(cm.adCardId) ?? [];
    list.push(mediaItem);
    mediaByCardId.set(cm.adCardId, list);
  }

  // Index structured cards by adId
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

  // Assemble results in EXACT input ID order, skipping missing rows
  const items: AdLibraryItem[] = [];
  for (const adId of adIds) {
    const row = adRowById.get(adId);
    if (!row) continue; // Missing canonical row — skip, do not reorder

    const media = directMediaByAdId.get(row.id) ?? [];
    const sourceCards = cardsByAdId.get(row.id) ?? [];

    const card0 = sourceCards.length > 0 ? sourceCards[0] : undefined;
    const headline = sanitizeDisplayCopy(row.headline) || (card0?.headline ?? null);
    const primaryText = sanitizeDisplayCopy(row.primaryText) || (card0?.body ?? null);
    const description = sanitizeDisplayCopy(row.description) || (card0?.description ?? null);
    const ctaText = row.ctaText ?? (card0?.ctaText ?? null);
    const ctaType = row.ctaType ?? (card0?.ctaType ?? null);
    const destinationUrl = row.destinationUrl ?? (card0?.destinationUrl ?? null);

    const variations = resolveCreativeVariations(sourceCards);

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

  const row = adRows[0]!;

  // Direct media
  const mediaRows = await db
    .select({
      mediaAssetId: mediaAssets.id,
      mediaType: mediaAssets.mediaType,
      role: adMedia.role,
      position: adMedia.position,
      storageKey: mediaAssets.storageKey,
      mimeType: mediaAssets.mimeType,
      width: mediaAssets.width,
      height: mediaAssets.height,
    })
    .from(adMedia)
    .innerJoin(mediaAssets, eq(adMedia.mediaAssetId, mediaAssets.id))
    .where(eq(adMedia.adId, id))
    .orderBy(adMedia.position);

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
    width: number | null;
    height: number | null;
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
        width: mediaAssets.width,
        height: mediaAssets.height,
      })
      .from(cardMedia)
      .innerJoin(mediaAssets, eq(cardMedia.mediaAssetId, mediaAssets.id))
      .where(inArray(cardMedia.adCardId, cardIds))
      .orderBy(cardMedia.position);
  }

  // Collect video source IDs
  const allVideoSourceAssetIds = Array.from(
    new Set(
      [...mediaRows, ...cardMediaRows]
        .filter((m) => m.mediaType === "VIDEO")
        .map((m) => m.mediaAssetId),
    ),
  );

  const previewLoopMap = await resolvePreviewLoopUrls(allVideoSourceAssetIds);

  const directMedia: AdLibraryMediaItem[] = [];
  for (const m of mediaRows) {
    if (!m.storageKey) continue;
    try {
      const mediaUrl = resolveMediaUrl(m.storageKey);
      const previewLoopUrl =
        m.mediaType === "VIDEO" ? previewLoopMap.get(m.mediaAssetId) ?? null : null;

      directMedia.push({
        id: m.mediaAssetId,
        mediaType: (m.mediaType as "IMAGE" | "VIDEO" | "UNKNOWN") ?? "UNKNOWN",
        role: m.role,
        position: m.position,
        mimeType: m.mimeType,
        mediaUrl,
        previewLoopUrl,
        width: m.width,
        height: m.height,
      });
    } catch {
      continue;
    }
  }

  const mediaByCardId = new Map<string, AdLibraryMediaItem[]>();
  for (const cm of cardMediaRows) {
    if (!cm.storageKey) continue;
    try {
      const mediaUrl = resolveMediaUrl(cm.storageKey);
      const previewLoopUrl =
        cm.mediaType === "VIDEO" ? previewLoopMap.get(cm.mediaAssetId) ?? null : null;

      const mediaItem: AdLibraryMediaItem = {
        id: cm.mediaAssetId,
        mediaType: (cm.mediaType as "IMAGE" | "VIDEO" | "UNKNOWN") ?? "UNKNOWN",
        role: cm.role ?? "card",
        position: cm.position,
        mimeType: cm.mimeType,
        mediaUrl,
        previewLoopUrl,
        width: cm.width,
        height: cm.height,
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

  const card0 = sourceCards.length > 0 ? sourceCards[0] : undefined;
  const headline = sanitizeDisplayCopy(row.headline) || (card0?.headline ?? null);
  const primaryText = sanitizeDisplayCopy(row.primaryText) || (card0?.body ?? null);
  const description = sanitizeDisplayCopy(row.description) || (card0?.description ?? null);
  const ctaText = row.ctaText ?? (card0?.ctaText ?? null);
  const ctaType = row.ctaType ?? (card0?.ctaType ?? null);
  const destinationUrl = row.destinationUrl ?? (card0?.destinationUrl ?? null);

  const variations = resolveCreativeVariations(sourceCards);

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
    media: directMedia,
    sourceCards,
    variations,
    cards: sourceCards,
  };
}
