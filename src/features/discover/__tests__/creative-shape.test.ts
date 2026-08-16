import { describe, expect, it } from "vitest";
import {
  resolveCreativeShape,
  getMediaShellSizeClass,
} from "../utils/creative-shape";

describe("Creative Shape Resolution & Sizing Matrix", () => {
  describe("resolveCreativeShape", () => {
    it("classifies 9:16 portrait video (720x1280) as portrait", () => {
      const res = resolveCreativeShape(720, 1280);
      expect(res.shapeFamily).toBe("portrait");
      expect(res.aspectRatio).toBeCloseTo(0.5625, 4);
      expect(res.aspectRatioCss).toBe("720 / 1280");
      expect(res.hasKnownDimensions).toBe(true);
    });

    it("classifies 3:4 portrait (750x1000) as portrait", () => {
      const res = resolveCreativeShape(750, 1000);
      expect(res.shapeFamily).toBe("portrait");
      expect(res.aspectRatio).toBe(0.75);
    });

    it("classifies 4:5 near-square creative (1080x1350) as square (boundary >= 0.80)", () => {
      const res = resolveCreativeShape(1080, 1350);
      expect(res.shapeFamily).toBe("square");
      expect(res.aspectRatio).toBe(0.8);
      expect(res.aspectRatioCss).toBe("1080 / 1350");
    });

    it("classifies 1:1 square (1080x1080) as square", () => {
      const res = resolveCreativeShape(1080, 1080);
      expect(res.shapeFamily).toBe("square");
      expect(res.aspectRatio).toBe(1);
    });

    it("classifies 16:9 landscape (1920x1080) as landscape", () => {
      const res = resolveCreativeShape(1920, 1080);
      expect(res.shapeFamily).toBe("landscape");
      expect(res.aspectRatio).toBeCloseTo(1.7778, 3);
    });

    it("classifies 21:9 ultrawide (2560x1080) as wide", () => {
      const res = resolveCreativeShape(2560, 1080);
      expect(res.shapeFamily).toBe("wide");
      expect(res.aspectRatio).toBeGreaterThan(1.8);
    });

    it("falls back gracefully on missing, null, zero, or negative dimensions", () => {
      const resNull = resolveCreativeShape(null, null);
      expect(resNull.shapeFamily).toBe("landscape");
      expect(resNull.aspectRatio).toBeCloseTo(1.7778, 3);
      expect(resNull.aspectRatioCss).toBe("16 / 9");
      expect(resNull.hasKnownDimensions).toBe(false);

      const resZero = resolveCreativeShape(0, 500);
      expect(resZero.shapeFamily).toBe("landscape");
      expect(resZero.hasKnownDimensions).toBe(false);

      const resNeg = resolveCreativeShape(720, -1280);
      expect(resNeg.shapeFamily).toBe("landscape");
      expect(resNeg.hasKnownDimensions).toBe(false);
    });
  });

  describe("getMediaShellSizeClass Preferred Width Model", () => {
    it("declares preferred inline width tokens across portrait roles with viewport height safety cap", () => {
      const supporting = getMediaShellSizeClass("supporting", "portrait");
      expect(supporting).toContain("w-[clamp(260px,24vw,330px)]");
      expect(supporting).toContain("max-w-full");
      expect(supporting).toContain("max-h-[min(70vh,720px)]");

      const offset = getMediaShellSizeClass("offset", "portrait");
      expect(offset).toContain("w-[clamp(300px,28vw,380px)]");
      expect(offset).toContain("max-w-full");

      const wide = getMediaShellSizeClass("wide", "portrait");
      expect(wide).toContain("w-[clamp(320px,30vw,410px)]");
      expect(wide).toContain("max-w-full");

      const lead = getMediaShellSizeClass("lead", "portrait");
      expect(lead).toContain("w-[clamp(340px,32vw,440px)]");
      expect(lead).toContain("max-w-full");
    });

    it("declares preferred inline width tokens across square roles", () => {
      const supporting = getMediaShellSizeClass("supporting", "square");
      expect(supporting).toContain("w-[clamp(320px,30vw,420px)]");
      expect(supporting).toContain("max-w-full");

      const offset = getMediaShellSizeClass("offset", "square");
      expect(offset).toContain("w-[clamp(380px,36vw,520px)]");

      const wide = getMediaShellSizeClass("wide", "square");
      expect(wide).toContain("w-[clamp(420px,40vw,600px)]");

      const lead = getMediaShellSizeClass("lead", "square");
      expect(lead).toContain("w-[clamp(460px,44vw,660px)]");
    });

    it("declares preferred inline width tokens across landscape and wide roles", () => {
      const supporting = getMediaShellSizeClass("supporting", "landscape");
      expect(supporting).toContain("w-[clamp(400px,38vw,520px)]");

      const offset = getMediaShellSizeClass("offset", "landscape");
      expect(offset).toContain("w-[clamp(500px,48vw,700px)]");

      const wideRoleLandscape = getMediaShellSizeClass("wide", "landscape");
      expect(wideRoleLandscape).toContain("w-[clamp(620px,58vw,900px)]");

      const leadLandscape = getMediaShellSizeClass("lead", "landscape");
      expect(leadLandscape).toContain("w-[clamp(660px,62vw,980px)]");
      expect(leadLandscape).toContain("max-w-full");

      const wideRoleWideShape = getMediaShellSizeClass("wide", "wide");
      expect(wideRoleWideShape).toContain("w-full max-w-full");
    });
  });
});
