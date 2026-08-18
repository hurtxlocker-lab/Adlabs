export interface RangeBandDefinition<K extends string = string> {
  key: K;
  label: string;
  min: bigint | number;
  max: bigint | number | null; // null = infinity (half-open [min, max) or [min, inf))
}

export const EU_REACH_BANDS: RangeBandDefinition[] = [
  { key: "LT_1K", label: "< 1K", min: BigInt(0), max: BigInt(1000) },
  { key: "1K_10K", label: "1K–10K", min: BigInt(1000), max: BigInt(10000) },
  { key: "10K_50K", label: "10K–50K", min: BigInt(10000), max: BigInt(50000) },
  { key: "50K_100K", label: "50K–100K", min: BigInt(50000), max: BigInt(100000) },
  { key: "100K_PLUS", label: "100K+", min: BigInt(100000), max: null },
];

export const CREATIVE_REUSE_BANDS: RangeBandDefinition[] = [
  { key: "1", label: "1", min: 1, max: 2 },
  { key: "2_3", label: "2–3", min: 2, max: 4 },
  { key: "4_10", label: "4–10", min: 4, max: 11 },
  { key: "11_PLUS", label: "11+", min: 11, max: null },
];

export const INSTAGRAM_FOLLOWER_BANDS: RangeBandDefinition[] = [
  { key: "LT_10K", label: "< 10K", min: BigInt(0), max: BigInt(10000) },
  { key: "10K_50K", label: "10K–50K", min: BigInt(10000), max: BigInt(50000) },
  { key: "50K_100K", label: "50K–100K", min: BigInt(50000), max: BigInt(100000) },
  { key: "100K_500K", label: "100K–500K", min: BigInt(100000), max: BigInt(500000) },
  { key: "500K_PLUS", label: "500K+", min: BigInt(500000), max: null },
];
