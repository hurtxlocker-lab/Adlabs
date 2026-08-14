import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import type {
  AdPersistenceResult,
  DbOrTx,
  UpsertAdInput,
} from "./types";
import {
  AdSourceAccountConflictError,
  AdvertiserSourceAccountMismatchError,
} from "./types";
import { validateNonEmptyString, validateUuid } from "./validation";

/**
 * Race-safe upsert for canonical ads.
 *
 * Invariants:
 *  1. Ad identity is strictly (source, source_ad_id).
 *  2. Source account ownership is validated against ad.advertiser.sourcePageId.
 *  3. An existing ad cannot be silently reparented to a different source_account_id.
 *  4. first_seen_at is set once on creation and is NEVER mutated.
 *  5. last_seen_at is set to database now() on every observation.
 *  6. Mutable snapshot fields and raw_last_payload are refreshed on update.
 *  7. Cards and media collections are ignored at this stage.
 */
export async function upsertAd(
  input: UpsertAdInput,
  executor?: DbOrTx,
): Promise<AdPersistenceResult> {
  const client = executor ?? db;

  const sourceAccountId = validateUuid(
    input.sourceAccountId,
    "sourceAccountId",
  );
  const { ad } = input;

  validateNonEmptyString(ad.source, "ad.source");
  validateNonEmptyString(ad.sourceAdId, "ad.sourceAdId");
  validateNonEmptyString(
    ad.advertiser.sourcePageId,
    "ad.advertiser.sourcePageId",
  );

  // 1. Verify Source Account existence and advertiser pageId consistency
  const accounts = await client
    .select()
    .from(schema.sourceAccounts)
    .where(eq(schema.sourceAccounts.id, sourceAccountId));

  if (!accounts || accounts.length === 0) {
    throw new Error(
      `Source account with ID "${sourceAccountId}" does not exist.`,
    );
  }

  const account = accounts[0];

  if (account.source !== ad.source) {
    throw new AdvertiserSourceAccountMismatchError(
      `Source mismatch: account source "${account.source}" does not match ad source "${ad.source}".`,
      account.sourcePageId,
      ad.advertiser.sourcePageId,
    );
  }

  if (account.sourcePageId !== ad.advertiser.sourcePageId) {
    throw new AdvertiserSourceAccountMismatchError(
      `Advertiser page ID "${ad.advertiser.sourcePageId}" does not match tracked source account page ID "${account.sourcePageId}".`,
      account.sourcePageId,
      ad.advertiser.sourcePageId,
    );
  }

  const rawPayload =
    typeof ad.raw === "object" && ad.raw !== null
      ? (ad.raw as Record<string, unknown>)
      : { raw: ad.raw };

  // 2. Attempt race-safe insert
  const insertValues = {
    source: ad.source,
    sourceAdId: ad.sourceAdId,
    sourceAccountId,
    sourceCollationId: ad.sourceCollationId ?? null,
    sourceCollationCount: ad.sourceCollationCount ?? null,
    displayFormat: ad.displayFormat ?? null,
    publisherPageId: ad.publisher?.sourcePageId ?? null,
    publisherPageName: ad.publisher?.name ?? null,
    publisherPageUri: ad.publisher?.url ?? null,
    brandedContentPageId: ad.brandedContent?.sourcePageId ?? null,
    brandedContentPageName: ad.brandedContent?.name ?? null,
    brandedContentPageUri: ad.brandedContent?.url ?? null,
    primaryText: ad.primaryText ?? null,
    headline: ad.headline ?? null,
    description: ad.description ?? null,
    ctaText: ad.ctaText ?? null,
    ctaType: ad.ctaType ?? null,
    destinationUrl: ad.destinationUrl ?? null,
    publisherPlatforms: ad.publisherPlatforms ?? [],
    platformStartAt: ad.platformStartAt ?? null,
    sourceReportedEndAt: ad.sourceReportedEndAt ?? null,
    isActiveObserved: ad.active ?? null,
    adLibraryUrl: ad.adLibraryUrl ?? null,
    rawLastPayload: rawPayload,
    firstSeenAt: sql`now()`,
    lastSeenAt: sql`now()`,
    createdAt: sql`now()`,
    updatedAt: sql`now()`,
  };

  const inserted = await client
    .insert(schema.ads)
    .values(insertValues)
    .onConflictDoNothing({
      target: [schema.ads.source, schema.ads.sourceAdId],
    })
    .returning();

  if (inserted.length > 0) {
    return {
      ad: inserted[0],
      outcome: "created",
    };
  }

  // 3. Conflict path: retrieve existing ad to check ownership and update
  const existingRows = await client
    .select()
    .from(schema.ads)
    .where(
      and(
        eq(schema.ads.source, ad.source),
        eq(schema.ads.sourceAdId, ad.sourceAdId),
      ),
    );

  if (!existingRows || existingRows.length === 0) {
    throw new Error(
      `Failed to resolve ad for source "${ad.source}" and sourceAdId "${ad.sourceAdId}".`,
    );
  }

  const existingAd = existingRows[0];

  // Invariant: Do not silently reparent ad to a different source_account_id
  if (existingAd.sourceAccountId !== sourceAccountId) {
    throw new AdSourceAccountConflictError(
      `Ad "${ad.source}:${ad.sourceAdId}" is already owned by source account "${existingAd.sourceAccountId}", cannot reparent to "${sourceAccountId}".`,
      existingAd,
      sourceAccountId,
    );
  }

  // Update mutable snapshot fields (firstSeenAt is deliberately OMITTED and immutable)
  const updateValues = {
    sourceCollationId: ad.sourceCollationId ?? null,
    sourceCollationCount: ad.sourceCollationCount ?? null,
    displayFormat: ad.displayFormat ?? null,
    publisherPageId: ad.publisher?.sourcePageId ?? null,
    publisherPageName: ad.publisher?.name ?? null,
    publisherPageUri: ad.publisher?.url ?? null,
    brandedContentPageId: ad.brandedContent?.sourcePageId ?? null,
    brandedContentPageName: ad.brandedContent?.name ?? null,
    brandedContentPageUri: ad.brandedContent?.url ?? null,
    primaryText: ad.primaryText ?? null,
    headline: ad.headline ?? null,
    description: ad.description ?? null,
    ctaText: ad.ctaText ?? null,
    ctaType: ad.ctaType ?? null,
    destinationUrl: ad.destinationUrl ?? null,
    publisherPlatforms: ad.publisherPlatforms ?? [],
    platformStartAt: ad.platformStartAt ?? null,
    sourceReportedEndAt: ad.sourceReportedEndAt ?? null,
    isActiveObserved: ad.active ?? null,
    adLibraryUrl: ad.adLibraryUrl ?? null,
    rawLastPayload: rawPayload,
    lastSeenAt: sql`now()`,
    updatedAt: sql`now()`,
  };

  const updated = await client
    .update(schema.ads)
    .set(updateValues)
    .where(eq(schema.ads.id, existingAd.id))
    .returning();

  return {
    ad: updated[0],
    outcome: "updated",
  };
}
