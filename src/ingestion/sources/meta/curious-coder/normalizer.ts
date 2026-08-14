import type {
  SourceAd,
  SourceAdCard,
  SourceMedia,
} from "@/ingestion/types";
import type {
  CuriousCoderCard,
  CuriousCoderImage,
  CuriousCoderItem,
  CuriousCoderVideo,
} from "./schema";

/**
 * Pure helper to safely extract string copy from text or markup objects.
 */
function extractCopyText(
  value:
    | string
    | { markup?: { __html?: string } | null; text?: string | null }
    | Record<string, unknown>
    | null
    | undefined,
): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? value : null;
  }
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") {
      const trimmed = value.text.trim();
      if (trimmed.length > 0) return value.text;
    }
    if (
      "markup" in value &&
      value.markup &&
      typeof value.markup === "object" &&
      "__html" in value.markup &&
      typeof value.markup.__html === "string"
    ) {
      const trimmed = value.markup.__html.trim();
      if (trimmed.length > 0) return value.markup.__html;
    }
  }
  return null;
}

/**
 * Pure, defensive date parser for provider timestamps.
 * Accepts numeric epoch (seconds or ms) or ISO string format.
 */
export function parseProviderDate(
  primary?: number | string | null,
  fallback?: string | null,
): Date | null {
  if (primary != null) {
    if (typeof primary === "number") {
      if (!Number.isNaN(primary) && primary > 0) {
        // Distinguish seconds from milliseconds (epoch seconds < 1e11)
        const ms = primary < 100_000_000_000 ? primary * 1000 : primary;
        const d = new Date(ms);
        if (!Number.isNaN(d.getTime())) return d;
      }
    } else if (typeof primary === "string" && primary.trim().length > 0) {
      const d = new Date(primary.trim());
      if (!Number.isNaN(d.getTime())) return d;
    }
  }

  if (
    fallback != null &&
    typeof fallback === "string" &&
    fallback.trim().length > 0
  ) {
    const d = new Date(fallback.trim());
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

/**
 * Normalizes publisher platform arrays with deterministic deduplication
 * while strictly preserving original provider casing and values.
 */
function normalizePlatforms(
  platform?: string[] | string | null,
  platforms?: string[] | null,
): string[] {
  const collected: string[] = [];

  if (Array.isArray(platform)) {
    for (const p of platform) {
      if (typeof p === "string" && p.trim().length > 0) {
        collected.push(p.trim());
      }
    }
  } else if (typeof platform === "string" && platform.trim().length > 0) {
    collected.push(platform.trim());
  }

  if (Array.isArray(platforms)) {
    for (const p of platforms) {
      if (typeof p === "string" && p.trim().length > 0) {
        collected.push(p.trim());
      }
    }
  }

  // Preserve insertion order while removing duplicates (no lowercasing)
  return Array.from(new Set(collected));
}

/**
 * Extracts video renditions and preview image according to M0 precedence:
 *  - HD video URL takes precedence over SD video URL
 *  - Preview image is preserved separately with role: "preview"
 */
function extractVideoMedia(
  video: CuriousCoderVideo,
  defaultRole = "primary",
): SourceMedia[] {
  const result: SourceMedia[] = [];

  const videoUrl = video.video_hd_url || video.video_sd_url;
  if (videoUrl && typeof videoUrl === "string" && videoUrl.trim().length > 0) {
    result.push({
      type: "video",
      sourceUrl: videoUrl.trim(),
      role: defaultRole,
    });
  }

  if (
    video.video_preview_image_url &&
    typeof video.video_preview_image_url === "string" &&
    video.video_preview_image_url.trim().length > 0
  ) {
    result.push({
      type: "video_preview",
      sourceUrl: video.video_preview_image_url.trim(),
      role: "preview",
    });
  }

  return result;
}

/**
 * Extracts image rendition according to M0 precedence:
 *  - Original image URL takes precedence over resized image URL
 */
function extractImageMedia(
  image: CuriousCoderImage,
  defaultRole = "primary",
): SourceMedia[] {
  const imageUrl = image.original_image_url || image.resized_image_url;
  if (imageUrl && typeof imageUrl === "string" && imageUrl.trim().length > 0) {
    return [
      {
        type: "image",
        sourceUrl: imageUrl.trim(),
        role: defaultRole,
      },
    ];
  }
  return [];
}

/**
 * Conservative URL-level deduplication within a single candidate media list.
 * Removes duplicate candidates where (type, sourceUrl, role) match exactly.
 */
function dedupeMediaCandidates(media: SourceMedia[]): SourceMedia[] {
  const seen = new Set<string>();
  const deduped: SourceMedia[] = [];

  for (const item of media) {
    const key = `${item.type}::${item.sourceUrl}::${item.role ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  return deduped;
}

/**
 * Extracts direct ad-level media from all confirmed provider paths under snapshot.
 */
function extractDirectMedia(item: CuriousCoderItem): SourceMedia[] {
  const candidates: SourceMedia[] = [];
  const snapshot = item.snapshot;
  if (!snapshot) return candidates;

  // 1. snapshot.videos[]
  if (Array.isArray(snapshot.videos)) {
    for (const v of snapshot.videos) {
      if (v) candidates.push(...extractVideoMedia(v, "primary"));
    }
  }

  // 2. snapshot.images[]
  if (Array.isArray(snapshot.images)) {
    for (const img of snapshot.images) {
      if (img) candidates.push(...extractImageMedia(img, "primary"));
    }
  }

  // 3. snapshot.extra_videos[]
  if (Array.isArray(snapshot.extra_videos)) {
    for (const v of snapshot.extra_videos) {
      if (v) candidates.push(...extractVideoMedia(v, "extra"));
    }
  }

  // 4. snapshot.extra_images[]
  if (Array.isArray(snapshot.extra_images)) {
    for (const img of snapshot.extra_images) {
      if (img) candidates.push(...extractImageMedia(img, "extra"));
    }
  }

  return dedupeMediaCandidates(candidates);
}

/**
 * Extracts card-level media from card direct fields and nested media arrays.
 */
function extractCardMedia(card: CuriousCoderCard): SourceMedia[] {
  const candidates: SourceMedia[] = [];

  // Direct card video fields
  const cardVideoUrl = card.video_hd_url || card.video_sd_url;
  if (
    cardVideoUrl &&
    typeof cardVideoUrl === "string" &&
    cardVideoUrl.trim().length > 0
  ) {
    candidates.push({
      type: "video",
      sourceUrl: cardVideoUrl.trim(),
      role: "primary",
    });
  }
  if (
    card.video_preview_image_url &&
    typeof card.video_preview_image_url === "string" &&
    card.video_preview_image_url.trim().length > 0
  ) {
    candidates.push({
      type: "video_preview",
      sourceUrl: card.video_preview_image_url.trim(),
      role: "preview",
    });
  }

  // Direct card image fields
  const cardImageUrl = card.original_image_url || card.resized_image_url;
  if (
    cardImageUrl &&
    typeof cardImageUrl === "string" &&
    cardImageUrl.trim().length > 0
  ) {
    candidates.push({
      type: "image",
      sourceUrl: cardImageUrl.trim(),
      role: "primary",
    });
  }

  // Nested card.videos[]
  if (Array.isArray(card.videos)) {
    for (const v of card.videos) {
      if (v) candidates.push(...extractVideoMedia(v, "primary"));
    }
  }

  // Nested card.images[]
  if (Array.isArray(card.images)) {
    for (const img of card.images) {
      if (img) candidates.push(...extractImageMedia(img, "primary"));
    }
  }

  return dedupeMediaCandidates(candidates);
}

/**
 * Normalizes child card items from snapshot.cards.
 */
function normalizeCards(cards?: CuriousCoderCard[] | null): SourceAdCard[] {
  if (!Array.isArray(cards) || cards.length === 0) {
    return [];
  }

  return cards.map((card, index) => ({
    position: index,
    body: extractCopyText(card.body),
    title: extractCopyText(card.title),
    description: card.description ?? card.link_description ?? null,
    ctaText: card.cta_text ?? null,
    ctaType: card.cta_type ?? null,
    destinationUrl: card.link_url ?? null,
    media: extractCardMedia(card),
    raw: card,
  }));
}

/**
 * Pure, deterministic normalizer transforming a validated Curious Coder provider item
 * into the canonical provider-independent SourceAd model.
 *
 * Guarantees:
 *  - Pure function, zero side-effects, zero I/O, deterministic output.
 *  - sourceAdId strictly uses ad_archive_id (never ad_id).
 *  - Advertiser is kept distinct from publisher and brandedContent.
 *  - Top-level advertiser page_id is required; missing/empty page_id throws Error (never "" or snapshot.page_id).
 *  - Platform casing is strictly preserved without lowercasing.
 *  - Branded content is mapped faithfully from snapshot.branded_content.
 *  - Collation values are preserved without conceptual interpretation.
 *  - HD video is preferred over SD video without duplicating physical assets.
 *  - Original image is preferred over resized image.
 *  - Parent copy is never flattened into cards; card copy is never flattened into parent.
 *  - Raw provider payload references are preserved untouched.
 */
export function normalizeCuriousCoderAd(
  item: CuriousCoderItem,
  rawPayload?: unknown,
): SourceAd {
  // 1. Advertiser identity (from top-level account fields)
  // Must be a real non-empty identifier. Fail clearly rather than manufacturing "".
  if (!item.page_id || item.page_id.trim().length === 0) {
    throw new Error(
      `Normalization failed for ad ${item.ad_archive_id}: top-level advertiser page_id is missing or blank`,
    );
  }

  const advertiser = {
    sourcePageId: item.page_id.trim(),
    name: item.page_name ?? null,
    url: item.page_profile_uri ?? null,
  };

  const snapshot = item.snapshot;

  // 2. Publisher identity (from snapshot page fields)
  const hasPublisher =
    snapshot?.page_id != null ||
    snapshot?.page_name != null ||
    snapshot?.page_profile_uri != null;

  const publisher = hasPublisher
    ? {
        sourcePageId: snapshot?.page_id ?? null,
        name: snapshot?.page_name ?? null,
        url: snapshot?.page_profile_uri ?? null,
      }
    : null;

  // 3. Branded content sponsor (from snapshot.branded_content)
  const brandedContentRaw = snapshot?.branded_content;
  const brandedPageId =
    brandedContentRaw?.page_id ?? brandedContentRaw?.id ?? null;
  const brandedName =
    brandedContentRaw?.page_name ?? brandedContentRaw?.name ?? null;
  const brandedUrl =
    brandedContentRaw?.page_profile_uri ??
    brandedContentRaw?.profile_uri ??
    null;

  const hasBrandedContent =
    brandedPageId != null || brandedName != null || brandedUrl != null;

  const brandedContent = hasBrandedContent
    ? {
        sourcePageId: brandedPageId,
        name: brandedName,
        url: brandedUrl,
      }
    : null;

  // 4. Dates
  const platformStartAt = parseProviderDate(
    item.start_date,
    item.start_date_formatted,
  );
  const sourceReportedEndAt = parseProviderDate(
    item.end_date,
    item.end_date_formatted,
  );

  // 5. Active state
  const active = item.is_active ?? item.active ?? null;

  // 6. Ad Library URL
  const adLibraryUrl = item.ad_library_url ?? item.url ?? null;

  return {
    source: "meta",
    sourceAdId: item.ad_archive_id,

    sourceCollationId: item.collation_id ?? null,
    sourceCollationCount: item.collation_count ?? null,

    advertiser,
    publisher,
    brandedContent,

    displayFormat: snapshot?.display_format ?? null,

    primaryText: extractCopyText(snapshot?.body),
    headline: extractCopyText(snapshot?.title),
    description: snapshot?.link_description ?? null,

    ctaText: snapshot?.cta_text ?? null,
    ctaType: snapshot?.cta_type ?? null,
    destinationUrl: snapshot?.link_url ?? null,

    publisherPlatforms: normalizePlatforms(
      item.publisher_platform,
      item.publisher_platforms,
    ),

    platformStartAt,
    sourceReportedEndAt,

    active,
    adLibraryUrl,

    cards: normalizeCards(snapshot?.cards),
    directMedia: extractDirectMedia(item),

    raw: rawPayload ?? item,
  };
}
