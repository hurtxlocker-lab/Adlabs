import { db } from "@/db/client";
import { rawIngestionItems } from "@/db/schema";
import type {
  DbOrTx,
  RawIngestionItemRow,
  SaveRawIngestionItemInput,
} from "./types";
import { validateNonEmptyString, validateUuid } from "./validation";

/**
 * Persists an append-only raw ingestion payload item.
 *
 * Rules:
 *  - Append-only: always inserts a new row.
 *  - Never updates or deduplicates by payload_hash (duplicate hashes are allowed across and within runs).
 *  - sourceItemId is nullable and trimmed if provided.
 *  - payload is preserved verbatim.
 */
export async function saveRawIngestionItem(
  input: SaveRawIngestionItemInput,
  executor?: DbOrTx,
): Promise<RawIngestionItemRow> {
  const ingestionRunId = validateUuid(
    input.ingestionRunId,
    "ingestionRunId",
  );
  const payloadHash = validateNonEmptyString(
    input.payloadHash,
    "payloadHash",
  );

  const sourceItemId =
    typeof input.sourceItemId === "string" &&
    input.sourceItemId.trim().length > 0
      ? input.sourceItemId.trim()
      : null;

  if (input.payload === null || typeof input.payload !== "object") {
    throw new Error("Field \"payload\" must be a valid JSON object or array");
  }

  const client = executor ?? db;

  const [inserted] = await client
    .insert(rawIngestionItems)
    .values({
      ingestionRunId,
      sourceItemId,
      payload: input.payload as Record<string, unknown>,
      payloadHash,
    })
    .returning();

  if (!inserted) {
    throw new Error("Failed to insert raw ingestion item");
  }

  return inserted;
}
