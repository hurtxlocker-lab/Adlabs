import type { AdLibraryItem } from "@/features/ad-library/types";
import { getPrimaryMedia } from "@/features/ad-library/utils";
import type {
  BrandCanonicalSummary,
  BrandGeometrySummary,
  CorpusAuditResult,
  CorpusAuditTotals,
  DesignCorpusDeficits,
  DesignCorpusTargets,
} from "./types";

/**
 * Directional targets for the Design Stress Corpus (~30 ads).
 */
export const DEFAULT_DESIGN_CORPUS_TARGETS: DesignCorpusTargets = {
  totalAds: 30,
  brands: 7,
  portrait: 11,
  square: 6,
  landscape: 6,
  wide: 2,
  multiVariation: 5,
};

/**
 * Resolves truthful physical shape family from width and height.
 * If width or height is null/undefined, returns "unknown" rather than defaulting.
 */
export function resolvePhysicalShape(
  width?: number | null,
  height?: number | null,
): "portrait" | "square" | "landscape" | "wide" | "unknown" {
  if (width == null || height == null || width <= 0 || height <= 0) {
    return "unknown";
  }

  const ratio = width / height;
  if (ratio < 0.8) return "portrait";
  if (ratio <= 1.2) return "square";
  if (ratio <= 1.8) return "landscape";
  return "wide";
}

/**
 * Pure audit calculation across an AdLibraryItem corpus.
 */
export function computeCorpusAudit(
  items: readonly AdLibraryItem[],
  targets: DesignCorpusTargets = DEFAULT_DESIGN_CORPUS_TARGETS,
): CorpusAuditResult {
  const canonicalMap = new Map<string, BrandCanonicalSummary>();
  const geometryMap = new Map<string, BrandGeometrySummary>();

  const totals: CorpusAuditTotals = {
    totalAds: items.length,
    uniqueBrands: 0,
    singleCount: 0,
    multiVariationCount: 0,
    totalCreativeUnits: 0,
    shapeCounts: {
      portrait: 0,
      square: 0,
      landscape: 0,
      wide: 0,
      unknown: 0,
    },
  };

  for (const item of items) {
    const brandName = item.brand.name || "Unknown Brand";
    const variations = item.variations ?? [];
    const isMultiVariation = variations.length > 1;

    // 1. Canonical Inventory Accounting
    let canonical = canonicalMap.get(brandName);
    if (!canonical) {
      canonical = {
        brandName,
        totalAds: 0,
        singleCount: 0,
        multiVariationCount: 0,
      };
      canonicalMap.set(brandName, canonical);
    }
    canonical.totalAds += 1;

    if (isMultiVariation) {
      canonical.multiVariationCount += 1;
      totals.multiVariationCount += 1;
    } else {
      canonical.singleCount += 1;
      totals.singleCount += 1;
    }

    // 2. Creative Geometry Inventory Accounting
    let geom = geometryMap.get(brandName);
    if (!geom) {
      geom = {
        brandName,
        totalUnits: 0,
        portraitCount: 0,
        squareCount: 0,
        landscapeCount: 0,
        wideCount: 0,
        unknownCount: 0,
      };
      geometryMap.set(brandName, geom);
    }

    if (isMultiVariation) {
      // For multi-variation ads, count each variation's actual primary media
      for (const variation of variations) {
        geom.totalUnits += 1;
        totals.totalCreativeUnits += 1;

        const primaryVideo = variation.media.find((m) => m.mediaType === "VIDEO");
        const media = primaryVideo ?? variation.media[0];
        const shape = resolvePhysicalShape(media?.width, media?.height);

        if (shape === "portrait") geom.portraitCount += 1;
        else if (shape === "square") geom.squareCount += 1;
        else if (shape === "landscape") geom.landscapeCount += 1;
        else if (shape === "wide") geom.wideCount += 1;
        else geom.unknownCount += 1;

        totals.shapeCounts[shape] += 1;
      }
    } else {
      // For single-creative ads, count the single primary media
      geom.totalUnits += 1;
      totals.totalCreativeUnits += 1;

      const primary = getPrimaryMedia(item);
      const media = primary.video ?? primary.displayMedia ?? item.media[0];
      const shape = resolvePhysicalShape(media?.width, media?.height);

      if (shape === "portrait") geom.portraitCount += 1;
      else if (shape === "square") geom.squareCount += 1;
      else if (shape === "landscape") geom.landscapeCount += 1;
      else if (shape === "wide") geom.wideCount += 1;
      else geom.unknownCount += 1;

      totals.shapeCounts[shape] += 1;
    }
  }

  // Sort alphabetically
  const canonicalBrands = Array.from(canonicalMap.values()).sort((a, b) =>
    a.brandName.localeCompare(b.brandName),
  );
  const geometryBrands = Array.from(geometryMap.values()).sort((a, b) =>
    a.brandName.localeCompare(b.brandName),
  );

  totals.uniqueBrands = canonicalBrands.length;

  const deficits: DesignCorpusDeficits = {
    totalAds: Math.max(0, targets.totalAds - totals.totalAds),
    brands: Math.max(0, targets.brands - totals.uniqueBrands),
    portrait: Math.max(0, targets.portrait - totals.shapeCounts.portrait),
    square: Math.max(0, targets.square - totals.shapeCounts.square),
    landscape: Math.max(0, targets.landscape - totals.shapeCounts.landscape),
    wide: Math.max(0, targets.wide - totals.shapeCounts.wide),
    multiVariation: Math.max(0, targets.multiVariation - totals.multiVariationCount),
  };

  return {
    canonicalBrands,
    geometryBrands,
    totals,
    targets,
    deficits,
  };
}

/**
 * Formats the audit result into a clean ASCII table representation with separate
 * canonical and creative geometry inventories.
 */
export function formatCorpusAuditTable(result: CorpusAuditResult): string {
  const lines: string[] = [];

  lines.push("=========================================================================================================");
  lines.push("ADLABS DEV CORPUS INVENTORY & GEOMETRY AUDIT");
  lines.push("=========================================================================================================");
  lines.push("\n--- 1. CANONICAL ADS INVENTORY ---");
  lines.push("Brand                     | Canonical Ads | Single Creative | Multi-Variation (DCO)");
  lines.push("---------------------------------------------------------------------------------------------------------");

  for (const b of result.canonicalBrands) {
    const name = b.brandName.padEnd(25);
    const total = String(b.totalAds).padStart(14);
    const single = String(b.singleCount).padStart(15);
    const multi = String(b.multiVariationCount).padStart(22);
    lines.push(`${name} | ${total} | ${single} | ${multi}`);
  }

  lines.push("---------------------------------------------------------------------------------------------------------");
  const totName = `TOTAL (${result.totals.uniqueBrands} brands)`.padEnd(25);
  const totTotal = String(result.totals.totalAds).padStart(14);
  const totSingle = String(result.totals.singleCount).padStart(15);
  const totMulti = String(result.totals.multiVariationCount).padStart(22);
  lines.push(`${totName} | ${totTotal} | ${totSingle} | ${totMulti}`);

  lines.push("\n--- 2. CREATIVE GEOMETRY INVENTORY (Variation & Media Level) ---");
  lines.push(
    "Brand                     | Total Units | Portrait (9:16) | Square (4:5 / 1:1) | Landscape (16:9) | Wide (>1.8) | Unknown",
  );
  lines.push("---------------------------------------------------------------------------------------------------------");

  for (const g of result.geometryBrands) {
    const name = g.brandName.padEnd(25);
    const total = String(g.totalUnits).padStart(11);
    const port = String(g.portraitCount).padStart(15);
    const sq = String(g.squareCount).padStart(18);
    const land = String(g.landscapeCount).padStart(16);
    const wide = String(g.wideCount).padStart(11);
    const unk = String(g.unknownCount).padStart(7);
    lines.push(
      `${name} | ${total} | ${port} | ${sq} | ${land} | ${wide} | ${unk}`,
    );
  }

  lines.push("---------------------------------------------------------------------------------------------------------");
  const geomTotName = `TOTAL CREATIVE UNITS`.padEnd(25);
  const geomTotUnits = String(result.totals.totalCreativeUnits).padStart(11);
  const geomTotPort = String(result.totals.shapeCounts.portrait).padStart(15);
  const geomTotSq = String(result.totals.shapeCounts.square).padStart(18);
  const geomTotLand = String(result.totals.shapeCounts.landscape).padStart(16);
  const geomTotWide = String(result.totals.shapeCounts.wide).padStart(11);
  const geomTotUnk = String(result.totals.shapeCounts.unknown).padStart(7);
  lines.push(
    `${geomTotName} | ${geomTotUnits} | ${geomTotPort} | ${geomTotSq} | ${geomTotLand} | ${geomTotWide} | ${geomTotUnk}`,
  );
  lines.push("=========================================================================================================\n");

  lines.push("--- DESIGN STRESS CORPUS TARGETS vs CURRENT ---");
  lines.push(
    `  Canonical Ads:     ${String(result.totals.totalAds).padStart(2)} / ${result.targets.totalAds}  (Deficit: +${result.deficits.totalAds})`,
  );
  lines.push(
    `  Unique Brands:     ${String(result.totals.uniqueBrands).padStart(2)} / ${result.targets.brands}   (Deficit: +${result.deficits.brands})`,
  );
  lines.push(
    `  Multi-Variation:   ${String(result.totals.multiVariationCount).padStart(2)} / ${result.targets.multiVariation}   (Deficit: +${result.deficits.multiVariation})`,
  );
  lines.push(
    `  Portrait (9:16):   ${String(result.totals.shapeCounts.portrait).padStart(2)} / ${result.targets.portrait}  (Deficit: +${result.deficits.portrait})`,
  );
  lines.push(
    `  Square (4:5 / 1:1): ${String(result.totals.shapeCounts.square).padStart(2)} / ${result.targets.square}   (Deficit: +${result.deficits.square})`,
  );
  lines.push(
    `  Landscape (16:9):  ${String(result.totals.shapeCounts.landscape).padStart(2)} / ${result.targets.landscape}   (Deficit: +${result.deficits.landscape})`,
  );
  lines.push(
    `  Wide (>1.8):       ${String(result.totals.shapeCounts.wide).padStart(2)} / ${result.targets.wide}   (Deficit: +${result.deficits.wide})`,
  );
  if (result.totals.shapeCounts.unknown > 0) {
    lines.push(
      `  Unknown Geometry:  ${String(result.totals.shapeCounts.unknown).padStart(2)} (awaiting physical probe)`,
    );
  }

  const deficitTokens: string[] = [];
  if (result.deficits.square > 0) deficitTokens.push(`square +${result.deficits.square}`);
  if (result.deficits.wide > 0) deficitTokens.push(`wide +${result.deficits.wide}`);
  if (result.deficits.portrait > 0) deficitTokens.push(`portrait +${result.deficits.portrait}`);
  if (result.deficits.landscape > 0) deficitTokens.push(`landscape +${result.deficits.landscape}`);
  if (result.deficits.multiVariation > 0) deficitTokens.push(`multi-var +${result.deficits.multiVariation}`);

  lines.push("");
  lines.push(
    `  Deficit Summary:   ${deficitTokens.length > 0 ? `Need: ${deficitTokens.join(", ")}` : "All targets satisfied!"}`,
  );
  lines.push("");

  return lines.join("\n");
}
