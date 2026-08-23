import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { optimizeImageDerivative, ImageOptimizationError } from "../sharp";
import { BROWSE_IMAGE_V1, DETAIL_IMAGE_V1 } from "../../recipes";

describe("Sharp Image Derivative Optimization Engine", () => {
  // Helper to generate test JPEG
  async function createTestJpeg(width: number, height: number): Promise<Buffer> {
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#d46b38"/>
        <circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 4}" fill="#f3f4f6"/>
        <text x="${width / 2}" y="${height / 2}" font-size="24" text-anchor="middle" fill="#07080a">AdLabs Test</text>
      </svg>
    `;
    return sharp(Buffer.from(svg)).jpeg().toBuffer();
  }

  // Helper to generate transparent PNG
  async function createTransparentPng(width: number, height: number): Promise<Buffer> {
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 4}" fill="#38bdf8" fill-opacity="0.7"/>
      </svg>
    `;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  it("optimizes a large 2000x3000 image to browse-image-v1 (max long edge 768px)", async () => {
    const inputBuf = await createTestJpeg(2000, 3000);
    const result = await optimizeImageDerivative({
      input: inputBuf,
      recipe: BROWSE_IMAGE_V1,
    });

    expect(result.format).toBe("webp");
    expect(result.height).toBe(768);
    expect(result.width).toBe(Math.round(2000 * (768 / 3000)));
    expect(result.byteSize).toBeGreaterThan(0);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.byteSize).toBeLessThan(inputBuf.length);
  });

  it("optimizes a large 3000x2000 landscape image to detail-image-v1 (max long edge 1440px)", async () => {
    const inputBuf = await createTestJpeg(3000, 2000);
    const result = await optimizeImageDerivative({
      input: inputBuf,
      recipe: DETAIL_IMAGE_V1,
    });

    expect(result.format).toBe("webp");
    expect(result.width).toBe(1440);
    expect(result.height).toBe(Math.round(2000 * (1440 / 3000)));
    expect(result.byteSize).toBeGreaterThan(0);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not enlarge smaller images (withoutEnlargement = true)", async () => {
    const inputBuf = await createTestJpeg(400, 500);
    const result = await optimizeImageDerivative({
      input: inputBuf,
      recipe: BROWSE_IMAGE_V1, // max long edge 768
    });

    expect(result.width).toBe(400);
    expect(result.height).toBe(500);
    expect(result.format).toBe("webp");
  });

  it("preserves alpha channel for transparent PNG inputs", async () => {
    const inputBuf = await createTransparentPng(800, 800);
    const result = await optimizeImageDerivative({
      input: inputBuf,
      recipe: BROWSE_IMAGE_V1,
    });

    expect(result.format).toBe("webp");
    const meta = await sharp(result.buffer).metadata();
    expect(meta.hasAlpha).toBe(true);
    expect(meta.channels).toBe(4);
  });

  it("throws ImageOptimizationError on corrupted or empty input buffer", async () => {
    const invalidBuf = Buffer.from("not-an-image-payload");
    await expect(
      optimizeImageDerivative({
        input: invalidBuf,
        recipe: BROWSE_IMAGE_V1,
      }),
    ).rejects.toThrow(ImageOptimizationError);
  });
});
