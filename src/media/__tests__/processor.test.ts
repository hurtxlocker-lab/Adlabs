import { describe, expect, it, vi } from "vitest";
import {
  processPreviewLoopDerivative,
  DerivativeProcessingError,
} from "../services/derivative-processor";
import type { DbClient } from "../persistence/derivative-repository";

vi.mock("../persistence/derivative-repository", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../persistence/derivative-repository")>();
  return {
    ...mod,
    getOrCreateDerivativeJob: vi.fn().mockImplementation(async (_db, sourceId) => {
      if (sourceId === "source-vid-ready") {
        return {
          id: "job-ready-1",
          sourceMediaAssetId: "source-vid-ready",
          derivedMediaAssetId: "derived-asset-99",
          derivativeKind: "PREVIEW_LOOP",
          recipeVersion: "preview-loop-v1",
          status: "READY",
          errorReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      return {
        id: "job-pending-1",
        sourceMediaAssetId: sourceId,
        derivedMediaAssetId: null,
        derivativeKind: "PREVIEW_LOOP",
        recipeVersion: "preview-loop-v1",
        status: "PENDING",
        errorReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }),
  };
});

describe("Derivative Processor Service", () => {
  it("throws DerivativeProcessingError if source asset does not exist", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as unknown as DbClient;

    await expect(
      processPreviewLoopDerivative(mockDb, "non-existent-id"),
    ).rejects.toThrow(DerivativeProcessingError);
  });

  it("throws DerivativeProcessingError if source asset is not a VIDEO", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "image-asset-1",
                mediaType: "IMAGE",
                storageKey: "media/sha256/123",
              },
            ]),
          }),
        }),
      }),
    } as unknown as DbClient;

    await expect(
      processPreviewLoopDerivative(mockDb, "image-asset-1"),
    ).rejects.toThrow(/expected "VIDEO"/);
  });

  it("returns immediately without encoding if derivative job is already READY (Idempotency)", async () => {
    const mockDb = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "source-vid-ready",
                mediaType: "VIDEO",
                storageKey:
                  "media/sha256/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
                byteSize: BigInt(5000000),
              },
            ]),
          }),
        }),
      })),
    } as unknown as DbClient;

    const result = await processPreviewLoopDerivative(mockDb, "source-vid-ready");

    expect(result.wasAlreadyReady).toBe(true);
    expect(result.derivedMediaAssetId).toBe("derived-asset-99");
    expect(result.job.status).toBe("READY");
    expect(result.encodeDurationMs).toBe(0);
  });

  it("throws DerivativeProcessingError if source asset has noncanonical storageKey", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "fixture-asset-1",
                mediaType: "VIDEO",
                storageKey: "media/unknown/e5e5.bin",
              },
            ]),
          }),
        }),
      }),
    } as unknown as DbClient;

    await expect(
      processPreviewLoopDerivative(mockDb, "fixture-asset-1"),
    ).rejects.toThrow(/noncanonical storageKey/);
  });
});
