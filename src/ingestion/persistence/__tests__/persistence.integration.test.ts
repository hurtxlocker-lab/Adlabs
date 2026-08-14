import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { env } from "@/env/server";
import {
  ensureBrand,
  ensureSourceAccount,
  finishIngestionRun,
  IngestionRunStateError,
  saveRawIngestionItem,
  SourceAccountOwnershipConflictError,
  startIngestionRun,
} from "../index";

import { verifyDatabaseTargetSafety } from "@/db/target-safety";

describe("Database Integration: Step 4C1 Persistence Foundation", () => {
  const runId = Math.random().toString(36).substring(2, 9);
  const testPrefix = `test_4c1_${Date.now()}_${runId}`;

  const createdBrandIds: string[] = [];
  const createdSourceAccountIds: string[] = [];
  const createdIngestionRunIds: string[] = [];
  const createdRawItemIds: string[] = [];

  beforeAll(() => {
    // 1. Mandatory Safety Check: verify host and expected project ref before any writes
    const target = verifyDatabaseTargetSafety(
      env.DATABASE_URL,
      env.SUPABASE_PROJECT_REF,
    );
    expect(target.matchesExpected).toBe(true);
  });

  afterAll(async () => {
    // Cleanup in reverse dependency order using explicit IDs
    if (createdRawItemIds.length > 0) {
      await db
        .delete(schema.rawIngestionItems)
        .where(inArray(schema.rawIngestionItems.id, createdRawItemIds));
    }

    if (createdIngestionRunIds.length > 0) {
      await db
        .delete(schema.ingestionRuns)
        .where(inArray(schema.ingestionRuns.id, createdIngestionRunIds));
    }

    if (createdSourceAccountIds.length > 0) {
      await db
        .delete(schema.sourceAccounts)
        .where(inArray(schema.sourceAccounts.id, createdSourceAccountIds));
    }

    if (createdBrandIds.length > 0) {
      await db
        .delete(schema.brands)
        .where(inArray(schema.brands.id, createdBrandIds));
    }

    // Verify cleanup
    const remainingRaw = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.rawIngestionItems)
      .where(
        inArray(
          schema.rawIngestionItems.id,
          createdRawItemIds.length
            ? createdRawItemIds
            : ["00000000-0000-0000-0000-000000000000"],
        ),
      );

    const remainingBrands = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.brands)
      .where(
        inArray(
          schema.brands.id,
          createdBrandIds.length
            ? createdBrandIds
            : ["00000000-0000-0000-0000-000000000000"],
        ),
      );

    expect(remainingRaw[0].count).toBe(0);
    expect(remainingBrands[0].count).toBe(0);
  });

  it("1. ensureBrand creates a new brand", async () => {
    const slug = `${testPrefix}_brand_a`;
    const brand = await ensureBrand({
      name: "Test Brand A",
      slug,
      websiteUrl: "https://brand-a.example.test",
      category: "D2C Skincare",
    });

    createdBrandIds.push(brand.id);
    expect(brand.id).toBeDefined();
    expect(brand.slug).toBe(slug);
    expect(brand.name).toBe("Test Brand A");
  });

  it("2. repeated ensureBrand with same slug returns same row without updating", async () => {
    const slug = `${testPrefix}_brand_a`;
    const brandRepeat = await ensureBrand({
      name: "Test Brand A (New Name Ignored)",
      slug,
      websiteUrl: "https://ignored.example.test",
    });

    expect(brandRepeat.id).toBe(createdBrandIds[0]);
    expect(brandRepeat.name).toBe("Test Brand A");
  });

  it("3. ensureSourceAccount creates linked account", async () => {
    const pageId = `page_${testPrefix}_01`;
    const sourceAccount = await ensureSourceAccount({
      brandId: createdBrandIds[0],
      source: "meta",
      sourcePageId: pageId,
      displayName: "Brand A Official",
    });

    createdSourceAccountIds.push(sourceAccount.id);
    expect(sourceAccount.id).toBeDefined();
    expect(sourceAccount.brandId).toBe(createdBrandIds[0]);
    expect(sourceAccount.sourcePageId).toBe(pageId);
    expect(sourceAccount.displayName).toBe("Brand A Official");
  });

  it("4. repeated ensureSourceAccount returns same account", async () => {
    const pageId = `page_${testPrefix}_01`;
    const sourceAccountRepeat = await ensureSourceAccount({
      brandId: createdBrandIds[0],
      source: "meta",
      sourcePageId: pageId,
      displayName: "Brand A New Name Ignored",
    });

    expect(sourceAccountRepeat.id).toBe(createdSourceAccountIds[0]);
    expect(sourceAccountRepeat.displayName).toBe("Brand A Official");
  });

  it("5. cross-brand source account conflict throws SourceAccountOwnershipConflictError", async () => {
    const brandB = await ensureBrand({
      name: "Test Brand B",
      slug: `${testPrefix}_brand_b`,
    });
    createdBrandIds.push(brandB.id);

    const pageId = `page_${testPrefix}_01`;

    await expect(
      ensureSourceAccount({
        brandId: brandB.id,
        source: "meta",
        sourcePageId: pageId,
      }),
    ).rejects.toThrow(SourceAccountOwnershipConflictError);
  });

  it("6. startIngestionRun creates RUNNING row", async () => {
    const run = await startIngestionRun({
      source: "meta",
      sourceAccountId: createdSourceAccountIds[0],
      metadata: { env: "test" },
    });

    createdIngestionRunIds.push(run.id);
    expect(run.id).toBeDefined();
    expect(run.status).toBe("RUNNING");
    expect(run.sourceAccountId).toBe(createdSourceAccountIds[0]);
    expect(run.startedAt).toBeDefined();
    expect(run.finishedAt).toBeNull();
  });

  it("7. saveRawIngestionItem creates append-only raw row", async () => {
    const raw = await saveRawIngestionItem({
      ingestionRunId: createdIngestionRunIds[0],
      sourceItemId: "item_001",
      payload: { title: "Raw Payload 1" },
      payloadHash: "sha256:test_hash_1",
    });

    createdRawItemIds.push(raw.id);
    expect(raw.id).toBeDefined();
    expect(raw.ingestionRunId).toBe(createdIngestionRunIds[0]);
    expect(raw.payloadHash).toBe("sha256:test_hash_1");
  });

  it("8. two identical raw payload hashes can coexist append-only within the run", async () => {
    const rawDuplicate = await saveRawIngestionItem({
      ingestionRunId: createdIngestionRunIds[0],
      sourceItemId: "item_002",
      payload: { title: "Raw Payload 1" },
      payloadHash: "sha256:test_hash_1",
    });

    createdRawItemIds.push(rawDuplicate.id);
    expect(rawDuplicate.id).toBeDefined();
    expect(rawDuplicate.id).not.toBe(createdRawItemIds[0]);
    expect(rawDuplicate.payloadHash).toBe("sha256:test_hash_1");
  });

  it("9. finishIngestionRun finalizes RUNNING row", async () => {
    const finished = await finishIngestionRun({
      ingestionRunId: createdIngestionRunIds[0],
      status: "SUCCEEDED",
      sourceItemsCount: 2,
      newAdsCount: 2,
      updatedAdsCount: 0,
      mediaDownloadedCount: 4,
      mediaDuplicateCount: 1,
      mediaFailedCount: 0,
      bytesDownloaded: BigInt(1048576),
      uniqueBytesStored: BigInt(524288),
    });

    expect(finished.status).toBe("SUCCEEDED");
    expect(finished.finishedAt).toBeDefined();
    expect(finished.sourceItemsCount).toBe(2);
    expect(finished.bytesDownloaded).toBe(BigInt(1048576));
  });

  it("10. second finalization attempt throws IngestionRunStateError", async () => {
    await expect(
      finishIngestionRun({
        ingestionRunId: createdIngestionRunIds[0],
        status: "FAILED",
        sourceItemsCount: 0,
        newAdsCount: 0,
        updatedAdsCount: 0,
        mediaDownloadedCount: 0,
        mediaDuplicateCount: 0,
        mediaFailedCount: 0,
        bytesDownloaded: BigInt(0),
        uniqueBytesStored: BigInt(0),
      }),
    ).rejects.toThrow(IngestionRunStateError);
  });
});
