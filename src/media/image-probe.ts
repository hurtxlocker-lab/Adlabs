/**
 * Pure, high-performance binary buffer parser for extracting physical image
 * dimensions (width, height, format) without external image processing binaries.
 *
 * Supported formats:
 *  - JPEG / JFIF / EXIF
 *  - PNG
 *  - WebP (VP8, VP8L, VP8X)
 *  - GIF
 */

export interface ImageProbeResult {
  width: number;
  height: number;
  format: "jpeg" | "png" | "webp" | "gif";
}

/**
 * Probes a raw Buffer or Uint8Array to extract physical image dimensions.
 * Returns null if the format is unsupported or dimensions cannot be parsed.
 */
export function probeImageBuffer(buffer: Buffer | Uint8Array): ImageProbeResult | null {
  if (!buffer || buffer.length < 12) {
    return null;
  }

  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  // 1. PNG check (8-byte signature: 0x89 50 4E 47 0D 0A 1A 0A)
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    if (buf.length >= 24) {
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      if (width > 0 && height > 0) {
        return { width, height, format: "png" };
      }
    }
    return null;
  }

  // 2. GIF check (GIF87a or GIF89a)
  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  ) {
    if (buf.length >= 10) {
      const width = buf.readUInt16LE(6);
      const height = buf.readUInt16LE(8);
      if (width > 0 && height > 0) {
        return { width, height, format: "gif" };
      }
    }
    return null;
  }

  // 3. WebP check (RIFF....WEBP)
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    if (buf.length >= 16) {
      const chunkType = buf.toString("ascii", 12, 16);

      // VP8 Lossy
      if (chunkType === "VP8 " && buf.length >= 30) {
        if (buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
          const width = buf.readUInt16LE(26) & 0x3fff;
          const height = buf.readUInt16LE(28) & 0x3fff;
          if (width > 0 && height > 0) {
            return { width, height, format: "webp" };
          }
        }
      }

      // VP8L Lossless
      if (chunkType === "VP8L" && buf.length >= 25) {
        if (buf[20] === 0x2f) {
          const b1 = buf[21];
          const b2 = buf[22];
          const b3 = buf[23];
          const b4 = buf[24];
          const width = 1 + (((b2 & 0x3f) << 8) | b1);
          const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
          if (width > 0 && height > 0) {
            return { width, height, format: "webp" };
          }
        }
      }

      // VP8X Extended
      if (chunkType === "VP8X" && buf.length >= 30) {
        const width = 1 + buf.readUIntLE(24, 3);
        const height = 1 + buf.readUIntLE(27, 3);
        if (width > 0 && height > 0) {
          return { width, height, format: "webp" };
        }
      }
    }
    return null;
  }

  // 4. JPEG check (0xFF 0xD8 0xFF)
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset < buf.length - 1) {
      if (buf[offset] !== 0xff) {
        offset++;
        continue;
      }

      const marker = buf[offset + 1];

      // Skip fill bytes (0xFF)
      if (marker === 0xff || marker === 0x00) {
        offset++;
        continue;
      }

      // Start of scan (SOS) or End of image (EOI) -> Stop scanning headers
      if (marker === 0xda || marker === 0xd9) {
        break;
      }

      // Standalone markers with no payload length
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }

      if (offset + 4 > buf.length) {
        break;
      }

      const length = buf.readUInt16BE(offset + 2);
      if (length < 2) {
        break;
      }

      // SOF markers (Start Of Frame)
      // SOF0 (Baseline), SOF1 (Extended sequential), SOF2 (Progressive), SOF3 (Lossless),
      // SOF5..SOF7 (Differential), SOF9..SOF11 (Extended arithmetic), SOF13..SOF15 (Differential arithmetic)
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);

      if (isSof && offset + 9 <= buf.length) {
        const height = buf.readUInt16BE(offset + 5);
        const width = buf.readUInt16BE(offset + 7);
        if (width > 0 && height > 0) {
          return { width, height, format: "jpeg" };
        }
      }

      offset += 2 + length;
    }
  }

  return null;
}
