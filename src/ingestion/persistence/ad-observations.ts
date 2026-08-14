import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import type {
  AdObservationRow,
  CreateAdObservationInput,
  DbOrTx,
} from "./types";
import { DuplicateAdObservationError } from "./types";
import { validateUuid } from "./validation";

/**
 * Persists an append-only observation of an ad during a specific ingestion run.
 *
 * Invariants:
 *  1. One observation per (ad_id, ingestion_run_id).
 *  2. observed_at is set to database now().
 *  3. Duplicate observations within the same run throw DuplicateAdObservationError.
 *  4. Existing observations are never mutated.
 */
export async function createAdObservation(
  input: CreateAdObservationInput,
  executor?: DbOrTx,
): Promise<AdObservationRow> {
  const client = executor ?? db;

  const adId = validateUuid(input.adId, "adId");
  const ingestionRunId = validateUuid(
    input.ingestionRunId,
    "ingestionRunId",
  );

  const metadata = input.metadata ?? {};

  try {
    const inserted = await client
      .insert(schema.adObservations)
      .values({
        adId,
        ingestionRunId,
        observedActive: input.observedActive ?? null,
        snapshotHash: input.snapshotHash ?? null,
        metadata,
        observedAt: sql`now()`,
      })
      .returning();

    return inserted[0];
  } catch (err: unknown) {
    const errorStr =
      String(err) +
      (err instanceof Error
        ? ` ${err.message} ${String((err as { cause?: unknown }).cause)}`
        : "");

    const isUniqueViolation =
      errorStr.includes("23505") ||
      errorStr.includes("ad_observations_ad_id_ingestion_run_id_unique") ||
      errorStr.includes("duplicate key value") ||
      (typeof err === "object" &&
        err !== null &&
        (("code" in err && (err as { code?: string }).code === "23505") ||
          ("cause" in err &&
            typeof (err as { cause?: unknown }).cause === "object" &&
            (err as { cause?: { code?: string } }).cause?.code === "23505")));

    if (isUniqueViolation) {
      throw new DuplicateAdObservationError(
        `Duplicate observation: Ad "${adId}" has already been observed in ingestion run "${ingestionRunId}".`,
        adId,
        ingestionRunId,
      );
    }

    throw err;
  }
}
