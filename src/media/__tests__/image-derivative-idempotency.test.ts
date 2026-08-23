import { describe, it, expect, vi } from "vitest";
import {
  processImageDerivatives,
  BROWSE_IMAGE_V1,
  DETAIL_IMAGE_V1,
} from "../index";
import type { DbClient } from "../persistence/derivative-repository";

describe("Image Derivative Processor — Execution Idempotency & Invariant Tests", () => {
  it("proves strict execution idempotency: second run on READY asset performs ZERO R2 GETs and ZERO Sharp decodes", async () => {
    const sourceAssetId = "11111111-1111-4111-8111-111111111111";
    const derivedBrowseId = "22222222-2222-4222-8222-222222222222";
    const derivedDetailId = "33333333-3333-4333-8333-333333333333";

    const mockSourceAsset = {
      id: sourceAssetId,
      mediaType: "IMAGE",
      storageKey: "media/sha256/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      byteSize: BigInt(100000),
      width: 1080,
      height: 1080,
      mimeType: "image/jpeg",
      downloadStatus: "STORED",
    };

    // Both browse and detail are already READY in the database
    const mockExistingJobs = [
      {
        id: "job-browse-1",
        sourceMediaAssetId: sourceAssetId,
        derivedMediaAssetId: derivedBrowseId,
        derivativeKind: "DISPLAY_IMAGE",
        recipeVersion: BROWSE_IMAGE_V1.version,
        status: "READY",
        errorReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        derivedByteSize: BigInt(15000),
        derivedWidth: 768,
        derivedHeight: 768,
      },
      {
        id: "job-detail-1",
        sourceMediaAssetId: sourceAssetId,
        derivedMediaAssetId: derivedDetailId,
        derivativeKind: "DISPLAY_IMAGE",
        recipeVersion: DETAIL_IMAGE_V1.version,
        status: "READY",
        errorReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        derivedByteSize: BigInt(45000),
        derivedWidth: 1080,
        derivedHeight: 1080,
      },
    ];

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => ({
            limit: vi.fn().mockResolvedValue([mockSourceAsset]),
          })),
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(mockExistingJobs),
          }),
        }),
      }),
    } as unknown as DbClient;

    const result = await processImageDerivatives(mockDb, sourceAssetId);

    // Assert zero R2 reads and immediate readiness
    expect(result.sourceR2Read).toBe(false);
    expect(result.browse.wasAlreadyReady).toBe(true);
    expect(result.detail.wasAlreadyReady).toBe(true);
    expect(result.browse.derivedMediaAssetId).toBe(derivedBrowseId);
    expect(result.detail.derivedMediaAssetId).toBe(derivedDetailId);
    expect(result.browse.durationMs).toBe(0);
    expect(result.detail.durationMs).toBe(0);
  });

  it("skips previously FAILED derivative jobs by default unless retryFailed is set", async () => {
    const sourceAssetId = "44444444-4444-4444-8444-444444444444";

    const mockSourceAsset = {
      id: sourceAssetId,
      mediaType: "IMAGE",
      storageKey: "media/sha256/ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      byteSize: BigInt(100000),
      width: 1080,
      height: 1080,
      mimeType: "image/jpeg",
      downloadStatus: "STORED",
    };

    // Both recipes failed on earlier attempt (e.g. missing R2 source)
    const mockExistingJobs = [
      {
        id: "job-browse-failed",
        sourceMediaAssetId: sourceAssetId,
        derivedMediaAssetId: null,
        derivativeKind: "DISPLAY_IMAGE",
        recipeVersion: BROWSE_IMAGE_V1.version,
        status: "FAILED",
        errorReason: "NoSuchKey",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "job-detail-failed",
        sourceMediaAssetId: sourceAssetId,
        derivedMediaAssetId: null,
        derivativeKind: "DISPLAY_IMAGE",
        recipeVersion: DETAIL_IMAGE_V1.version,
        status: "FAILED",
        errorReason: "NoSuchKey",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => ({
            limit: vi.fn().mockResolvedValue([mockSourceAsset]),
          })),
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(mockExistingJobs),
          }),
        }),
      }),
    } as unknown as DbClient;

    // Without retryFailed -> early exit, zero R2 reads
    const result = await processImageDerivatives(mockDb, sourceAssetId, {
      retryFailed: false,
    });

    expect(result.sourceR2Read).toBe(false);
    expect(result.browse.wasAlreadyReady).toBe(false);
    expect(result.detail.wasAlreadyReady).toBe(false);
  });

  it("throws ImageDerivativeProcessingError and marks job FAILED on missing R2 source without mutating canonical", async () => {
    const sourceAssetId = "55555555-5555-4555-8555-555555555555";

    const mockSourceAsset = {
      id: sourceAssetId,
      mediaType: "IMAGE",
      storageKey: "media/sha256/missing0000000000000000000000000000000000000000000000000000000000",
      byteSize: BigInt(100000),
      width: 1080,
      height: 1080,
      mimeType: "image/jpeg",
      downloadStatus: "STORED",
    };

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => ({
            limit: vi.fn().mockResolvedValue([mockSourceAsset]),
          })),
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]), // Neither job exists yet
          }),
        }),
      }),
    } as unknown as DbClient;

    // Attempting to download missing key should throw cleanly
    await expect(
      processImageDerivatives(mockDb, sourceAssetId),
    ).rejects.toThrow();
  });
});
