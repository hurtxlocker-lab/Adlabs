import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sourceAccounts } from "@/db/schema";
import {
  type DbOrTx,
  type EnsureSourceAccountInput,
  type SourceAccountRow,
  SourceAccountOwnershipConflictError,
} from "./types";
import { validateNonEmptyString, validateUuid } from "./validation";

/**
 * Race-safely ensures that a source account exists for (source, sourcePageId).
 *
 * Rules:
 *  - (source, source_page_id) is the unique canonical identity.
 *  - If account does not exist, creates it linked to brandId.
 *  - If account exists with SAME brandId, returns existing row without modifying it.
 *  - CRITICAL: If account exists with a DIFFERENT brandId, throws SourceAccountOwnershipConflictError
 *    (prevents crawler runs from silently stealing an advertising page from one brand to another).
 */
export async function ensureSourceAccount(
  input: EnsureSourceAccountInput,
  executor?: DbOrTx,
): Promise<SourceAccountRow> {
  const brandId = validateUuid(input.brandId, "brandId");
  const source = validateNonEmptyString(input.source, "source");
  const sourcePageId = validateNonEmptyString(input.sourcePageId, "sourcePageId");

  const client = executor ?? db;

  // 1. Attempt race-safe insert
  const [inserted] = await client
    .insert(sourceAccounts)
    .values({
      brandId,
      source,
      sourcePageId,
      sourcePageUrl: input.sourcePageUrl ?? null,
      displayName: input.displayName ?? null,
      metadata: input.metadata ?? {},
    })
    .onConflictDoNothing({
      target: [sourceAccounts.source, sourceAccounts.sourcePageId],
    })
    .returning();

  if (inserted) {
    return inserted;
  }

  // 2. Row exists — fetch canonical existing row to verify brand ownership
  const [existing] = await client
    .select()
    .from(sourceAccounts)
    .where(
      and(
        eq(sourceAccounts.source, source),
        eq(sourceAccounts.sourcePageId, sourcePageId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error(
      `Failed to retrieve source account for ${source}:${sourcePageId}`,
    );
  }

  // 3. Prevent cross-brand account hijacking
  if (existing.brandId !== brandId) {
    throw new SourceAccountOwnershipConflictError(
      `Source account ${source}:${sourcePageId} already belongs to brand "${existing.brandId}". Cannot reassign to brand "${brandId}".`,
      existing,
      brandId,
    );
  }

  return existing;
}
