import { describe, expect, it } from "vitest";
import { checkFfmpegAvailability } from "../engine/detector";

describe("checkFfmpegAvailability", () => {
  it("resolves quickly on the local machine", async () => {
    const start = Date.now();
    const result = await checkFfmpegAvailability();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(10000);
    expect(result).toHaveProperty("ffmpeg");
    expect(result).toHaveProperty("ffprobe");
    expect(typeof result.ffmpeg).toBe("boolean");
    expect(typeof result.ffprobe).toBe("boolean");
  }, 15000);

  it("populates versions when binaries are available", async () => {
    const result = await checkFfmpegAvailability();
    if (result.ffmpeg) {
      expect(result.ffmpegVersion).toContain("ffmpeg");
    }
    if (result.ffprobe) {
      expect(result.ffprobeVersion).toContain("ffprobe");
    }
  });
});
