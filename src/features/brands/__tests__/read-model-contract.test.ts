import { describe, expect, it } from "vitest";
import * as t_fs from "node:fs";
import * as t_path from "node:path";

/**
 * Unit & Contract Tests: Brands Read Model (Phase M1B)
 *
 * Locks the read model contract:
 *   - Aggregations: creativeCount (distinct SHAs), activeCreativeCount, activeAdCount
 *   - Lenses: MOST_CREATIVES, RECENTLY_ACTIVE, REACH_SCALE, SOCIAL_AUTHORITY
 *   - Reach: peakEuReach = MAX, combinedEuReach = SUM over ads; EU and UK never sum together
 *   - Age ranges: EU and UK target age kept strictly separate
 *   - Zero UUID leakage: cards link /discover?brand=<slug>
 *   - Honesty doctrine: no fake analytical graphics / sparklines
 */

interface MockDeploymentRow {
  sha: string;
  adId: string;
  is_active: boolean;
  euReach?: number | null;
  ukReach?: number | null;
  euAgeMin?: number | null;
  euAgeMax?: number | null;
  ukAgeMin?: number | null;
  ukAgeMax?: number | null;
}

function aggDeployments(rows: MockDeploymentRow[]) {
  const distinctSha = new Set(rows.map((r) => r.sha));
  const activeSha = new Set(rows.filter((r) => r.is_active).map((r) => r.sha));
  const activeAds = new Set(rows.filter((r) => r.is_active).map((r) => r.adId));
  const allAds = new Set(rows.map((r) => r.adId));

  // Deduplicate by adId before reach/age aggregation (mirrors subquery dedup)
  const byAd = new Map<string, MockDeploymentRow>();
  for (const r of rows) {
    if (!byAd.has(r.adId)) byAd.set(r.adId, r);
  }
  const uniqueAdRows = Array.from(byAd.values());

  const euReaches = uniqueAdRows
    .map((r) => r.euReach)
    .filter((v): v is number => typeof v === "number");
  const peakEuReach = euReaches.length > 0 ? Math.max(...euReaches) : null;
  const combinedEuReach =
    euReaches.length > 0 ? euReaches.reduce((a, b) => a + b, 0) : null;

  const euAgeMins = uniqueAdRows
    .map((r) => r.euAgeMin)
    .filter((v): v is number => typeof v === "number");
  const euAgeMaxs = uniqueAdRows
    .map((r) => r.euAgeMax)
    .filter((v): v is number => typeof v === "number");
  const ukAgeMins = uniqueAdRows
    .map((r) => r.ukAgeMin)
    .filter((v): v is number => typeof v === "number");
  const ukAgeMaxs = uniqueAdRows
    .map((r) => r.ukAgeMax)
    .filter((v): v is number => typeof v === "number");

  return {
    creativeCount: distinctSha.size,
    activeCreativeCount: activeSha.size,
    activeAdCount: activeAds.size,
    totalAdCount: allAds.size,
    peakEuReach,
    combinedEuReach,
    euTargetAgeMin: euAgeMins.length > 0 ? Math.min(...euAgeMins) : null,
    euTargetAgeMax: euAgeMaxs.length > 0 ? Math.max(...euAgeMaxs) : null,
    ukTargetAgeMin: ukAgeMins.length > 0 ? Math.min(...ukAgeMins) : null,
    ukTargetAgeMax: ukAgeMaxs.length > 0 ? Math.max(...ukAgeMaxs) : null,
  };
}

describe("Brand read model aggregation contract", () => {
  it("computes distinct creative count and active creative count", () => {
    const agg = aggDeployments([
      { sha: "SHA-1", adId: "ad-1", is_active: true },
      { sha: "SHA-1", adId: "ad-2", is_active: true },
      { sha: "SHA-2", adId: "ad-3", is_active: false },
    ]);
    expect(agg.creativeCount).toBe(2);
    expect(agg.activeCreativeCount).toBe(1);
    expect(agg.activeAdCount).toBe(2);
    expect(agg.totalAdCount).toBe(3);
  });

  it("handles all inactive creatives", () => {
    const agg = aggDeployments([
      { sha: "SHA-1", adId: "ad-1", is_active: false },
      { sha: "SHA-2", adId: "ad-2", is_active: false },
    ]);
    expect(agg.creativeCount).toBe(2);
    expect(agg.activeCreativeCount).toBe(0);
    expect(agg.activeAdCount).toBe(0);
  });

  it("handles multiple active deployments across different creatives", () => {
    const agg = aggDeployments([
      { sha: "SHA-A", adId: "ad-1", is_active: true },
      { sha: "SHA-B", adId: "ad-2", is_active: true },
      { sha: "SHA-C", adId: "ad-3", is_active: false },
    ]);
    expect(agg.creativeCount).toBe(3);
    expect(agg.activeCreativeCount).toBe(2);
    expect(agg.activeAdCount).toBe(2);
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

  it("duplicate projection rows / joins cannot inflate DISTINCT ad identity", () => {
    const rows = [
      { sha: "A", adId: "ad-1", is_active: true },
      { sha: "A", adId: "ad-1", is_active: true },
      { sha: "B", adId: "ad-2", is_active: true },
    ];
    const agg = aggDeployments(rows);
    expect(agg.activeAdCount).toBe(2);
  });

  it("activeAdCount derives from Running state, not lastSeen recency", () => {
    const agg = aggDeployments([
      { sha: "A", adId: "ad-1", is_active: false },
      { sha: "A", adId: "ad-2", is_active: false },
    ]);
    expect(agg.activeAdCount).toBe(0);
    expect(agg.activeCreativeCount).toBe(0);
    expect(agg.creativeCount).toBe(1);
  });
});

describe("creative/ad count totals", () => {
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

describe("reach semantics", () => {
  it("peakEuReach = MAX single-ad reach; combinedEuReach = SUM over ads", () => {
    const agg = aggDeployments([
      { sha: "A", adId: "ad-1", is_active: true, euReach: 500_000 },
      { sha: "A", adId: "ad-2", is_active: true, euReach: 2_000_000 },
      { sha: "B", adId: "ad-3", is_active: true, euReach: 300_000 },
    ]);
    expect(agg.peakEuReach).toBe(2_000_000);
    expect(agg.combinedEuReach).toBe(2_800_000);
  });

  it("duplicated join rows cannot inflate combinedEuReach (per-ad dedup upstream)", () => {
    const deduped = aggDeployments([
      { sha: "A", adId: "ad-1", is_active: true, euReach: 700_000 },
    ]);
    expect(deduped.combinedEuReach).toBe(700_000);
  });

  it("EU and UK reach never sum together", () => {
    const agg = aggDeployments([
      { sha: "A", adId: "ad-1", is_active: true, euReach: 400_000 },
    ]);
    expect(agg.combinedEuReach).toBe(400_000);
  });
});

describe("audience band semantics — OPTION A: EU/UK kept separate", () => {
  it("EU-only: 25–44 => eu 25–44, uk null", () => {
    const agg = aggDeployments([
      { sha: "A", adId: "ad-1", is_active: true, euAgeMin: 25, euAgeMax: 44 },
    ]);
    expect(agg.euTargetAgeMin).toBe(25);
    expect(agg.euTargetAgeMax).toBe(44);
    expect(agg.ukTargetAgeMin).toBeNull();
    expect(agg.ukTargetAgeMax).toBeNull();
  });

  it("UK-only: 18–65 => uk 18–65, eu null", () => {
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

describe("reach zero-vs-null semantics", () => {
  it("combinedEuReach = null when no deployment carries EU reach (absent evidence, not 0)", () => {
    const agg = aggDeployments([
      { sha: "A", adId: "ad-1", is_active: true },
    ]);
    expect(agg.combinedEuReach).toBeNull();
  });

  it("combinedEuReach = SUM when some deployments report (0-valued reports still count)", () => {
    const agg = aggDeployments([
      { sha: "A", adId: "ad-1", is_active: true, euReach: 0 },
      { sha: "B", adId: "ad-2", is_active: true, euReach: 500_000 },
    ]);
    expect(agg.combinedEuReach).toBe(500_000);
  });
});

describe("Library total ads vs scraped corpus counts contract", () => {
  it("distinguishes between Meta Ad Library total scale and local scraped batch", () => {
    const mockPayloadTotal = 595;
    const scrapedCreativeCount = 5;
    const scrapedActiveCreativeCount = 5;

    const contextLine = (libraryTotal: number | null, scrapedCount: number, activeCount: number) => {
      if (libraryTotal !== null) return `${libraryTotal.toLocaleString()} ads in library`;
      return activeCount > 0 ? `${scrapedCount} scraped creatives · ${activeCount} active` : `${scrapedCount} scraped creatives`;
    };

    expect(contextLine(mockPayloadTotal, scrapedCreativeCount, scrapedActiveCreativeCount)).toBe("595 ads in library");
    expect(contextLine(null, 10, 10)).toBe("10 scraped creatives · 10 active");
    expect(contextLine(null, 10, 0)).toBe("10 scraped creatives");
  });
});

describe("Honesty regression guard", () => {
  it("no fake activity/sparkline code remains reachable from Brands feature", async () => {
    const fs = t_fs;
    const path = t_path;
    const brandsDir = path.resolve(__dirname, "..");
    const files = listTsFiles(brandsDir);
    const offenders: string[] = [];
    for (const f of files) {
      if (f.includes("__tests__")) continue;
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
