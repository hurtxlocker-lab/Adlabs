import { describe, expect, it, vi } from "vitest";
import { MediaPreparationError } from "@/ingestion/media-orchestration/errors";
import {
  MediaAssetConflictError,
  SourceAccountOwnershipConflictError,
  type FinishIngestionRunInput,
  type IngestionRunRow,
} from "@/ingestion/persistence";
import {
  IngestionRunFatalError,
  runCuriousCoderIngestion,
  type IngestNormalizedAdFn,
  type NormalizeCuriousCoderAdFn,
  type RunCuriousCoderIngestionInput,
} from "../index";

function createValidProviderItem(archiveId: string, pageId = "page_123") {
  return {
    ad_archive_id: archiveId,
    page_id: pageId,
    page_name: "Test Page",
    publisher_platform: ["facebook"],
    snapshot: {
      body: { text: "Sample body copy" },
      title: { text: "Sample headline" },
    },
  };
}

function createSampleInput(items: unknown[]): RunCuriousCoderIngestionInput {
  return {
    brand: { name: "Test Brand", slug: "test-brand" },
    sourceAccount: { sourcePageId: "page_123" },
    providerItems: items,
  };
}

describe("runCuriousCoderIngestion (Unit Tests)", () => {
  const mockBrand = { id: "brand_uuid_1" };
  const mockAccount = {
    id: "account_uuid_1",
    brandId: "brand_uuid_1",
    source: "meta",
    sourcePageId: "page_123",
  };

  function createBaseMocks() {
    let runCounter = 0;
    const mockEnsureBrand = vi.fn(async () => mockBrand);
    const mockEnsureSourceAccount = vi.fn(async () => mockAccount);
    const mockStartRun = vi.fn(async () => ({
      id: `run_uuid_${++runCounter}`,
      source: "meta",
      sourceAccountId: mockAccount.id,
      status: "RUNNING",
      startedAt: new Date(),
      finishedAt: null,
      sourceItemsCount: 0,
      newAdsCount: 0,
      updatedAdsCount: 0,
      mediaDownloadedCount: 0,
      mediaDuplicateCount: 0,
      mediaFailedCount: 0,
      bytesDownloaded: BigInt(0),
      uniqueBytesStored: BigInt(0),
      errorSummary: null,
      metadata: {},
      createdAt: new Date(),
    }));
    const mockFinishRun = vi.fn(
      async (input: FinishIngestionRunInput): Promise<IngestionRunRow> => ({
        id: input.ingestionRunId,
        source: "meta",
        sourceAccountId: mockAccount.id,
        status: input.status,
        startedAt: new Date(),
        finishedAt: new Date(),
        sourceItemsCount: input.sourceItemsCount,
        newAdsCount: input.newAdsCount,
        updatedAdsCount: input.updatedAdsCount,
        mediaDownloadedCount: input.mediaDownloadedCount,
        mediaDuplicateCount: input.mediaDuplicateCount,
        mediaFailedCount: input.mediaFailedCount,
        bytesDownloaded: input.bytesDownloaded,
        uniqueBytesStored: input.uniqueBytesStored,
        errorSummary: input.errorSummary ?? null,
        metadata: input.metadata ?? {},
        createdAt: new Date(),
      }),
    );

    const mockIngest: IngestNormalizedAdFn = vi.fn(async ({ sourceAd }) => ({
      adId: `ad_${sourceAd.sourceAdId}`,
      adOutcome: "created" as const,
      rawItemId: "raw_1",
      observationId: "obs_1",
      cardsCount: 0,
      directMediaCount: 0,
      cardMediaCount: 0,
      deletedDirectMediaCount: 0,
      deletedCardMediaCount: 0,
    }));

    return {
      ensureBrand: mockEnsureBrand,
      ensureSourceAccount: mockEnsureSourceAccount,
      startIngestionRun: mockStartRun,
      finishIngestionRun: mockFinishRun,
      ingestNormalizedAd: mockIngest,
    };
  }

  it("1. empty items: starts and finishes SUCCEEDED with zero source items", async () => {
    const mocks = createBaseMocks();
    const result = await runCuriousCoderIngestion(createSampleInput([]), mocks);

    expect(result.status).toBe("SUCCEEDED");
    expect(result.sourceItemsCount).toBe(0);
    expect(result.succeededItemsCount).toBe(0);
    expect(result.failedItemsCount).toBe(0);
    expect(result.createdAdsCount).toBe(0);
    expect(result.updatedAdsCount).toBe(0);
    expect(result.failures).toHaveLength(0);

    expect(mocks.startIngestionRun).toHaveBeenCalledTimes(1);
    expect(mocks.finishIngestionRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "SUCCEEDED",
        sourceItemsCount: 0,
        newAdsCount: 0,
        updatedAdsCount: 0,
      }),
      undefined,
    );
  });

  it("2. all items succeed: status SUCCEEDED", async () => {
    const mocks = createBaseMocks();
    const items = [
      createValidProviderItem("ad_1"),
      createValidProviderItem("ad_2"),
    ];

    const mockIngest: IngestNormalizedAdFn = vi.fn(async ({ sourceAd }) => ({
      adId: `ad_${sourceAd.sourceAdId}`,
      adOutcome: "created" as const,
      rawItemId: "raw_1",
      observationId: "obs_1",
      cardsCount: 0,
      directMediaCount: 0,
      cardMediaCount: 0,
      deletedDirectMediaCount: 0,
      deletedCardMediaCount: 0,
    }));

    const result = await runCuriousCoderIngestion(createSampleInput(items), {
      ...mocks,
      ingestNormalizedAd: mockIngest,
    });

    expect(result.status).toBe("SUCCEEDED");
    expect(result.sourceItemsCount).toBe(2);
    expect(result.succeededItemsCount).toBe(2);
    expect(result.failedItemsCount).toBe(0);
    expect(result.createdAdsCount).toBe(2);
    expect(result.updatedAdsCount).toBe(0);
    expect(result.failures).toHaveLength(0);

    expect(mocks.finishIngestionRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "SUCCEEDED",
        sourceItemsCount: 2,
        newAdsCount: 2,
        updatedAdsCount: 0,
      }),
      undefined,
    );
  });

  it("3. mixed success/failure: status PARTIAL", async () => {
    const mocks = createBaseMocks();
    const items = [
      createValidProviderItem("ad_success"),
      { bad: "unparseable payload" },
    ];

    const mockIngest: IngestNormalizedAdFn = vi.fn(async () => ({
      adId: "ad_success",
      adOutcome: "created" as const,
      rawItemId: "raw_1",
      observationId: "obs_1",
      cardsCount: 0,
      directMediaCount: 0,
      cardMediaCount: 0,
      deletedDirectMediaCount: 0,
      deletedCardMediaCount: 0,
    }));

    const result = await runCuriousCoderIngestion(createSampleInput(items), {
      ...mocks,
      ingestNormalizedAd: mockIngest,
    });

    expect(result.status).toBe("PARTIAL");
    expect(result.sourceItemsCount).toBe(2);
    expect(result.succeededItemsCount).toBe(1);
    expect(result.failedItemsCount).toBe(1);
    expect(result.createdAdsCount).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].stage).toBe("parse");
    expect(result.failures[0].itemIndex).toBe(1);
  });

  it("4. all attempted items fail: status FAILED", async () => {
    const mocks = createBaseMocks();
    const items = [{ invalid: 1 }, { invalid: 2 }];

    const result = await runCuriousCoderIngestion(createSampleInput(items), mocks);

    expect(result.status).toBe("FAILED");
    expect(result.sourceItemsCount).toBe(2);
    expect(result.succeededItemsCount).toBe(0);
    expect(result.failedItemsCount).toBe(2);
    expect(result.failures).toHaveLength(2);
  });

  it("5. created outcome increments createdAdsCount", async () => {
    const mocks = createBaseMocks();
    const mockIngest: IngestNormalizedAdFn = vi.fn(async () => ({
      adId: "ad_1",
      adOutcome: "created" as const,
      rawItemId: "raw_1",
      observationId: "obs_1",
      cardsCount: 0,
      directMediaCount: 0,
      cardMediaCount: 0,
      deletedDirectMediaCount: 0,
      deletedCardMediaCount: 0,
    }));

    const result = await runCuriousCoderIngestion(
      createSampleInput([createValidProviderItem("ad_1")]),
      { ...mocks, ingestNormalizedAd: mockIngest },
    );

    expect(result.createdAdsCount).toBe(1);
    expect(result.updatedAdsCount).toBe(0);
    expect(mocks.finishIngestionRun).toHaveBeenCalledWith(
      expect.objectContaining({ newAdsCount: 1, updatedAdsCount: 0 }),
      undefined,
    );
  });

  it("6. updated outcome increments updatedAdsCount", async () => {
    const mocks = createBaseMocks();
    const mockIngest: IngestNormalizedAdFn = vi.fn(async () => ({
      adId: "ad_1",
      adOutcome: "updated" as const,
      rawItemId: "raw_1",
      observationId: "obs_1",
      cardsCount: 0,
      directMediaCount: 0,
      cardMediaCount: 0,
      deletedDirectMediaCount: 0,
      deletedCardMediaCount: 0,
    }));

    const result = await runCuriousCoderIngestion(
      createSampleInput([createValidProviderItem("ad_1")]),
      { ...mocks, ingestNormalizedAd: mockIngest },
    );

    expect(result.createdAdsCount).toBe(0);
    expect(result.updatedAdsCount).toBe(1);
    expect(mocks.finishIngestionRun).toHaveBeenCalledWith(
      expect.objectContaining({ newAdsCount: 0, updatedAdsCount: 1 }),
      undefined,
    );
  });

  it("7. parser failure: counted in sourceItemsCount, isolated, subsequent items continue", async () => {
    const mocks = createBaseMocks();
    const items = [
      { invalid: true },
      createValidProviderItem("ad_valid"),
    ];

    const mockIngest: IngestNormalizedAdFn = vi.fn(async () => ({
      adId: "ad_valid",
      adOutcome: "created" as const,
      rawItemId: "raw_1",
      observationId: "obs_1",
      cardsCount: 0,
      directMediaCount: 0,
      cardMediaCount: 0,
      deletedDirectMediaCount: 0,
      deletedCardMediaCount: 0,
    }));

    const result = await runCuriousCoderIngestion(createSampleInput(items), {
      ...mocks,
      ingestNormalizedAd: mockIngest,
    });

    expect(result.sourceItemsCount).toBe(2);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].stage).toBe("parse");
    expect(result.failures[0].itemIndex).toBe(0);
    expect(result.succeededItemsCount).toBe(1);
    expect(result.status).toBe("PARTIAL");
  });

  it("8. normalizer failure: stage is 'normalize', isolated from other items", async () => {
    const mocks = createBaseMocks();
    const items = [
      createValidProviderItem("ad_norm_fail"),
      createValidProviderItem("ad_norm_ok"),
    ];

    const mockNormalize: NormalizeCuriousCoderAdFn = vi.fn((data, raw) => {
      if (data.ad_archive_id === "ad_norm_fail") {
        throw new Error("Normalizer required field assertion failed");
      }
      return {
        source: "meta" as const,
        sourceAdId: data.ad_archive_id,
        advertiser: { sourcePageId: "page_123" },
        publisherPlatforms: ["facebook"],
        directMedia: [],
        cards: [],
        raw,
      };
    });

    const mockIngest: IngestNormalizedAdFn = vi.fn(async () => ({
      adId: "ad_norm_ok",
      adOutcome: "created" as const,
      rawItemId: "raw_1",
      observationId: "obs_1",
      cardsCount: 0,
      directMediaCount: 0,
      cardMediaCount: 0,
      deletedDirectMediaCount: 0,
      deletedCardMediaCount: 0,
    }));

    const result = await runCuriousCoderIngestion(createSampleInput(items), {
      ...mocks,
      normalizeAd: mockNormalize,
      ingestNormalizedAd: mockIngest,
    });

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].stage).toBe("normalize");
    expect(result.failures[0].sourceAdId).toBe("ad_norm_fail");
    expect(result.succeededItemsCount).toBe(1);
  });

  it("9. item ingestion failure: classified as 'prepare_media' or 'persist' or 'ingest' and isolated", async () => {
    const mocks = createBaseMocks();
    const items = [
      createValidProviderItem("ad_prep_fail"),
      createValidProviderItem("ad_persist_fail"),
      createValidProviderItem("ad_generic_fail"),
      createValidProviderItem("ad_success"),
    ];

    const mockIngest: IngestNormalizedAdFn = vi.fn(async ({ sourceAd }) => {
      if (sourceAd.sourceAdId === "ad_prep_fail") {
        throw new MediaPreparationError("Network timeout", {
          sourceUrl: "https://example.com/img.jpg",
          mediaType: "image",
        });
      }
      if (sourceAd.sourceAdId === "ad_persist_fail") {
        const dummySha =
          "1111111111111111111111111111111111111111111111111111111111111111";
        throw new MediaAssetConflictError(
          "Conflict on SHA-256 byte size",
          dummySha,
          {
            id: "asset_1",
            mediaType: "IMAGE",
            sourceUrl: "https://example.com/img.jpg",
            sha256: dummySha,
            mimeType: "image/jpeg",
            byteSize: BigInt(100),
            storageProvider: "cloudflare_r2",
            storageKey: `media/sha256/${dummySha}`,
            downloadStatus: "COMPLETED",
            downloadError: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            mediaType: "IMAGE",
            sourceUrl: "https://example.com/img.jpg",
            sha256: dummySha,
            mimeType: "image/jpeg",
            byteSize: BigInt(200),
            storageProvider: "cloudflare_r2",
            storageKey: `media/sha256/${dummySha}`,
          },
        );
      }
      if (sourceAd.sourceAdId === "ad_generic_fail") {
        throw new Error("Generic unclassified ingestion error");
      }
      return {
        adId: "ad_success",
        adOutcome: "created" as const,
        rawItemId: "raw_1",
        observationId: "obs_1",
        cardsCount: 0,
        directMediaCount: 0,
        cardMediaCount: 0,
        deletedDirectMediaCount: 0,
        deletedCardMediaCount: 0,
      };
    });

    const result = await runCuriousCoderIngestion(createSampleInput(items), {
      ...mocks,
      ingestNormalizedAd: mockIngest,
    });

    expect(result.failures).toHaveLength(3);
    expect(result.failures[0].stage).toBe("prepare_media");
    expect(result.failures[1].stage).toBe("persist");
    expect(result.failures[2].stage).toBe("ingest");
    expect(result.succeededItemsCount).toBe(1);
    expect(result.status).toBe("PARTIAL");
  });

  it("10. sequential ad processing guarantee: item N+1 does not start before item N resolves", async () => {
    const mocks = createBaseMocks();
    const items = [
      createValidProviderItem("ad_1"),
      createValidProviderItem("ad_2"),
    ];

    const executionLog: string[] = [];

    const mockIngest: IngestNormalizedAdFn = vi.fn(async ({ sourceAd }) => {
      executionLog.push(`start_${sourceAd.sourceAdId}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
      executionLog.push(`end_${sourceAd.sourceAdId}`);
      return {
        adId: sourceAd.sourceAdId,
        adOutcome: "created" as const,
        rawItemId: "raw_1",
        observationId: "obs_1",
        cardsCount: 0,
        directMediaCount: 0,
        cardMediaCount: 0,
        deletedDirectMediaCount: 0,
        deletedCardMediaCount: 0,
      };
    });

    await runCuriousCoderIngestion(createSampleInput(items), {
      ...mocks,
      ingestNormalizedAd: mockIngest,
    });

    expect(executionLog).toEqual(["start_ad_1", "end_ad_1", "start_ad_2", "end_ad_2"]);
  });

  it("11. sanitized error output: error messages redact sensitive query parameters / signed tokens", async () => {
    const mocks = createBaseMocks();
    const items = [createValidProviderItem("ad_signed_token")];

    const mockIngest: IngestNormalizedAdFn = vi.fn(async () => {
      throw new Error(
        "Download failed from https://scontent.xx.fbcdn.net/v/t39.35420-6/img.jpg?oh=01_Q5aa&oe=66B9&_nc_sid=5b8ee9&token=secret123",
      );
    });

    const result = await runCuriousCoderIngestion(createSampleInput(items), {
      ...mocks,
      ingestNormalizedAd: mockIngest,
    });

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].message).not.toContain("secret123");
    expect(result.failures[0].message).not.toContain("01_Q5aa");
    expect(result.failures[0].message).toContain("https://scontent.xx.fbcdn.net/v/t39.35420-6/img.jpg");
  });

  it("12. normal completion finalization: finishIngestionRun called exactly once", async () => {
    const mocks = createBaseMocks();
    await runCuriousCoderIngestion(
      createSampleInput([createValidProviderItem("ad_1")]),
      mocks,
    );

    expect(mocks.finishIngestionRun).toHaveBeenCalledTimes(1);
  });

  it("13. pre-run fatal failure: ensureSourceAccount ownership conflict rejects before run creation or items", async () => {
    const mocks = createBaseMocks();
    mocks.ensureSourceAccount.mockImplementationOnce(async () => {
      throw new SourceAccountOwnershipConflictError(
        "Source account belongs to another brand",
        {
          id: "account_1",
          brandId: "brand_other",
          source: "meta",
          sourcePageId: "page_123",
          sourcePageUrl: null,
          displayName: "Other Page",
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        "brand_other",
      );
    });

    await expect(
      runCuriousCoderIngestion(createSampleInput([createValidProviderItem("ad_1")]), mocks),
    ).rejects.toThrow(SourceAccountOwnershipConflictError);

    expect(mocks.startIngestionRun).not.toHaveBeenCalled();
    expect(mocks.finishIngestionRun).not.toHaveBeenCalled();
  });

  it("14. empty set: resolves as SUCCEEDED, does not become FAILED", async () => {
    const mocks = createBaseMocks();
    const result = await runCuriousCoderIngestion(createSampleInput([]), mocks);
    expect(result.status).toBe("SUCCEEDED");
  });

  it("15. separate invocations: each invocation creates a distinct new ingestion_run", async () => {
    const mocks = createBaseMocks();
    const res1 = await runCuriousCoderIngestion(createSampleInput([]), mocks);
    const res2 = await runCuriousCoderIngestion(createSampleInput([]), mocks);

    expect(res1.ingestionRunId).toBe("run_uuid_1");
    expect(res2.ingestionRunId).toBe("run_uuid_2");
    expect(res1.ingestionRunId).not.toBe(res2.ingestionRunId);
  });

  it("16. finalization failure: when finishIngestionRun throws, runCuriousCoderIngestion rejects with IngestionRunFatalError and is NOT blindly retried", async () => {
    const mocks = createBaseMocks();
    mocks.finishIngestionRun.mockImplementationOnce(async () => {
      throw new Error("DB connection died during finalization");
    });

    await expect(
      runCuriousCoderIngestion(
        createSampleInput([createValidProviderItem("ad_1")]),
        mocks,
      ),
    ).rejects.toThrow(IngestionRunFatalError);

    expect(mocks.finishIngestionRun).toHaveBeenCalledTimes(1);
  });

  it("17. item advertiser mismatch: item with mismatched advertiser.sourcePageId fails with stage 'normalize', later valid item succeeds, producing PARTIAL", async () => {
    const mocks = createBaseMocks();
    const items = [
      createValidProviderItem("ad_wrong_page", "page_other_999"),
      createValidProviderItem("ad_correct_page", "page_123"),
    ];

    const mockIngest: IngestNormalizedAdFn = vi.fn(async () => ({
      adId: "ad_correct_page",
      adOutcome: "created" as const,
      rawItemId: "raw_1",
      observationId: "obs_1",
      cardsCount: 0,
      directMediaCount: 0,
      cardMediaCount: 0,
      deletedDirectMediaCount: 0,
      deletedCardMediaCount: 0,
    }));

    const result = await runCuriousCoderIngestion(createSampleInput(items), {
      ...mocks,
      ingestNormalizedAd: mockIngest,
    });

    expect(result.status).toBe("PARTIAL");
    expect(result.sourceItemsCount).toBe(2);
    expect(result.succeededItemsCount).toBe(1);
    expect(result.failedItemsCount).toBe(1);
    expect(result.failures[0].stage).toBe("normalize");
    expect(result.failures[0].sourceAdId).toBe("ad_wrong_page");
    expect(result.failures[0].message).toContain("page_other_999");
    expect(result.failures[0].message).toContain("page_123");
  });
});
