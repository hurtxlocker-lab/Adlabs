import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { brands } from "@/db/schema";
import type { BrandRow, DbOrTx, EnsureBrandInput } from "./types";
import { validateNonEmptyString } from "./validation";

/**
 * Race-safely ensures that a brand exists by slug.
 *
 * Rules:
 *  - slug is the unique canonical identity.
 *  - If brand with slug does not exist, creates it.
 *  - If brand already exists, returns the existing record without modifying it.
 *  - Does not overwrite metadata on existing brands.
 */
export async function ensureBrand(
  input: EnsureBrandInput,
  executor?: DbOrTx,
): Promise<BrandRow> {
  const name = validateNonEmptyString(input.name, "name");
  const slug = validateNonEmptyString(input.slug, "slug");

  const client = executor ?? db;

  // 1. Attempt race-safe insert
  const [inserted] = await client
    .insert(brands)
    .values({
      name,
      slug,
      websiteUrl: input.websiteUrl ?? null,
      category: input.category ?? null,
    })
    .onConflictDoNothing({ target: brands.slug })
    .returning();

  if (inserted) {
    return inserted;
  }

  // 2. Row already exists — fetch canonical existing row
  const [existing] = await client
    .select()
    .from(brands)
    .where(eq(brands.slug, slug))
    .limit(1);

  if (!existing) {
    throw new Error(`Failed to retrieve existing brand for slug "${slug}"`);
  }

  return existing;
}
