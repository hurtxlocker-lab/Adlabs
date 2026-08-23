/**
 * src/media/types.ts
 *
 * Domain types and interfaces for the AdLabs Media Derivative Subsystem.
 */

export const DERIVATIVE_KINDS = ["PREVIEW_LOOP", "DISPLAY_IMAGE", "POSTER"] as const;
export type DerivativeKind = (typeof DERIVATIVE_KINDS)[number];

export const DERIVATIVE_STATUSES = ["PENDING", "PROCESSING", "READY", "FAILED"] as const;
export type DerivativeStatus = (typeof DERIVATIVE_STATUSES)[number];

export interface PhysicalMediaProbeResult {
  width: number | null;
  height: number | null;
  durationMs: number | null;
  hasAudio: boolean | null;
  fps?: number | null;
  byteSize?: bigint | null;
}

export interface VideoRecipeConfig {
  version: string;
  durationSeconds: number;
  startOffsetSeconds: number;
  targetFps: number;
  maxLongEdge: number;
  crf: number;
  preset: "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow" | "slower" | "veryslow";
  pixelFormat: "yuv420p";
  codec: "libx264";
  container: "mp4";
  stripAudio: boolean;
  faststart: boolean;
}

export interface DisplayImageRecipeConfig {
  version: string;
  maxLongEdge: number;
  quality: number;
  format: "webp" | "jpeg";
  stripMetadata: boolean;
}

export interface ImageDerivativeRecipeConfig {
  version: string;
  maxLongEdge: number;
  quality: number;
  effort: number;
  format: "webp";
  fit: "inside";
  withoutEnlargement: boolean;
  autoRotate: boolean;
}

export interface OptimizedImageResult {
  buffer: Buffer;
  sha256: string;
  byteSize: number;
  width: number;
  height: number;
  format: "webp";
}

export interface BenchmarkOutputMetric {
  sourceMediaAssetId: string;
  sourceDimensions: string;
  sourceDurationSec: number | null;
  sourceByteSize: number;
  candidateRecipe: string;
  outputDimensions: string;
  outputDurationSec: number;
  outputByteSize: number;
  outputFps: number;
  hasAudio: boolean;
  compressionRatioPercent: number;
  encodeDurationMs: number;
  outputPath: string;
}
