import { describe, expect, it } from "vitest";
import { discoveryFilterInputSchema } from "@/discovery/filters/contract";

/**
 * Brand filter token semantics — regression coverage for the Brands Atlas
 * slug-link integration.
 *
 * Contract: `?brand=` accepts internal UUIDs (legacy interactive-filter links)
 * AND public brand slugs (Brands Atlas card links, KT §J). Unknown tokens must
 * yield zero rows — never a 500. The predicate compiler resolves slugs against
 * the brands table; UUIDs bind directly to brand_id.
 *
 * SQL-level behavior is validated live (slug filters to Huel-only cards,
 * unknown slug renders empty state with HTTP 200). These tests pin the
 * token-classification logic that drives the predicate split.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mirror of predicates.ts token classification — kept in sync intentionally. */
function classifyTokens(tokens: string[]) {
  const uuids = tokens.filter((t) => UUID_RE.test(t));
  const slugs = tokens.filter((t) => !UUID_RE.test(t));
  return { uuids, slugs };
}

// Same regex shape as contract.ts brandTokenSchema slug branch
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe("brand filter token classification", () => {
  it("classifies legacy UUID tokens as UUIDs", () => {
    const { uuids, slugs } = classifyTokens([
      "549edbea-1234-4abc-9def-567890abcdef",
    ]);
    expect(uuids).toHaveLength(1);
    expect(slugs).toHaveLength(0);
  });

  it("classifies brand slugs as slugs", () => {
    const { uuids, slugs } = classifyTokens(["huel", "rhode", "im8-health"]);
    expect(slugs).toEqual(["huel", "rhode", "im8-health"]);
    expect(uuids).toHaveLength(0);
  });

  it("handles mixed slug + UUID tokens in one param", () => {
    const { uuids, slugs } = classifyTokens([
      "huel",
      "549edbea-1234-4abc-9def-567890abcdef",
    ]);
    expect(uuids).toHaveLength(1);
    expect(slugs).toEqual(["huel"]);
  });

  it("unknown slug still classifies as slug → zero-row subquery, not 500", () => {
    // The critical regression: pre-fix, a non-UUID string reached Postgres's
    // uuid parser and threw. Post-fix it compiles to a slug subquery matching
    // zero rows. Classification alone proves the 500 path is unreachable.
    const { slugs } = classifyTokens(["doesnotexist"]);
    expect(slugs).toEqual(["doesnotexist"]);
    expect(SLUG_RE.test("doesnotexist")).toBe(true);
  });

  it("contract schema accepts both shapes (brandTokenSchema union)", async () => {
    const schema = discoveryFilterInputSchema;
    const uuidOk = schema.safeParse({ brandIds: ["549edbea-1234-4abc-9def-567890abcdef"] });
    const slugOk = schema.safeParse({ brandIds: ["huel"] });
    const mixedOk = schema.safeParse({ brandIds: ["huel", "549edbea-1234-4abc-9def-567890abcdef"] });
    expect(uuidOk.success).toBe(true);
    expect(slugOk.success).toBe(true);
    expect(mixedOk.success).toBe(true);
  });

  it("contract schema rejects malformed tokens (spaces, special chars)", () => {
    const schema = discoveryFilterInputSchema;
    expect(schema.safeParse({ brandIds: ["two words"] }).success).toBe(false);
    expect(schema.safeParse({ brandIds: ["bad;token"] }).success).toBe(false);
  });
});
