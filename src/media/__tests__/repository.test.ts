import { describe, expect, it, vi } from "vitest";
import {
  markDerivativeReady,
  markDerivativeProcessing,
  markDerivativeFailed,
  getOrCreateDerivativeJob,
  type DbClient,
} from "../persistence/derivative-repository";

describe("Derivative Repository Invariants", () => {
  it("rejects markDerivativeReady if derivedMediaAssetId is missing or empty", async () => {
    const mockDb = {} as unknown as DbClient;

    await expect(markDerivativeReady(mockDb, "job-123", "")).rejects.toThrow(
      "derivedMediaAssetId is required when marking a derivative job as READY",
    );
  });

  it("markDerivativeProcessing clears errorReason and sets derivedMediaAssetId to null", async () => {
    let capturedSet: Record<string, unknown> = {};

    const mockDb = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((val) => {
          capturedSet = val;
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  id: "job-123",
                  status: "PROCESSING",
                  derivedMediaAssetId: null,
                  errorReason: null,
                  updatedAt: val.updatedAt,
                },
              ]),
            }),
          };
        }),
      }),
    } as unknown as DbClient;

    const result = await markDerivativeProcessing(mockDb, "job-123");

    expect(result.status).toBe("PROCESSING");
    expect(result.derivedMediaAssetId).toBeNull();
    expect(result.errorReason).toBeNull();
    expect(capturedSet.status).toBe("PROCESSING");
    expect(capturedSet.derivedMediaAssetId).toBeNull();
    expect(capturedSet.errorReason).toBeNull();
    expect(capturedSet.updatedAt).toBeInstanceOf(Date);
  });

  it("markDerivativeReady sets status READY with derived asset ID and clears errorReason", async () => {
    let capturedSet: Record<string, unknown> = {};

    const mockDb = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((val) => {
          capturedSet = val;
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  id: "job-123",
                  status: "READY",
                  derivedMediaAssetId: "asset-999",
                  errorReason: null,
                  updatedAt: val.updatedAt,
                },
              ]),
            }),
          };
        }),
      }),
    } as unknown as DbClient;

    const result = await markDerivativeReady(mockDb, "job-123", "asset-999");

    expect(result.status).toBe("READY");
    expect(result.derivedMediaAssetId).toBe("asset-999");
    expect(result.errorReason).toBeNull();
    expect(capturedSet.status).toBe("READY");
    expect(capturedSet.derivedMediaAssetId).toBe("asset-999");
    expect(capturedSet.errorReason).toBeNull();
    expect(capturedSet.updatedAt).toBeInstanceOf(Date);
  });

  it("markDerivativeFailed sets status FAILED, clears derivedMediaAssetId, and bounds errorReason", async () => {
    let capturedSet: Record<string, unknown> = {};
    const longError = "x".repeat(3000);

    const mockDb = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((val) => {
          capturedSet = val;
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  id: "job-123",
                  status: "FAILED",
                  derivedMediaAssetId: null,
                  errorReason: val.errorReason,
                  updatedAt: val.updatedAt,
                },
              ]),
            }),
          };
        }),
      }),
    } as unknown as DbClient;

    const result = await markDerivativeFailed(mockDb, "job-123", longError);

    expect(result.status).toBe("FAILED");
    expect(result.derivedMediaAssetId).toBeNull();
    expect(result.errorReason?.length).toBe(2000);
    expect(capturedSet.status).toBe("FAILED");
    expect(capturedSet.derivedMediaAssetId).toBeNull();
    expect((capturedSet.errorReason as string).length).toBe(2000);
    expect(capturedSet.updatedAt).toBeInstanceOf(Date);
  });

  it("getOrCreateDerivativeJob returns existing record or creates PENDING job with null derived asset", async () => {
    const existingJob = {
      id: "job-existing",
      sourceMediaAssetId: "source-1",
      derivedMediaAssetId: null,
      derivativeKind: "PREVIEW_LOOP",
      recipeVersion: "preview-benchmark-640-crf24",
      status: "PENDING",
      errorReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([existingJob]),
          }),
        }),
      }),
    } as unknown as DbClient;

    const result = await getOrCreateDerivativeJob(
      mockDb,
      "source-1",
      "PREVIEW_LOOP",
      "preview-benchmark-640-crf24",
    );

    expect(result.id).toBe("job-existing");
    expect(result.status).toBe("PENDING");
    expect(result.derivedMediaAssetId).toBeNull();
  });
});
