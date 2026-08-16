import { describe, expect, it } from "vitest";
import {
  PREVIEW_LOOP_V1,
  VIDEO_BENCHMARK_RECIPES,
  IMAGE_BENCHMARK_RECIPES,
  buildFfmpegScaleFilter,
} from "../recipes";
import { buildFfmpegArgs } from "../engine/ffmpeg";

describe("Media Derivative Recipes", () => {
  describe("Frozen Production Preview Loop (preview-loop-v1)", () => {
    it("has exact frozen production parameters", () => {
      expect(PREVIEW_LOOP_V1.version).toBe("preview-loop-v1");
      expect(PREVIEW_LOOP_V1.durationSeconds).toBe(3.5);
      expect(PREVIEW_LOOP_V1.startOffsetSeconds).toBe(0);
      expect(PREVIEW_LOOP_V1.targetFps).toBe(30);
      expect(PREVIEW_LOOP_V1.maxLongEdge).toBe(640);
      expect(PREVIEW_LOOP_V1.crf).toBe(24);
      expect(PREVIEW_LOOP_V1.preset).toBe("medium");
      expect(PREVIEW_LOOP_V1.codec).toBe("libx264");
      expect(PREVIEW_LOOP_V1.container).toBe("mp4");
      expect(PREVIEW_LOOP_V1.pixelFormat).toBe("yuv420p");
      expect(PREVIEW_LOOP_V1.stripAudio).toBe(true);
      expect(PREVIEW_LOOP_V1.faststart).toBe(true);
    });
  });

  describe("Video Benchmark Recipe Matrix", () => {
    it("configures all benchmark recipes with 3.5s duration, 30 fps, and stripped audio", () => {
      for (const recipe of Object.values(VIDEO_BENCHMARK_RECIPES)) {
        expect(recipe.durationSeconds).toBe(3.5);
        expect(recipe.startOffsetSeconds).toBe(0);
        expect(recipe.targetFps).toBe(30);
        expect(recipe.stripAudio).toBe(true);
        expect(recipe.faststart).toBe(true);
        expect(recipe.codec).toBe("libx264");
        expect(recipe.container).toBe("mp4");
        expect(recipe.pixelFormat).toBe("yuv420p");
        expect([540, 640]).toContain(recipe.maxLongEdge);
        expect([24, 26]).toContain(recipe.crf);
      }
    });

    it("builds correct scale filter expressions bounding max long edge with even dimensions", () => {
      const scale640 = buildFfmpegScaleFilter(640);
      expect(scale640).toContain("min(640,trunc(iw/2)*2)");
      expect(scale640).toContain("min(640,trunc(ih/2)*2)");
      expect(scale640).toContain("-2");

      const scale540 = buildFfmpegScaleFilter(540);
      expect(scale540).toContain("min(540,trunc(iw/2)*2)");
      expect(scale540).toContain("min(540,trunc(ih/2)*2)");
    });

    it("formats safe FFmpeg argument array with all required flags", () => {
      const recipe = VIDEO_BENCHMARK_RECIPES["preview-benchmark-640-crf26"];
      expect(recipe).toBeDefined();

      if (recipe) {
        const args = buildFfmpegArgs("/tmp/in.mp4", "/tmp/out.mp4", recipe);

        expect(args).toContain("-y");
        expect(args).toContain("-ss");
        expect(args).toContain("0");
        expect(args).toContain("-t");
        expect(args).toContain("3.5");
        expect(args).toContain("-r");
        expect(args).toContain("30");
        expect(args).toContain("-c:v");
        expect(args).toContain("libx264");
        expect(args).toContain("-pix_fmt");
        expect(args).toContain("yuv420p");
        expect(args).toContain("-crf");
        expect(args).toContain("26");
        expect(args).toContain("-an");
        expect(args).toContain("-movflags");
        expect(args).toContain("+faststart");
        expect(args).toContain("-map_metadata");
        expect(args).toContain("-1");
        expect(args[args.length - 1]).toBe("/tmp/out.mp4");
      }
    });
  });

  describe("Image Benchmark Recipe Matrix", () => {
    it("defines WebP quality candidates at 80 and 85 with 1080 max long edge", () => {
      const q80 = IMAGE_BENCHMARK_RECIPES["display-image-benchmark-q80"];
      const q85 = IMAGE_BENCHMARK_RECIPES["display-image-benchmark-q85"];

      expect(q80?.quality).toBe(80);
      expect(q80?.maxLongEdge).toBe(1080);
      expect(q80?.format).toBe("webp");
      expect(q80?.stripMetadata).toBe(true);

      expect(q85?.quality).toBe(85);
      expect(q85?.maxLongEdge).toBe(1080);
      expect(q85?.format).toBe("webp");
    });
  });
});
