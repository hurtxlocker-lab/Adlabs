import { describe, expect, it } from "vitest";
import { probeImageBuffer } from "../image-probe";

describe("Image Probe Parser", () => {
  it("probes valid PNG header", () => {
    const png = Buffer.alloc(32);
    // PNG signature
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    // IHDR length (13) + "IHDR"
    png.writeUInt32BE(13, 8);
    png.write("IHDR", 12);
    // Width (1080) and Height (1920)
    png.writeUInt32BE(1080, 16);
    png.writeUInt32BE(1920, 20);

    const result = probeImageBuffer(png);
    expect(result).toEqual({ width: 1080, height: 1920, format: "png" });
  });

  it("probes valid GIF header", () => {
    const gif = Buffer.alloc(16);
    gif.write("GIF89a", 0);
    gif.writeUInt16LE(640, 6);
    gif.writeUInt16LE(480, 8);

    const result = probeImageBuffer(gif);
    expect(result).toEqual({ width: 640, height: 480, format: "gif" });
  });

  it("probes valid WebP VP8 Lossy header", () => {
    const webp = Buffer.alloc(32);
    webp.write("RIFF", 0);
    webp.writeUInt32LE(24, 4);
    webp.write("WEBP", 8);
    webp.write("VP8 ", 12);
    webp.writeUInt32LE(12, 16);
    webp.set([0x9d, 0x01, 0x2a], 23);
    webp.writeUInt16LE(800, 26);
    webp.writeUInt16LE(600, 28);

    const result = probeImageBuffer(webp);
    expect(result).toEqual({ width: 800, height: 600, format: "webp" });
  });

  it("probes valid WebP VP8X Extended header", () => {
    const webp = Buffer.alloc(32);
    webp.write("RIFF", 0);
    webp.writeUInt32LE(24, 4);
    webp.write("WEBP", 8);
    webp.write("VP8X", 12);
    webp.writeUInt32LE(10, 16);
    // 24-bit width - 1 (1919 for 1920), 24-bit height - 1 (1079 for 1080)
    webp.writeUIntLE(1919, 24, 3);
    webp.writeUIntLE(1079, 27, 3);

    const result = probeImageBuffer(webp);
    expect(result).toEqual({ width: 1920, height: 1080, format: "webp" });
  });

  it("probes valid JPEG SOF0 header", () => {
    const jpeg = Buffer.alloc(32);
    // SOI
    jpeg.set([0xff, 0xd8], 0);
    // SOF0 (0xFF 0xC0)
    jpeg.set([0xff, 0xc0], 2);
    jpeg.writeUInt16BE(17, 4); // Length
    jpeg.set([0x08], 6); // Precision (8 bits)
    jpeg.writeUInt16BE(1080, 7); // Height
    jpeg.writeUInt16BE(1080, 9); // Width

    const result = probeImageBuffer(jpeg);
    expect(result).toEqual({ width: 1080, height: 1080, format: "jpeg" });
  });

  it("returns null for non-image or corrupted buffers", () => {
    expect(probeImageBuffer(Buffer.from("Hello world"))).toBeNull();
    expect(probeImageBuffer(Buffer.alloc(0))).toBeNull();
    expect(probeImageBuffer(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});
