import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { mediaAssets, mediaDerivatives } from "@/db/schema";
import type { DerivativeKind, PhysicalMediaProbeResult } from "../types";

export type DbClient = PostgresJsDatabase<Record<string, unknown>>;

export interface DerivativeJobRecord {
  id: string;
  sourceMediaAssetId: string;
  derivedMediaAssetId: string | null;
  derivativeKind: string;
  recipeVersion: string;
  status: string;
  errorReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Gets or creates a single logical media derivative job.
 * Idempotent: enforces the unique constraint (sourceMediaAssetId, derivativeKind, recipeVersion).
 */
export async function getOrCreateDerivativeJob(
  db: DbClient,
  sourceMediaAssetId: string,
  derivativeKind: DerivativeKind,
  recipeVersion: string,
): Promise<DerivativeJobRecord> {
  const existing = await db
    .select()
    .from(mediaDerivatives)
    .where(
      and(
        eq(mediaDerivatives.sourceMediaAssetId, sourceMediaAssetId),
        eq(mediaDerivatives.derivativeKind, derivativeKind),
        eq(mediaDerivatives.recipeVersion, recipeVersion),
      ),
    )
    .limit(1);

  if (existing.length > 0 && existing[0]) {
    return existing[0];
  }

  // Insert new pending job with conflict fallback
  const inserted = await db
    .insert(mediaDerivatives)
    .values({
      sourceMediaAssetId,
      derivativeKind,
      recipeVersion,
      status: "PENDING",
      derivedMediaAssetId: null,
      errorReason: null,
      updatedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [
        mediaDerivatives.sourceMediaAssetId,
        mediaDerivatives.derivativeKind,
        mediaDerivatives.recipeVersion,
      ],
    })
    .returning();

  if (inserted.length > 0 && inserted[0]) {
    return inserted[0];
  }

  // Re-fetch in case of concurrent insert race
  const refetched = await db
    .select()
    .from(mediaDerivatives)
    .where(
      and(
        eq(mediaDerivatives.sourceMediaAssetId, sourceMediaAssetId),
        eq(mediaDerivatives.derivativeKind, derivativeKind),
        eq(mediaDerivatives.recipeVersion, recipeVersion),
      ),
    )
    .limit(1);

  if (refetched.length === 0 || !refetched[0]) {
    throw new Error(
      `Failed to create or retrieve media derivative job for asset "${sourceMediaAssetId}" [${derivativeKind}:${recipeVersion}]`,
    );
  }

  return refetched[0];
}

/**
 * Transitions a derivative job into PROCESSING status (initial attempt or retry).
 * Explicitly clears errorReason and ensures derivedMediaAssetId is null during processing.
 */
export async function markDerivativeProcessing(
  db: DbClient,
  jobId: string,
): Promise<DerivativeJobRecord> {
  const updated = await db
    .update(mediaDerivatives)
    .set({
      status: "PROCESSING",
      derivedMediaAssetId: null,
      errorReason: null,
      updatedAt: new Date(),
    })
    .where(eq(mediaDerivatives.id, jobId))
    .returning();

  if (updated.length === 0 || !updated[0]) {
    throw new Error(`Derivative job "${jobId}" not found for status update to PROCESSING`);
  }

  return updated[0];
}

/**
 * Transitions a derivative job into READY status with its newly created derived media asset ID.
 * Enforces that derivedMediaAssetId is non-null and clears errorReason.
 */
export async function markDerivativeReady(
  db: DbClient,
  jobId: string,
  derivedMediaAssetId: string,
): Promise<DerivativeJobRecord> {
  if (!derivedMediaAssetId) {
    throw new Error("derivedMediaAssetId is required when marking a derivative job as READY");
  }

  const updated = await db
    .update(mediaDerivatives)
    .set({
      status: "READY",
      derivedMediaAssetId,
      errorReason: null,
      updatedAt: new Date(),
    })
    .where(eq(mediaDerivatives.id, jobId))
    .returning();

  if (updated.length === 0 || !updated[0]) {
    throw new Error(`Derivative job "${jobId}" not found for status update to READY`);
  }

  return updated[0];
}

/**
 * Transitions a derivative job into FAILED status with diagnostic error reason.
 * Enforces that derivedMediaAssetId is null.
 */
export async function markDerivativeFailed(
  db: DbClient,
  jobId: string,
  errorReason: string,
): Promise<DerivativeJobRecord> {
  const cleanReason = errorReason.slice(0, 2000);

  const updated = await db
    .update(mediaDerivatives)
    .set({
      status: "FAILED",
      derivedMediaAssetId: null,
      errorReason: cleanReason,
      updatedAt: new Date(),
    })
    .where(eq(mediaDerivatives.id, jobId))
    .returning();

  if (updated.length === 0 || !updated[0]) {
    throw new Error(`Derivative job "${jobId}" not found for status update to FAILED`);
  }

  return updated[0];
}

/**
 * Safely backfills or updates physical metadata on an existing media_assets row.
 */
export async function updateMediaAssetPhysicalMetadata(
  db: DbClient,
  mediaAssetId: string,
  metadata: PhysicalMediaProbeResult,
): Promise<void> {
  await db
    .update(mediaAssets)
    .set({
      width: metadata.width,
      height: metadata.height,
      durationMs: metadata.durationMs,
      hasAudio: metadata.hasAudio,
      ...(metadata.byteSize !== undefined ? { byteSize: metadata.byteSize } : {}),
      updatedAt: new Date(),
    })
    .where(eq(mediaAssets.id, mediaAssetId));
}
