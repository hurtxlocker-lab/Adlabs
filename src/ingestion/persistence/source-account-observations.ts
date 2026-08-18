import { db as defaultDb } from "@/db/client";
import { sourceAccountObservations } from "@/db/schema";
import type { SourceAccountObservationData } from "@/ingestion/types";
import { and, eq } from "drizzle-orm";
import type { DbExecutor } from "./types";

export interface SaveSourceAccountObservationInput {
  sourceAccountId: string;
  ingestionRunId?: string | null;
  observedAt?: Date;
  data: SourceAccountObservationData;
}

/**
 * Persists a source_account_observation row for historical tracking.
 *
 * Rules:
 *  - Mutable account metadata is appended as an observation event (does not overwrite past history across runs).
 *  - Deduplicates per (source_account_id, ingestion_run_id) so multiple ads in the same run share ONE account observation.
 *  - Preserves provider metadata faithfully.
 */
export async function saveSourceAccountObservation(
  input: SaveSourceAccountObservationInput,
  executor: DbExecutor = defaultDb,
): Promise<string> {
  // If run-backed, check if observation already exists for this (sourceAccountId, ingestionRunId)
  if (input.ingestionRunId) {
    const [existing] = await executor
      .select({ id: sourceAccountObservations.id })
      .from(sourceAccountObservations)
      .where(
        and(
          eq(sourceAccountObservations.sourceAccountId, input.sourceAccountId),
          eq(sourceAccountObservations.ingestionRunId, input.ingestionRunId),
        ),
      )
      .limit(1);

    if (existing) {
      return existing.id;
    }
  }

  const [inserted] = await executor
    .insert(sourceAccountObservations)
    .values({
      sourceAccountId: input.sourceAccountId,
      ingestionRunId: input.ingestionRunId ?? null,
      observedAt: input.observedAt ?? new Date(),
      pageCategory: input.data.pageCategory ?? null,
      facebookLikes: input.data.facebookLikes != null ? BigInt(input.data.facebookLikes) : null,
      instagramUsername: input.data.instagramUsername ?? null,
      instagramFollowers: input.data.instagramFollowers != null ? BigInt(input.data.instagramFollowers) : null,
      facebookVerified: input.data.facebookVerified ?? null,
      instagramVerified: input.data.instagramVerified ?? null,
      pageIsDeleted: input.data.pageIsDeleted ?? null,
      pageIsRestricted: input.data.pageIsRestricted ?? null,
      aboutText: input.data.aboutText ?? null,
      profileImageUrl: input.data.profileImageUrl ?? null,
      coverImageUrl: input.data.coverImageUrl ?? null,
      providerMetadata: input.data.providerMetadata ?? {},
    })
    .onConflictDoNothing()
    .returning({ id: sourceAccountObservations.id });

  if (inserted) {
    return inserted.id;
  }

  // Fallback if onConflictDoNothing was hit concurrently
  if (input.ingestionRunId) {
    const [fallback] = await executor
      .select({ id: sourceAccountObservations.id })
      .from(sourceAccountObservations)
      .where(
        and(
          eq(sourceAccountObservations.sourceAccountId, input.sourceAccountId),
          eq(sourceAccountObservations.ingestionRunId, input.ingestionRunId),
        ),
      )
      .limit(1);
    if (fallback) return fallback.id;
  }

  throw new Error("Failed to insert or resolve source account observation");
}
