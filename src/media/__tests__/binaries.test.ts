import { describe, expect, it } from "vitest";
import * as path from "node:path";
import { resolveFfmpegPath, resolveFfprobePath } from "../engine/binaries";

describe("Binary Path Resolver", () => {
  it("prioritizes FFMPEG_PATH environment variable if it exists on disk", () => {
    const resolved = resolveFfmpegPath(true, {
      env: { FFMPEG_PATH: "/custom/path/custom-ffmpeg.exe" },
      fileExists: (p) => p === "/custom/path/custom-ffmpeg.exe",
    });
    expect(resolved).toBe("/custom/path/custom-ffmpeg.exe");
  });

  it("prioritizes FFPROBE_PATH environment variable if it exists on disk", () => {
    const resolved = resolveFfprobePath(true, {
      env: { FFPROBE_PATH: "/custom/path/custom-ffprobe.exe" },
      fileExists: (p) => p === "/custom/path/custom-ffprobe.exe",
    });
    expect(resolved).toBe("/custom/path/custom-ffprobe.exe");
  });

  it("resolves from PATH directories when available", () => {
    const resolved = resolveFfmpegPath(true, {
      env: { PATH: ["/usr/local/bin", "/usr/bin"].join(path.delimiter) },
      fileExists: (p) => p.includes("usr") && p.includes("ffmpeg"),
      platform: "linux",
    });
    expect(resolved).toContain("ffmpeg");
  });

  it("resolves real ffmpeg and ffprobe on the current machine without throwing", () => {
    const ffmpeg = resolveFfmpegPath(true);
    const ffprobe = resolveFfprobePath(true);

    expect(ffmpeg).toBeTruthy();
    expect(ffprobe).toBeTruthy();
    expect(ffmpeg.toLowerCase()).toContain("ffmpeg");
    expect(ffprobe.toLowerCase()).toContain("ffprobe");
  });

  it("throws an actionable error when ffmpeg is missing", () => {
    expect(() =>
      resolveFfmpegPath(true, {
        env: { PATH: "" },
        fileExists: () => false,
        platform: "linux",
      }),
    ).toThrow(
      /ffmpeg executable not found\. Add ffmpeg to PATH or configure the FFMPEG_PATH environment variable\./,
    );
  });

  it("throws an actionable error when ffprobe is missing", () => {
    expect(() =>
      resolveFfprobePath(true, {
        env: { PATH: "" },
        fileExists: () => false,
        platform: "linux",
      }),
    ).toThrow(
      /ffprobe executable not found\. Add ffprobe to PATH or configure the FFPROBE_PATH environment variable\./,
    );
  });
});
