import * as crypto from "node:crypto";
import sharp from "sharp";
import type { ImageDerivativeRecipeConfig, OptimizedImageResult } from "../types";

export interface OptimizeImageOptions {
  input: Buffer | Uint8Array | string;
  recipe: ImageDerivativeRecipeConfig;
}

export class ImageOptimizationError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ImageOptimizationError";
  }
}

/**
 * Optimizes an input image buffer or file path into a WebP derivative
 * according to the provided deterministic recipe.
 *
 * Invariants:
 *  1. Auto-rotates image according to EXIF orientation.
 *  2. Preserves natural aspect ratio (no crop, no stretch).
 *  3. Never enlarges smaller source images (withoutEnlargement = true).
 *  4. Bounded to maxLongEdge (fit: inside).
 *  5. Converts cleanly to sRGB color space.
 *  6. Preserves alpha channels for transparent PNG / WebP sources.
 *  7. Strips camera/GPS EXIF metadata for privacy and byte reduction.
 *  8. Deterministic WebP compression (quality + effort).
 */
export async function optimizeImageDerivative(
  options: OptimizeImageOptions,
): Promise<OptimizedImageResult> {
  const { input, recipe } = options;

  try {
    const pipeline = sharp(input, { failOn: "error" });

    // 1. Auto-rotate based on EXIF orientation
    if (recipe.autoRotate) {
      pipeline.rotate();
    }

    // 2. Bound max long edge while preserving aspect ratio and without enlargement
    pipeline.resize({
      width: recipe.maxLongEdge,
      height: recipe.maxLongEdge,
      fit: recipe.fit,
      withoutEnlargement: recipe.withoutEnlargement,
    });

    // 3. Ensure sRGB colorspace for universal browser rendering
    pipeline.toColorspace("srgb");

    // 4. WebP output encoding
    pipeline.webp({
      quality: recipe.quality,
      effort: recipe.effort,
    });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

    if (!data || data.length === 0) {
      throw new ImageOptimizationError("Sharp produced an empty output buffer");
    }

    if (info.width <= 0 || info.height <= 0) {
      throw new ImageOptimizationError(
        `Sharp produced invalid dimensions ${info.width}x${info.height}`,
      );
    }

    const sha256 = crypto.createHash("sha256").update(data).digest("hex").toLowerCase();

    return {
      buffer: data,
      sha256,
      byteSize: data.length,
      width: info.width,
      height: info.height,
      format: "webp",
    };
  } catch (err: unknown) {
    if (err instanceof ImageOptimizationError) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new ImageOptimizationError(`Image optimization failed: ${msg}`, err);
  }
}
