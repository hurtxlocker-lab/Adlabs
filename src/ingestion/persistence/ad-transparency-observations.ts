import { db as defaultDb } from "@/db/client";
import { adTransparencyObservations } from "@/db/schema";
import type { SourceAdTransparencyObservation } from "@/ingestion/types";
import type { DbExecutor } from "./types";

export interface SaveAdTransparencyObservationsInput {
  adObservationId: string;
  observedAt?: Date;
  transparencyObservations: SourceAdTransparencyObservation[];
}

/**
 * Persists regional transparency observation rows linked to an ad_observation.
 *
 * Rules:
 *  - Upserts rows keyed by (ad_observation_id, region).
 *  - Never infers or leaks collection query context.
 *  - Preserves target_countries and reached_countries as separate normalized arrays.
 */
export async function saveAdTransparencyObservations(
  input: SaveAdTransparencyObservationsInput,
  executor: DbExecutor = defaultDb,
): Promise<string[]> {
  if (input.transparencyObservations.length === 0) {
    return [];
  }

  const valuesToInsert = input.transparencyObservations.map((obs) => ({
    adObservationId: input.adObservationId,
    region: obs.region,
    totalReach: obs.totalReach != null ? BigInt(obs.totalReach) : null,
    targetAgeMin: obs.targetAgeMin ?? null,
    targetAgeMax: obs.targetAgeMax ?? null,
    targetGender: obs.targetGender ?? null,
    targetCountries: obs.targetCountries ?? [],
    reachedCountries: obs.reachedCountries ?? [],
    reachBreakdown: obs.reachBreakdown ?? null,
    providerPayload: obs.providerPayload ?? null,
    observedAt: input.observedAt ?? new Date(),
  }));

  const inserted = await executor
    .insert(adTransparencyObservations)
    .values(valuesToInsert)
    .onConflictDoUpdate({
      target: [adTransparencyObservations.adObservationId, adTransparencyObservations.region],
      set: {
        totalReach: adTransparencyObservations.totalReach,
        targetAgeMin: adTransparencyObservations.targetAgeMin,
        targetAgeMax: adTransparencyObservations.targetAgeMax,
        targetGender: adTransparencyObservations.targetGender,
        targetCountries: adTransparencyObservations.targetCountries,
        reachedCountries: adTransparencyObservations.reachedCountries,
        reachBreakdown: adTransparencyObservations.reachBreakdown,
        providerPayload: adTransparencyObservations.providerPayload,
        observedAt: adTransparencyObservations.observedAt,
      },
    })
    .returning({ id: adTransparencyObservations.id });

  return inserted.map((row) => row.id);
}
