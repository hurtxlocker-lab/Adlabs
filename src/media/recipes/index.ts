import type { VideoRecipeConfig, DisplayImageRecipeConfig } from "../types";

/**
 * Frozen Production Preview Loop Recipe: preview-loop-v1
 *
 * Parameters:
 * - durationMs = 3500 (3.5 seconds)
 * - startOffsetSeconds = 0
 * - targetFps = 30
 * - maxLongEdge = 640
 * - codec = libx264
 * - container = mp4
 * - crf = 24
 * - preset = medium
 * - pixelFormat = yuv420p
 * - stripAudio = true
 * - faststart = true
 * - preserveAspectRatio = true
 * - crop = false
 */
export const PREVIEW_LOOP_V1: VideoRecipeConfig = {
  version: "preview-loop-v1",
  durationSeconds: 3.5,
  startOffsetSeconds: 0,
  targetFps: 30,
  maxLongEdge: 640,
  crf: 24,
  preset: "medium",
  pixelFormat: "yuv420p",
  codec: "libx264",
  container: "mp4",
  stripAudio: true,
  faststart: true,
};

/**
 * Benchmark Video Preview Recipe Matrix (3.5s, 30 fps, H.264/yuv420p, no audio)
 */
export const VIDEO_BENCHMARK_RECIPES: Record<string, VideoRecipeConfig> = {
  "preview-benchmark-640-crf24": {
    version: "preview-benchmark-640-crf24",
    durationSeconds: 3.5,
    startOffsetSeconds: 0,
    targetFps: 30,
    maxLongEdge: 640,
    crf: 24,
    preset: "medium",
    pixelFormat: "yuv420p",
    codec: "libx264",
    container: "mp4",
    stripAudio: true,
    faststart: true,
  },
  "preview-benchmark-640-crf26": {
    version: "preview-benchmark-640-crf26",
    durationSeconds: 3.5,
    startOffsetSeconds: 0,
    targetFps: 30,
    maxLongEdge: 640,
    crf: 26,
    preset: "medium",
    pixelFormat: "yuv420p",
    codec: "libx264",
    container: "mp4",
    stripAudio: true,
    faststart: true,
  },
  "preview-benchmark-540-crf24": {
    version: "preview-benchmark-540-crf24",
    durationSeconds: 3.5,
    startOffsetSeconds: 0,
    targetFps: 30,
    maxLongEdge: 540,
    crf: 24,
    preset: "medium",
    pixelFormat: "yuv420p",
    codec: "libx264",
    container: "mp4",
    stripAudio: true,
    faststart: true,
  },
  "preview-benchmark-540-crf26": {
    version: "preview-benchmark-540-crf26",
    durationSeconds: 3.5,
    startOffsetSeconds: 0,
    targetFps: 30,
    maxLongEdge: 540,
    crf: 26,
    preset: "medium",
    pixelFormat: "yuv420p",
    codec: "libx264",
    container: "mp4",
    stripAudio: true,
    faststart: true,
  },
};

/**
 * Production Browse Image Derivative Recipe: browse-image-v1
 *
 * Parameters:
 * - maxLongEdge = 768
 * - quality = 76
 * - effort = 5
 * - format = webp
 * - fit = inside
 * - withoutEnlargement = true
 * - autoRotate = true
 * - preserveAspectRatio = true
 * - colorSpace = sRGB
 */
export const BROWSE_IMAGE_V1 = {
  version: "browse-image-v1",
  maxLongEdge: 768,
  quality: 76,
  effort: 5,
  format: "webp" as const,
  fit: "inside" as const,
  withoutEnlargement: true,
  autoRotate: true,
};

/**
 * Production Detail Image Derivative Recipe: detail-image-v1
 *
 * Parameters:
 * - maxLongEdge = 1440
 * - quality = 84
 * - effort = 5
 * - format = webp
 * - fit = inside
 * - withoutEnlargement = true
 * - autoRotate = true
 * - preserveAspectRatio = true
 * - colorSpace = sRGB
 */
export const DETAIL_IMAGE_V1 = {
  version: "detail-image-v1",
  maxLongEdge: 1440,
  quality: 84,
  effort: 5,
  format: "webp" as const,
  fit: "inside" as const,
  withoutEnlargement: true,
  autoRotate: true,
};

/**
 * Benchmark Display Image Recipe Matrix (WebP, max 1080 long edge, sRGB)
 */
export const IMAGE_BENCHMARK_RECIPES: Record<string, DisplayImageRecipeConfig> = {
  "display-image-benchmark-q80": {
    version: "display-image-benchmark-q80",
    maxLongEdge: 1080,
    quality: 80,
    format: "webp",
    stripMetadata: true,
  },
  "display-image-benchmark-q85": {
    version: "display-image-benchmark-q85",
    maxLongEdge: 1080,
    quality: 85,
    format: "webp",
    stripMetadata: true,
  },
};

/**
 * Builds the robust FFmpeg scale filter expression that bounds max long edge
 * while guaranteeing even output pixel dimensions for H.264/yuv420p.
 *
 * Examples:
 *   - 720x1280 (9:16) at max 640 -> 360x640
 *   - 1280x720 (16:9) at max 640 -> 640x360
 *   - 1080x1080 (1:1) at max 640 -> 640x640
 *   - 720x900  (4:5)  at max 640 -> 512x640
 */
export function buildFfmpegScaleFilter(maxLongEdge: number): string {
  return `scale='if(gt(iw,ih),min(${maxLongEdge},trunc(iw/2)*2),-2)':'if(gt(iw,ih),-2,min(${maxLongEdge},trunc(ih/2)*2))'`;
}
