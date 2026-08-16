import { describe, expect, it } from "vitest";
import { mediaAssets, mediaDerivatives } from "@/db/schema";
import { getTableColumns } from "drizzle-orm";
import { DERIVATIVE_KINDS, DERIVATIVE_STATUSES } from "../types";

describe("Media Derivatives & Physical Metadata Schema", () => {
  it("includes physical metadata columns on media_assets schema", () => {
    const columns = getTableColumns(mediaAssets);

    expect(columns.id).toBeDefined();
    expect(columns.mediaType).toBeDefined();
    expect(columns.byteSize).toBeDefined();
    expect(columns.sha256).toBeDefined();
    expect(columns.width).toBeDefined();
    expect(columns.height).toBeDefined();
    expect(columns.durationMs).toBeDefined();
    expect(columns.hasAudio).toBeDefined();
  });

  it("defines media_derivatives table with required fields and foreign keys", () => {
    const columns = getTableColumns(mediaDerivatives);

    expect(columns.id).toBeDefined();
    expect(columns.sourceMediaAssetId).toBeDefined();
    expect(columns.derivedMediaAssetId).toBeDefined();
    expect(columns.derivativeKind).toBeDefined();
    expect(columns.recipeVersion).toBeDefined();
    expect(columns.status).toBeDefined();
    expect(columns.errorReason).toBeDefined();
    expect(columns.createdAt).toBeDefined();
    expect(columns.updatedAt).toBeDefined();
  });

  it("exports finite derivative kinds and statuses matching DB contract", () => {
    expect(DERIVATIVE_KINDS).toEqual(["PREVIEW_LOOP", "DISPLAY_IMAGE", "POSTER"]);
    expect(DERIVATIVE_STATUSES).toEqual(["PENDING", "PROCESSING", "READY", "FAILED"]);
  });
});
