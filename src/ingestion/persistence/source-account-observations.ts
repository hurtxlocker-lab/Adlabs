import { db as defaultDb } from "@/db/client";
import { sourceAccountObservations } from "@/db/schema";
import type { SourceAccountObservationData } from "@/ingestion/types";
import type { DbExecutor } from "./types";

export interface SaveSourceAccountObservationInput {
  sourceAccountId: string;
  ingestionRunId?: string | null;
  observedAt?: Date;
  data: SourceAccountObservationData;
}

/**
 * Persists a new source_account_observation row for historical tracking.
 *
 * Rules:
 *  - Mutable account metadata is appended as an observation event (does not overwrite past history).
 *  - Preserves provider metadata faithfully.
 */
export async function saveSourceAccountObservation(
  input: SaveSourceAccountObservationInput,
  executor: DbExecutor = defaultDb,
): Promise<string> {
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
    .returning({ id: sourceAccountObservations.id });

  return inserted.id;
}
