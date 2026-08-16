import type { CreativeShapeFamily } from "@/features/discover/utils/creative-shape";

export interface BrandCanonicalSummary {
  brandName: string;
  totalAds: number;
  singleCount: number;
  multiVariationCount: number;
}

export interface BrandGeometrySummary {
  brandName: string;
  totalUnits: number;
  portraitCount: number;
  squareCount: number;
  landscapeCount: number;
  wideCount: number;
  unknownCount: number;
}

export interface CorpusAuditTotals {
  totalAds: number;
  uniqueBrands: number;
  singleCount: number;
  multiVariationCount: number;
  totalCreativeUnits: number;
  shapeCounts: Record<CreativeShapeFamily | "unknown", number>;
}

export interface DesignCorpusTargets {
  totalAds: number;
  brands: number;
  portrait: number;
  square: number;
  landscape: number;
  wide: number;
  multiVariation: number;
}

export interface DesignCorpusDeficits {
  totalAds: number;
  brands: number;
  portrait: number;
  square: number;
  landscape: number;
  wide: number;
  multiVariation: number;
}

export interface CorpusAuditResult {
  canonicalBrands: BrandCanonicalSummary[];
  geometryBrands: BrandGeometrySummary[];
  totals: CorpusAuditTotals;
  targets: DesignCorpusTargets;
  deficits: DesignCorpusDeficits;
}

export interface CandidateBrandSampleConfig {
  brand: string;
  url: string;
  limit?: number;
}
