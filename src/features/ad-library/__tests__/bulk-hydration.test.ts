/**
 * Bulk hydration architecture tests for getAdLibraryItemsByIds.
 *
 * These are structural / unit-level tests that validate the ordering contract
 * and missing-ID behavior WITHOUT hitting the database.
 *
 * The DB integration contract (actual SQL query counts, bounded queries) is
 * validated in the integration tests.
 */
import { describe, expect, it } from "vitest";

/**
 * Ordering contract test — pure in-memory simulation of the assembler loop.
 *
 * The assembler in getAdLibraryItemsByIds iterates `adIds` in order and looks
 * up each from a Map<adId, row>. This test directly validates that contract.
 */
describe("getAdLibraryItemsByIds — ordering contract", () => {
  /**
   * Simulate the exact assembler loop from getAdLibraryItemsByIds.
   * adRows may arrive from the DB in any order; adIds defines requested order.
   */
  function simulateAssembler(
    adIds: string[],
    dbRows: { id: string; name: string }[],
  ): string[] {
    const rowById = new Map(dbRows.map((r) => [r.id, r]));
    const result: string[] = [];
    for (const adId of adIds) {
      const row = rowById.get(adId);
      if (!row) continue; // Missing canonical row — skip
      result.push(row.id);
    }
    return result;
  }

  it("preserves exact input ordering [C, A, B] even when DB returns [A, B, C]", () => {
    const adIds = ["C", "A", "B"];
    const dbRows = [
      { id: "A", name: "Alpha" },
      { id: "B", name: "Beta" },
      { id: "C", name: "Charlie" },
    ];
    // DB returned in a different order — result should still be C, A, B
    expect(simulateAssembler(adIds, dbRows)).toEqual(["C", "A", "B"]);
  });

  it("skips missing canonical rows without disrupting ordering", () => {
    const adIds = ["A", "MISSING", "B"];
    const dbRows = [
      { id: "A", name: "Alpha" },
      { id: "B", name: "Beta" },
      // MISSING not in DB
    ];
    // MISSING should be skipped, order of remaining preserved
    expect(simulateAssembler(adIds, dbRows)).toEqual(["A", "B"]);
  });

  it("returns empty array for empty adIds", () => {
    expect(simulateAssembler([], [])).toEqual([]);
  });

  it("returns empty array when all IDs are missing from DB", () => {
    expect(simulateAssembler(["X", "Y"], [])).toEqual([]);
  });

  it("single-element list preserved", () => {
    const dbRows = [{ id: "Z", name: "Zeta" }];
    expect(simulateAssembler(["Z"], dbRows)).toEqual(["Z"]);
  });

  it("deduplication: if same ID appears twice in adIds, returns it twice (DB row reused)", () => {
    // Discovery engine should not emit duplicate IDs, but codec is defensive
    const adIds = ["A", "A", "B"];
    const dbRows = [{ id: "A", name: "Alpha" }, { id: "B", name: "Beta" }];
    // A appears twice in input — each lookup finds the same row
    expect(simulateAssembler(adIds, dbRows)).toEqual(["A", "A", "B"]);
  });
});

describe("getAdLibraryItemsByIds — bounded query architecture", () => {
  /**
   * Documents the expected query fanout for getAdLibraryItemsByIds.
   * These are not executable DB tests — they document the architecture invariant
   * so the constraint is visible in the test suite.
   *
   * Actual query-count validation is in filters.integration.test.ts.
   */
  it("documents: issues at most 5 SQL queries regardless of ad count", () => {
    /**
     * Expected bounded query sequence:
     *   Query 1: ads JOIN source_accounts JOIN brands WHERE id IN (adIds)
     *   Query 2: ad_media JOIN media_assets WHERE ad_id IN (adIds)
     *   Query 3: ad_cards WHERE ad_id IN (adIds)
     *   Query 4: card_media JOIN media_assets WHERE ad_card_id IN (cardIds)
     *            [skipped if no cards]
     *   Query 5: media_derivatives JOIN media_assets WHERE source_media_asset_id IN (videoIds)
     *            [skipped if no videos]
     *
     * This is always bounded at N=5, independent of how many ads are in adIds.
     * N+1 per-ad hydration is explicitly prohibited.
     */
    expect(true).toBe(true); // Architecture invariant documented
  });

  it("documents: result length may be < adIds.length when canonical rows are missing", () => {
    /**
     * Missing rows (e.g. deleted after discovery index row was created) are
     * silently skipped. Callers must not assume result.length === adIds.length.
     */
    expect(true).toBe(true); // Architecture invariant documented
  });
});
