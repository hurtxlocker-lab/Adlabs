import { describe, expect, it, vi } from "vitest";
import type { DownloadedMedia, DownloadedMediaType } from "@/ingestion/media";
import type { SourceAd, SourceMedia } from "@/ingestion/types";
import type { StoredMediaInput } from "@/ingestion/persistence";
import { MediaPreparationError } from "../errors";
import { prepareAdMedia } from "../prepare-ad-media";

function mapSourceTypeToDownloadedType(
  type?: string,
): DownloadedMediaType {
  switch (type) {
    case "video":
      return "VIDEO";
    case "video_preview":
      return "IMAGE";
    case "unknown":
      return "UNKNOWN";
    default:
      return "IMAGE";
  }
}

function createFakeDownloadedMedia(
  sourceUrl: string,
  sha: string,
  mediaType: "image" | "video" | "video_preview" | "unknown" = "image",
): DownloadedMedia & { cleanupCalled: boolean } {
  const normalizedType = mapSourceTypeToDownloadedType(mediaType);
  const result: DownloadedMedia & { cleanupCalled: boolean } = {
    sourceUrl,
    finalUrl: `https://resolved.cdn.com/final/${sha}`,
    sha256: sha,
    byteSize: BigInt(1024),
    mimeType: normalizedType === "VIDEO" ? "video/mp4" : "image/jpeg",
    mediaType: normalizedType,
    tempFilePath: `/tmp/fake_${sha}.tmp`,
    cleanupCalled: false,
    cleanup: async () => {
      result.cleanupCalled = true;
    },
  };
  return result;
}

function createStoredMediaResult(
  downloaded: DownloadedMedia,
): StoredMediaInput {
  return {
    mediaType: downloaded.mediaType,
    sourceUrl: downloaded.sourceUrl,
    sha256: downloaded.sha256,
    mimeType: downloaded.mimeType,
    byteSize: downloaded.byteSize,
    storageProvider: "cloudflare_r2",
    storageKey: `media/sha256/${downloaded.sha256}`,
  };
}

function createMinimalSourceAd(overrides?: Partial<SourceAd>): SourceAd {
  return {
    source: "meta",
    sourceAdId: "123456789",
    advertiser: {
      sourcePageId: "987654321",
    },
    publisherPlatforms: ["facebook", "instagram"],
    cards: [],
    directMedia: [],
    raw: {},
    ...overrides,
  };
}

describe("Media Orchestration (Phase A): prepareAdMedia Unit Tests", () => {
  it("1. prepares direct media in deterministic sequential positions", async () => {
    const sm1: SourceMedia = {
      type: "image",
      sourceUrl: "https://example.com/img1.jpg",
      role: "primary",
    };
    const sm2: SourceMedia = {
      type: "video_preview",
      sourceUrl: "https://example.com/prev1.jpg",
      role: "preview",
    };
    const ad = createMinimalSourceAd({
      directMedia: [sm1, sm2],
    });

    const shaMap: Record<string, string> = {
      "https://example.com/img1.jpg": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "https://example.com/prev1.jpg": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    };

    const downloadMedia = vi.fn(async ({ sourceUrl, expectedType }) => {
      return createFakeDownloadedMedia(sourceUrl, shaMap[sourceUrl], expectedType);
    });
    const storeDownloadedMedia = vi.fn(async (downloaded) => {
      return createStoredMediaResult(downloaded);
    });

    const result = await prepareAdMedia(ad, {
      downloadMedia,
      storeDownloadedMedia,
    });

    expect(result.directMedia).toHaveLength(2);
    expect(result.directMedia[0]).toEqual({
      media: {
        mediaType: "IMAGE",
        sourceUrl: "https://example.com/img1.jpg",
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        mimeType: "image/jpeg",
        byteSize: BigInt(1024),
        storageProvider: "cloudflare_r2",
        storageKey: "media/sha256/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        width: null,
        height: null,
      },
      position: 0,
      role: "primary",
    });
    expect(result.directMedia[1]).toEqual({
      media: {
        mediaType: "IMAGE",
        sourceUrl: "https://example.com/prev1.jpg",
        sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        mimeType: "image/jpeg",
        byteSize: BigInt(1024),
        storageProvider: "cloudflare_r2",
        storageKey: "media/sha256/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        width: null,
        height: null,
      },
      position: 1,
      role: "preview",
    });
  });

  it("2. prepares card media in deterministic card/media order", async () => {
    const ad = createMinimalSourceAd({
      cards: [
        {
          position: 0,
          media: [
            {
              type: "image",
              sourceUrl: "https://example.com/card0_img0.jpg",
              role: "primary",
            },
            {
              type: "image",
              sourceUrl: "https://example.com/card0_img1.jpg",
              role: "extra",
            },
          ],
          raw: {},
        },
        {
          position: 1,
          media: [
            {
              type: "video",
              sourceUrl: "https://example.com/card1_vid0.mp4",
              role: "primary",
            },
          ],
          raw: {},
        },
      ],
    });

    const downloadMedia = vi.fn(async ({ sourceUrl, expectedType }) => {
      const sha = sourceUrl.includes("card0_img0")
        ? "1111111111111111111111111111111111111111111111111111111111111111"
        : sourceUrl.includes("card0_img1")
          ? "2222222222222222222222222222222222222222222222222222222222222222"
          : "3333333333333333333333333333333333333333333333333333333333333333";
      return createFakeDownloadedMedia(sourceUrl, sha, expectedType);
    });
    const storeDownloadedMedia = vi.fn(async (downloaded) => {
      return createStoredMediaResult(downloaded);
    });

    const result = await prepareAdMedia(ad, {
      downloadMedia,
      storeDownloadedMedia,
    });

    expect(result.cardMedia).toHaveLength(2);
    expect(result.cardMedia[0].cardPosition).toBe(0);
    expect(result.cardMedia[0].media).toHaveLength(2);
    expect(result.cardMedia[0].media[0].position).toBe(0);
    expect(result.cardMedia[0].media[0].role).toBe("primary");
    expect(result.cardMedia[0].media[1].position).toBe(1);
    expect(result.cardMedia[0].media[1].role).toBe("extra");

    expect(result.cardMedia[1].cardPosition).toBe(1);
    expect(result.cardMedia[1].media).toHaveLength(1);
    expect(result.cardMedia[1].media[0].position).toBe(0);
    expect(result.cardMedia[1].media[0].media.mediaType).toBe("VIDEO");
  });

  it("3. maps SourceMedia.type to downloader expectedType correctly", async () => {
    const ad = createMinimalSourceAd({
      directMedia: [
        { type: "image", sourceUrl: "https://example.com/1.jpg" },
        { type: "video", sourceUrl: "https://example.com/2.mp4" },
        { type: "video_preview", sourceUrl: "https://example.com/3.jpg" },
        { type: "unknown", sourceUrl: "https://example.com/4.bin" },
      ],
    });

    const recordedExpectedTypes: Array<string | undefined> = [];
    const downloadMedia = vi.fn(async ({ sourceUrl, expectedType }) => {
      recordedExpectedTypes.push(expectedType);
      return createFakeDownloadedMedia(
        sourceUrl,
        "4444444444444444444444444444444444444444444444444444444444444444",
        expectedType,
      );
    });
    const storeDownloadedMedia = vi.fn(async (downloaded) => {
      return createStoredMediaResult(downloaded);
    });

    await prepareAdMedia(ad, { downloadMedia, storeDownloadedMedia });

    expect(recordedExpectedTypes).toEqual([
      "image",
      "video",
      "video_preview",
      "unknown",
    ]);
  });

  it("4. preserves role and defaults null when absent", async () => {
    const ad = createMinimalSourceAd({
      directMedia: [
        { type: "image", sourceUrl: "https://example.com/1.jpg", role: "primary" },
        { type: "image", sourceUrl: "https://example.com/2.jpg" }, // no role
      ],
    });

    const downloadMedia = vi.fn(async ({ sourceUrl, expectedType }) => {
      return createFakeDownloadedMedia(
        sourceUrl,
        sourceUrl.endsWith("1.jpg")
          ? "1111111111111111111111111111111111111111111111111111111111111111"
          : "2222222222222222222222222222222222222222222222222222222222222222",
        expectedType,
      );
    });
    const storeDownloadedMedia = vi.fn(async (downloaded) => {
      return createStoredMediaResult(downloaded);
    });

    const result = await prepareAdMedia(ad, {
      downloadMedia,
      storeDownloadedMedia,
    });

    expect(result.directMedia[0].role).toBe("primary");
    expect(result.directMedia[1].role).toBeNull();
  });

  it("5. preserves original sourceUrl even if downloader/storage resolves a different final URL", async () => {
    const ad = createMinimalSourceAd({
      directMedia: [
        { type: "image", sourceUrl: "https://source.ad/original-locator.jpg" },
      ],
    });

    const downloadMedia = vi.fn(async ({ sourceUrl, expectedType }) => {
      const fake = createFakeDownloadedMedia(
        sourceUrl,
        "5555555555555555555555555555555555555555555555555555555555555555",
        expectedType,
      );
      fake.finalUrl = "https://cdn.facebook.com/redirected/resolved.jpg";
      return fake;
    });
    const storeDownloadedMedia = vi.fn(async (downloaded) => {
      return {
        ...createStoredMediaResult(downloaded),
        sourceUrl: downloaded.finalUrl, // simulate storage returning finalUrl
      };
    });

    const result = await prepareAdMedia(ad, {
      downloadMedia,
      storeDownloadedMedia,
    });

    expect(result.directMedia[0].media.sourceUrl).toBe(
      "https://source.ad/original-locator.jpg",
    );
  });

  it("6. guarantees downloaded.cleanup() is called after successful storage", async () => {
    const ad = createMinimalSourceAd({
      directMedia: [
        { type: "image", sourceUrl: "https://example.com/success.jpg" },
      ],
    });

    let fakeDownloaded: ReturnType<typeof createFakeDownloadedMedia> | null = null;
    const downloadMedia = vi.fn(async ({ sourceUrl, expectedType }) => {
      fakeDownloaded = createFakeDownloadedMedia(
        sourceUrl,
        "6666666666666666666666666666666666666666666666666666666666666666",
        expectedType,
      );
      return fakeDownloaded;
    });
    const storeDownloadedMedia = vi.fn(async (downloaded) => {
      return createStoredMediaResult(downloaded);
    });

    await prepareAdMedia(ad, { downloadMedia, storeDownloadedMedia });

    expect(fakeDownloaded).not.toBeNull();
    expect(fakeDownloaded!.cleanupCalled).toBe(true);
  });

  it("7. guarantees downloaded.cleanup() is called after R2 storage failure", async () => {
    const ad = createMinimalSourceAd({
      directMedia: [
        { type: "image", sourceUrl: "https://example.com/fail_r2.jpg" },
      ],
    });

    let fakeDownloaded: ReturnType<typeof createFakeDownloadedMedia> | null = null;
    const downloadMedia = vi.fn(async ({ sourceUrl, expectedType }) => {
      fakeDownloaded = createFakeDownloadedMedia(
        sourceUrl,
        "7777777777777777777777777777777777777777777777777777777777777777",
        expectedType,
      );
      return fakeDownloaded;
    });
    const storeDownloadedMedia = vi.fn(async () => {
      throw new Error("R2 Network Timeout");
    });

    await expect(
      prepareAdMedia(ad, { downloadMedia, storeDownloadedMedia }),
    ).rejects.toThrow(MediaPreparationError);

    expect(fakeDownloaded).not.toBeNull();
    expect(fakeDownloaded!.cleanupCalled).toBe(true);
  });

  it("8. respects concurrency cap (never exceeds max concurrency)", async () => {
    const items: SourceMedia[] = Array.from({ length: 9 }, (_, i) => ({
      type: "image" as const,
      sourceUrl: `https://example.com/item_${i}.jpg`,
    }));
    const ad = createMinimalSourceAd({ directMedia: items });

    let activeOperations = 0;
    let maxObservedActive = 0;

    const downloadMedia = vi.fn(async ({ sourceUrl, expectedType }) => {
      activeOperations++;
      if (activeOperations > maxObservedActive) {
        maxObservedActive = activeOperations;
      }
      // simulate async delay
      await new Promise((resolve) => setTimeout(resolve, 20));
      activeOperations--;
      return createFakeDownloadedMedia(
        sourceUrl,
        `sha_${sourceUrl.slice(-5)}`.padEnd(64, "0"),
        expectedType,
      );
    });

    const storeDownloadedMedia = vi.fn(async (downloaded) => {
      return createStoredMediaResult(downloaded);
    });

    await prepareAdMedia(ad, {
      downloadMedia,
      storeDownloadedMedia,
      concurrency: 3,
    });

    expect(maxObservedActive).toBeLessThanOrEqual(3);
    expect(downloadMedia).toHaveBeenCalledTimes(9);
  });

  it("9. fails all-or-nothing: one media failure rejects whole prepareAdMedia", async () => {
    const ad = createMinimalSourceAd({
      directMedia: [
        { type: "image", sourceUrl: "https://example.com/ok.jpg" },
        { type: "image", sourceUrl: "https://example.com/broken.jpg" },
      ],
    });

    const downloadMedia = vi.fn(async ({ sourceUrl, expectedType }) => {
      if (sourceUrl.includes("broken")) {
        throw new Error("404 Not Found on CDN");
      }
      return createFakeDownloadedMedia(
        sourceUrl,
        "8888888888888888888888888888888888888888888888888888888888888888",
        expectedType,
      );
    });
    const storeDownloadedMedia = vi.fn(async (downloaded) => {
      return createStoredMediaResult(downloaded);
    });

    await expect(
      prepareAdMedia(ad, { downloadMedia, storeDownloadedMedia }),
    ).rejects.toThrow(MediaPreparationError);
  });

  it("10. memoizes exact duplicate (type + sourceUrl) within same ad without dropping relationships", async () => {
    const sm: SourceMedia = {
      type: "image",
      sourceUrl: "https://example.com/shared.jpg",
      role: "primary",
    };
    const ad = createMinimalSourceAd({
      directMedia: [sm],
      cards: [
        {
          position: 0,
          media: [{ ...sm, role: "card_primary" }],
          raw: {},
        },
        {
          position: 1,
          media: [{ ...sm, role: "card_duplicate" }],
          raw: {},
        },
      ],
    });

    const downloadMedia = vi.fn(async ({ sourceUrl, expectedType }) => {
      return createFakeDownloadedMedia(
        sourceUrl,
        "9999999999999999999999999999999999999999999999999999999999999999",
        expectedType,
      );
    });
    const storeDownloadedMedia = vi.fn(async (downloaded) => {
      return createStoredMediaResult(downloaded);
    });

    const result = await prepareAdMedia(ad, {
      downloadMedia,
      storeDownloadedMedia,
    });

    // Exactly 1 download and 1 store operation performed
    expect(downloadMedia).toHaveBeenCalledTimes(1);
    expect(storeDownloadedMedia).toHaveBeenCalledTimes(1);

    // But 3 relationships properly created across ad direct and cards
    expect(result.directMedia).toHaveLength(1);
    expect(result.directMedia[0].role).toBe("primary");

    expect(result.cardMedia).toHaveLength(2);
    expect(result.cardMedia[0].media[0].role).toBe("card_primary");
    expect(result.cardMedia[1].media[0].role).toBe("card_duplicate");
  });

  it("11. returns empty arrays cleanly when source ad has no media", async () => {
    const ad = createMinimalSourceAd({
      directMedia: [],
      cards: [{ position: 0, media: [], raw: {} }],
    });

    const downloadMedia = vi.fn();
    const storeDownloadedMedia = vi.fn();

    const result = await prepareAdMedia(ad, {
      downloadMedia,
      storeDownloadedMedia,
    });

    expect(result.directMedia).toEqual([]);
    expect(result.cardMedia).toEqual([{ cardPosition: 0, media: [] }]);
    expect(downloadMedia).not.toHaveBeenCalled();
    expect(storeDownloadedMedia).not.toHaveBeenCalled();
  });

  it("12. same exact JPEG SHA used as direct ad image and card video preview produces compatible physical IMAGE mediaType and preserves distinct roles", async () => {
    const sharedSha = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const ad = createMinimalSourceAd({
      directMedia: [
        {
          type: "image",
          sourceUrl: "https://example.com/shared.jpg",
          role: "hero_image",
        },
      ],
      cards: [
        {
          position: 0,
          media: [
            {
              type: "video_preview",
              sourceUrl: "https://example.com/shared_preview.jpg",
              role: "video_poster",
            },
          ],
          raw: {},
        },
      ],
    });

    const downloadMedia = vi.fn(async ({ sourceUrl, expectedType }) => {
      return createFakeDownloadedMedia(sourceUrl, sharedSha, expectedType);
    });
    const storeDownloadedMedia = vi.fn(async (downloaded) => {
      return createStoredMediaResult(downloaded);
    });

    const result = await prepareAdMedia(ad, {
      downloadMedia,
      storeDownloadedMedia,
    });

    // Both direct media and card media receive physical IMAGE type
    expect(result.directMedia[0].media.mediaType).toBe("IMAGE");
    expect(result.directMedia[0].role).toBe("hero_image");
    expect(result.directMedia[0].media.sha256).toBe(sharedSha);

    expect(result.cardMedia[0].media[0].media.mediaType).toBe("IMAGE");
    expect(result.cardMedia[0].media[0].role).toBe("video_poster");
    expect(result.cardMedia[0].media[0].media.sha256).toBe(sharedSha);

    // Both resolve to the exact same storageKey
    expect(result.directMedia[0].media.storageKey).toBe(`media/sha256/${sharedSha}`);
    expect(result.cardMedia[0].media[0].media.storageKey).toBe(`media/sha256/${sharedSha}`);
  });
});
