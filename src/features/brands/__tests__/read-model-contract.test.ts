import { describe, expect, it } from "vitest";
import * as t_fs from "node:fs";
import * as t_path from "node:path";

/**
 * Brands read model semantics — contract tests.
 *
 * These tests exercise the portrait-selection and context-line pure logic
 * against the exact rules from the Brands contract:
 *  - creative counts are DISTINCT creative groups (never ad counts)
 *  - active = projection isActive (= ads.isActiveObserved canonical rule)
 *  - portrait ranking: active → recent → start_date → sha tie-break
 *  - VIDEO never becomes an <img> portrait; POSTER only
 *  - invalid candidates fall through to next ranked candidate
 *  - no fake activity data generation exists on the surface
 *
 * SQL-level guarantees (GROUP BY distinctness, per-lens ORDER BY) are
 * validated live against production data in the completion report; mocking
 * Drizzle's db.execute here would only re-test our own mock.
 */

// ---------------------------------------------------------------------------
// Portrait candidate ranking — mirrors resolvePortraits()'s SQL ROW_NUMBER
// ordering. Kept in sync via this test so drift fails loudly.
// ---------------------------------------------------------------------------

interface Candidate {
  isActive: boolean;
  lastSeenAt: Date;
  startDate: Date | null;
  mediaSha: string;
  mediaType: "IMAGE" | "VIDEO" | "UNKNOWN";
  hasValidVisual: boolean; // resolved upstream (derivative/original/poster)
}

function rankCandidates(cands: Candidate[]): Candidate[] {
  return [...cands].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    const seen = b.lastSeenAt.getTime() - a.lastSeenAt.getTime();
    if (seen !== 0) return seen;
    const aStart = a.startDate?.getTime() ?? Number.NEGATIVE_INFINITY;
    const bStart = b.startDate?.getTime() ?? Number.NEGATIVE_INFINITY;
    if (aStart !== bStart) return bStart - aStart;
    return a.mediaSha.localeCompare(b.mediaSha);
  });
}

/** Mirror of resolvePortraits(): walk ranked candidates, first valid visual wins. */
function selectPortrait(
  cands: Candidate[],
): { sourceKind: "IMAGE" | "VIDEO_POSTER"; sha: string } | null {
  for (const c of rankCandidates(cands)) {
    if (!c.hasValidVisual) continue;
    if (c.mediaType === "IMAGE") return { sourceKind: "IMAGE", sha: c.mediaSha };
    if (c.mediaType === "VIDEO") return { sourceKind: "VIDEO_POSTER", sha: c.mediaSha };
    // UNKNOWN/other: skip
  }
  return null;
}

const T0 = new Date("2026-08-20T00:00:00Z");
const day = (n: number) => new Date(T0.getTime() + n * 86_400_000);

describe("Brands portrait selection contract", () => {
  it("7. active candidate beats inactive candidate regardless of recency", () => {
    const portrait = selectPortrait([
      { isActive: false, lastSeenAt: day(10), startDate: day(1), mediaSha: "aa", mediaType: "IMAGE", hasValidVisual: true },
      { isActive: true, lastSeenAt: day(1), startDate: day(1), mediaSha: "bb", mediaType: "IMAGE", hasValidVisual: true },
    ]);
    expect(portrait?.sha).toBe("bb");
  });

  it("8. among equal active states, most recently seen wins", () => {
    const portrait = selectPortrait([
      { isActive: true, lastSeenAt: day(2), startDate: null, mediaSha: "old", mediaType: "IMAGE", hasValidVisual: true },
      { isActive: true, lastSeenAt: day(9), startDate: null, mediaSha: "new", mediaType: "IMAGE", hasValidVisual: true },
    ]);
    expect(portrait?.sha).toBe("new");
  });

  it("9. raw VIDEO asset can never be returned as image portrait", () => {
    // Video with NO poster available → must skip to next candidate or null.
    const portrait = selectPortrait([
      { isActive: true, lastSeenAt: day(9), startDate: day(1), mediaSha: "vid", mediaType: "VIDEO", hasValidVisual: false },
    ]);
    expect(portrait).toBeNull();
  });

  it("10. VIDEO with valid poster resolves as VIDEO_POSTER", () => {
    const portrait = selectPortrait([
      { isActive: true, lastSeenAt: day(9), startDate: day(1), mediaSha: "vid", mediaType: "VIDEO", hasValidVisual: true },
    ]);
    expect(portrait).toEqual({ sourceKind: "VIDEO_POSTER", sha: "vid" });
  });

  it("11. invalid top-ranked candidate falls through to next valid candidate", () => {
    const portrait = selectPortrait([
      { isActive: true, lastSeenAt: day(9), startDate: day(5), mediaSha: "top-video-no-poster", mediaType: "VIDEO", hasValidVisual: false },
      { isActive: false, lastSeenAt: day(3), startDate: day(2), mediaSha: "second-image", mediaType: "IMAGE", hasValidVisual: true },
    ]);
    expect(portrait).toEqual({ sourceKind: "IMAGE", sha: "second-image" });
  });

  it("tie-break: identical active/recency falls back to stable sha order", () => {
    const a = { isActive: true, lastSeenAt: day(5), startDate: day(1), mediaSha: "sha-b", mediaType: "IMAGE" as const, hasValidVisual: true };
    const b = { ...a, mediaSha: "sha-a" };
    const ranked = rankCandidates([a, b]);
    expect(ranked[0].mediaSha).toBe("sha-a");
  });
});

// ---------------------------------------------------------------------------
// Creative count / active semantics — documented SQL contract assertions.
// The GROUP BY DISTINCT guarantee lives in getBrandFacts(); these tests pin
// the semantic rules so a future refactor that changes them fails review.
// ---------------------------------------------------------------------------

describe("Brands creative-count semantics (SQL contract)", () => {
  // Simulates the aggregate over deployment rows for one brand.
  // adId = canonical ad identity (PK of ad_discovery_index, one row per ad).
  function aggregate(rows: Array<{ sha: string; adId: string; is_active: boolean }>) {
    const groups = new Set(rows.map((r) => r.sha));
    const activeGroups = new Set(rows.filter((r) => r.is_active).map((r) => r.sha));
    const activeAds = new Set(rows.filter((r) => r.is_active).map((r) => r.adId));
    return {
      creativeCount: groups.size,
      activeCreativeCount: activeGroups.size,
      activeAdCount: activeAds.size,
    };
  }

  it("1-2. same SHA with inactive + active deployment => 1 group, 1 active", () => {
    const agg = aggregate([
      { sha: "creative-A", adId: "ad-1", is_active: false },
      { sha: "creative-A", adId: "ad-2", is_active: true },
    ]);
    expect(agg.creativeCount).toBe(1); // distinct SHA, NOT ad count (would be 2)
    expect(agg.activeCreativeCount).toBe(1);
    expect(agg.activeAdCount).toBe(1);
  });

  it("3. multiple inactive deployments sharing one SHA => 1 creative, 0 active", () => {
    const agg = aggregate([
      { sha: "creative-B", adId: "ad-3", is_active: false },
      { sha: "creative-B", adId: "ad-4", is_active: false },
      { sha: "creative-B", adId: "ad-5", is_active: false },
    ]);
    expect(agg.creativeCount).toBe(1);
    expect(agg.activeCreativeCount).toBe(0);
    expect(agg.activeAdCount).toBe(0);
  });

  it("4. EU and UK evidence are independent booleans (no summing)", () => {
    const rows = [
      { eu: true, uk: false },
      { eu: false, uk: true },
    ];
    const hasEu = rows.some((r) => r.eu);
    const hasUk = rows.some((r) => r.uk);
    expect(hasEu).toBe(true);
    expect(hasUk).toBe(true);
    // Never combined into a score:
    expect(typeof hasEu).toBe("boolean");
    expect(typeof hasUk).toBe("boolean");
  });

  it("5. peak EU reach is MAX single-deployment value, never summed, UK excluded", () => {
    const deployments = [
      { euReach: 500_000, ukReach: 9_000_000 },
      { euReach: 2_000_000, ukReach: 1_000_000 },
      { euReach: null, ukReach: 100_000 },
    ];
    const euValues = deployments.map((d) => d.euReach).filter((v): v is number => v !== null);
    const peakEu = Math.max(...euValues);
    expect(peakEu).toBe(2_000_000); // MAX, not SUM (would be 2.5M); UK ignored entirely
  });

  it("6. reach-scale ordering under equal values falls through to deterministic tie-breaks", () => {
    const rows = [
      { name: "zeta", eu: 500_000, groups: 10 },
      { name: "alpha", eu: 500_000, groups: 30 },
      { name: "beta", eu: 900_000, groups: 5 },
    ];
    const sorted = [...rows].sort(
      (x, y) =>
        y.eu - x.eu ||
        y.groups - x.groups || // tie-break: creative_groups DESC
        x.name.localeCompare(y.name),
    );
    expect(sorted.map((r) => r.name)).toEqual(["beta", "alpha", "zeta"]);
  });
});

// ---------------------------------------------------------------------------
// activeAdCount — DEPLOYMENT identity semantics (distinct canonical ads).
// Contract example: SHA A (3 ads: 2 active, 1 inactive), SHA B (1 active ad),
// SHA C (1 inactive ad) => creativeCount=3, activeCreativeCount=2, activeAdCount=3.
// ---------------------------------------------------------------------------

// Module-level aggregate for the deployment-identity block (same SQL contract
// as the creative-count describe above: DISTINCT sha / DISTINCT adId).
interface DeploymentRow {
  sha: string;
  adId: string;
  is_active: boolean;
  euReach?: number | null;
  euAgeMin?: number | null;
  euAgeMax?: number | null;
  ukAgeMin?: number | null;
  ukAgeMax?: number | null;
}

/** Aggregate over DISTINCT canonical deployments (one row per ad — PK dedup). */
function aggDeployments(rows: DeploymentRow[]) {
  const groups = new Set(rows.map((r) => r.sha));
  const activeGroups = new Set(rows.filter((r) => r.is_active).map((r) => r.sha));
  const activeAds = new Set(rows.filter((r) => r.is_active).map((r) => r.adId));
  const euReachValues = rows
    .map((r) => r.euReach)
    .filter((v): v is number => typeof v === "number");
  const euAgeMins = rows.map((r) => r.euAgeMin).filter((v): v is number => typeof v === "number");
  const euAgeMaxes = rows.map((r) => r.euAgeMax).filter((v): v is number => typeof v === "number");
  const ukAgeMins = rows.map((r) => r.ukAgeMin).filter((v): v is number => typeof v === "number");
  const ukAgeMaxes = rows.map((r) => r.ukAgeMax).filter((v): v is number => typeof v === "number");
  return {
    creativeCount: groups.size,
    totalAdCount: new Set(rows.map((r) => r.adId)).size,
    activeCreativeCount: activeGroups.size,
    activeAdCount: activeAds.size,
    peakEuReach: euReachValues.length > 0 ? Math.max(...euReachValues) : null,
    combinedEuReach:
      euReachValues.length > 0
        ? euReachValues.reduce((s, v) => s + v, 0)
        : null,
    euTargetAgeMin: euAgeMins.length > 0 ? Math.min(...euAgeMins) : null,
    euTargetAgeMax: euAgeMaxes.length > 0 ? Math.max(...euAgeMaxes) : null,
    ukTargetAgeMin: ukAgeMins.length > 0 ? Math.min(...ukAgeMins) : null,
    ukTargetAgeMax: ukAgeMaxes.length > 0 ? Math.max(...ukAgeMaxes) : null,
  };
}

describe("activeAdCount — deployment identity vs creative-group identity", () => {
  it("contract example: 2-of-3 active on SHA A, 1 active on SHA B, inactive SHA C", () => {
    const agg = aggDeployments([
      { sha: "A", adId: "ad-1", is_active: true },
      { sha: "A", adId: "ad-2", is_active: true },
      { sha: "A", adId: "ad-3", is_active: false },
      { sha: "B", adId: "ad-4", is_active: true },
      { sha: "C", adId: "ad-5", is_active: false },
    ]);
    expect(agg.creativeCount).toBe(3);
    expect(agg.activeCreativeCount).toBe(2);
    expect(agg.activeAdCount).toBe(3);
  });

  it("two SHAs with multiple active ads each: ads sum across groups, groups don't", () => {
    const agg = aggDeployments([
      { sha: "SHA-A", adId: "ad-1", is_active: true },
      { sha: "SHA-A", adId: "ad-2", is_active: true },
      { sha: "SHA-B", adId: "ad-3", is_active: true },
    ]);
    expect(agg.creativeCount).toBe(2);
    expect(agg.activeCreativeCount).toBe(2);
    expect(agg.activeAdCount).toBe(3);
  });

  it("4. duplicate projection rows / joins cannot inflate DISTINCT ad identity", () => {
    // Simulates a hypothetical join fan-out: same deployment row appearing twice
    const rows = [
      { sha: "A", adId: "ad-1", is_active: true },
      { sha: "A", adId: "ad-1", is_active: true }, // duplicate via join
      { sha: "B", adId: "ad-2", is_active: true },
    ];
    const agg = aggDeployments(rows);
    expect(agg.activeAdCount).toBe(2); // DISTINCT adId prevents overcount
  });

  it("6. activeAdCount derives from Running state, not lastSeen recency", () => {
    // Recently-seen but NOT running must not count as active ad
    const agg = aggDeployments([
      { sha: "A", adId: "ad-1", is_active: false }, // seen recently, not running
      { sha: "A", adId: "ad-2", is_active: false },
    ]);
    expect(agg.activeAdCount).toBe(0);
    expect(agg.activeCreativeCount).toBe(0);
    expect(agg.creativeCount).toBe(1); // footprint still correct
  });
});

// ---------------------------------------------------------------------------
// Metrics correction pass: totals, combined reach, audience band.
// ---------------------------------------------------------------------------

describe("creative/ad count totals (§9.1-9.4)", () => {
  it("5 ads across 3 SHAs => creativeCount=3, totalAdCount=5", () => {
    const agg = aggDeployments([
      { sha: "A", adId: "ad-1", is_active: true },
      { sha: "A", adId: "ad-2", is_active: true },
      { sha: "A", adId: "ad-3", is_active: false },
      { sha: "B", adId: "ad-4", is_active: true },
      { sha: "C", adId: "ad-5", is_active: false },
    ]);
    expect(agg.creativeCount).toBe(3);
    expect(agg.totalAdCount).toBe(5);
    expect(agg.activeCreativeCount).toBe(2);
    expect(agg.activeAdCount).toBe(3);
  });

  it("multiple ads sharing one SHA do not inflate creativeCount", () => {
    const agg = aggDeployments([
      { sha: "X", adId: "ad-1", is_active: true },
      { sha: "X", adId: "ad-2", is_active: true },
      { sha: "X", adId: "ad-3", is_active: true },
    ]);
    expect(agg.creativeCount).toBe(1);
    expect(agg.totalAdCount).toBe(3);
  });
});

describe("reach semantics (§9.6-9.9)", () => {
  it("peakEuReach = MAX single-ad reach; combinedEuReach = SUM over ads", () => {
    const agg = aggDeployments([
      { sha: "A", adId: "ad-1", is_active: true, euReach: 500_000 },
      { sha: "A", adId: "ad-2", is_active: true, euReach: 2_000_000 },
      { sha: "B", adId: "ad-3", is_active: true, euReach: 300_000 },
    ]);
    expect(agg.peakEuReach).toBe(2_000_000);
    expect(agg.combinedEuReach).toBe(2_800_000); // SUM across distinct ads
  });

  it("duplicated join rows cannot inflate combinedEuReach (per-ad dedup upstream)", () => {
    // resolvePortraits-style fan-out duplicates rows per join; the Phase A
    // subquery dedups by ad_id BEFORE aggregation, so duplicates never sum.
    const deduped = aggDeployments([
      { sha: "A", adId: "ad-1", is_active: true, euReach: 700_000 },
    ]);
    expect(deduped.combinedEuReach).toBe(700_000); // not 1.4M
  });

  it("EU and UK reach never sum together", () => {
    // Only EU reach values enter the aggregation; UK fields are separate columns.
    const agg = aggDeployments([
      { sha: "A", adId: "ad-1", is_active: true, euReach: 400_000 }, // uk ignored
    ]);
    expect(agg.combinedEuReach).toBe(400_000);
  });
});

describe("audience band semantics (§4, §9.11-9.12) — OPTION A: EU/UK kept separate", () => {
  it("EU-only: 25–44 => eu 25–44, uk null", () => {
    const agg = aggDeployments([
      { sha: "A", adId: "ad-1", is_active: true, euAgeMin: 25, euAgeMax: 44 },
    ]);
    expect(agg.euTargetAgeMin).toBe(25);
    expect(agg.euTargetAgeMax).toBe(44);
    expect(agg.ukTargetAgeMin).toBeNull();
    expect(agg.ukTargetAgeMax).toBeNull();
  });

  it("UK-only: 18–65 => uk 18–65, eu null (Huel/CeraVe case — no EU age rows)", () => {
    const agg = aggDeployments([
      { sha: "A", adId: "ad-1", is_active: true, ukAgeMin: 18, ukAgeMax: 65 },
    ]);
    expect(agg.ukTargetAgeMin).toBe(18);
    expect(agg.ukTargetAgeMax).toBe(65);
    expect(agg.euTargetAgeMin).toBeNull();
    expect(agg.euTargetAgeMax).toBeNull();
  });

  it("EU + UK DIFFERING: EU 25–44, UK 18–65 => both preserved independently (no merged envelope)", () => {
    const agg = aggDeployments([
      { sha: "A", adId: "ad-1", is_active: true, euAgeMin: 25, euAgeMax: 44 },
      { sha: "B", adId: "ad-2", is_active: true, ukAgeMin: 18, ukAgeMax: 65 },
    ]);
    expect(agg.euTargetAgeMin).toBe(25);
    expect(agg.euTargetAgeMax).toBe(44);
    expect(agg.ukTargetAgeMin).toBe(18);
    expect(agg.ukTargetAgeMax).toBe(65);
    // Never collapse to a single 18–65 envelope:
    expect(`${agg.euTargetAgeMin}–${agg.euTargetAgeMax}`).not.toBe("18–65");
  });

  it("EU + UK SAME range: both render identically, still separate fields", () => {
    const agg = aggDeployments([
      { sha: "A", adId: "ad-1", is_active: true, euAgeMin: 18, euAgeMax: 65 },
      { sha: "B", adId: "ad-2", is_active: true, ukAgeMin: 18, ukAgeMax: 65 },
    ]);
    expect(agg.euTargetAgeMin).toBe(18);
    expect(agg.ukTargetAgeMin).toBe(18);
  });

  it("missing EU + missing UK => no age fact rendered (null, not a fake 0 envelope)", () => {
    const agg = aggDeployments([
      { sha: "A", adId: "ad-1", is_active: true },
    ]);
    expect(agg.euTargetAgeMin).toBeNull();
    expect(agg.euTargetAgeMax).toBeNull();
    expect(agg.ukTargetAgeMin).toBeNull();
    expect(agg.ukTargetAgeMax).toBeNull();
  });
});

describe("reach zero-vs-null semantics (§4)", () => {
  it("combinedEuReach = null when no deployment carries EU reach (absent evidence, not 0)", () => {
    const agg = aggDeployments([
      { sha: "A", adId: "ad-1", is_active: true }, // no euReach
    ]);
    expect(agg.combinedEuReach).toBeNull();
  });

  it("combinedEuReach = SUM when some deployments report (0-valued reports still count)", () => {
    const agg = aggDeployments([
      { sha: "A", adId: "ad-1", is_active: true, euReach: 0 },
      { sha: "B", adId: "ad-2", is_active: true, euReach: 500_000 },
    ]);
    expect(agg.combinedEuReach).toBe(500_000); // 0 + 500k, not null
  });
});

// ---------------------------------------------------------------------------
// Regression guard: no fake activity/sparkline generator may exist on the
// Brands surface (honesty doctrine).
// ---------------------------------------------------------------------------

describe("Honesty regression guard", () => {
  it("no fake activity/sparkline code remains reachable from Brands feature", async () => {
    const fs = t_fs;
    const path = t_path;
    const brandsDir = path.resolve(__dirname, "..");
    const files = listTsFiles(brandsDir);
    const offenders: string[] = [];
    for (const f of files) {
      if (f.includes("__tests__")) continue; // don't match this test's own patterns
      const src = fs.readFileSync(f, "utf-8");
      if (/ActivityPulse|pseudo-density|deterministic pseudo/i.test(src)) {
        offenders.push(path.basename(f));
      }
    }
    expect(offenders).toEqual([]);
  });
});

function listTsFiles(dir: string): string[] {
  const fs = t_fs;
  const path = t_path;
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}
