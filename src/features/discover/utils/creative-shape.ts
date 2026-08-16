import type { DiscoverLayoutRole } from "./cluster-rhythm";

export type CreativeShapeFamily = "portrait" | "square" | "landscape" | "wide";

export interface CreativeShapeInfo {
  shapeFamily: CreativeShapeFamily;
  aspectRatio: number;
  aspectRatioCss: string;
  hasKnownDimensions: boolean;
}

/**
 * Derives presentation shape family and aspect ratio from server-persisted physical dimensions.
 *
 * Rules & Thresholds:
 * - portrait:  aspectRatio < 0.80          (e.g. 9:16 = 0.5625, 3:4 = 0.75)
 * - square:    0.80 <= aspectRatio <= 1.20 (e.g. 4:5 = 0.80, 1:1 = 1.0)
 * - landscape: 1.20 < aspectRatio <= 1.80  (e.g. 4:3 = 1.333, 16:9 = 1.778)
 * - wide:      aspectRatio > 1.80          (e.g. 21:9 = 2.333)
 *
 * Fallback:
 * When dimensions are missing or invalid, returns conservative 16:9 landscape.
 */
export function resolveCreativeShape(
  width?: number | null,
  height?: number | null,
): CreativeShapeInfo {
  if (!width || !height || width <= 0 || height <= 0) {
    return {
      shapeFamily: "landscape",
      aspectRatio: 16 / 9,
      aspectRatioCss: "16 / 9",
      hasKnownDimensions: false,
    };
  }

  const ratio = width / height;

  let shapeFamily: CreativeShapeFamily;
  if (ratio < 0.8) {
    shapeFamily = "portrait";
  } else if (ratio <= 1.2) {
    shapeFamily = "square";
  } else if (ratio <= 1.8) {
    shapeFamily = "landscape";
  } else {
    shapeFamily = "wide";
  }

  return {
    shapeFamily,
    aspectRatio: ratio,
    aspectRatioCss: `${width} / ${height}`,
    hasKnownDimensions: true,
  };
}

/**
 * Returns the CSS class string for MediaShell sizing based on layout role and creative shape family.
 *
 * Preferred Width Doctrine:
 * - Declares preferred inline width via `w-[clamp(...)] max-w-full` so absolute-positioned media children
 *   do not cause the shell to collapse inside shrink-wrapping / flex containers.
 * - Height follows automatically from source `aspect-ratio: width / height`.
 * - Sizing respects viewport safety cap (max-h-[min(70vh,720px)]) so portrait cards never become skyscrapers.
 * - Width shrinks proportionally if max-height constrains the shell, with zero cropping.
 */
export function getMediaShellSizeClass(
  role: DiscoverLayoutRole,
  shapeFamily: CreativeShapeFamily,
): string {
  // Common viewport height safety cap for all normal media shells
  const heightCap = "max-h-[min(70vh,720px)]";

  switch (shapeFamily) {
    case "portrait":
      switch (role) {
        case "supporting":
          return `w-[clamp(260px,24vw,330px)] max-w-full ${heightCap}`;
        case "offset":
          return `w-[clamp(300px,28vw,380px)] max-w-full ${heightCap}`;
        case "wide":
          return `w-[clamp(320px,30vw,410px)] max-w-full ${heightCap}`;
        case "lead":
          return `w-[clamp(340px,32vw,440px)] max-w-full ${heightCap}`;
      }
      break;

    case "square":
      switch (role) {
        case "supporting":
          return `w-[clamp(320px,30vw,420px)] max-w-full ${heightCap}`;
        case "offset":
          return `w-[clamp(380px,36vw,520px)] max-w-full ${heightCap}`;
        case "wide":
          return `w-[clamp(420px,40vw,600px)] max-w-full ${heightCap}`;
        case "lead":
          return `w-[clamp(460px,44vw,660px)] max-w-full ${heightCap}`;
      }
      break;

    case "landscape":
      switch (role) {
        case "supporting":
          return `w-[clamp(400px,38vw,520px)] max-w-full ${heightCap}`;
        case "offset":
          return `w-[clamp(500px,48vw,700px)] max-w-full ${heightCap}`;
        case "wide":
          return `w-[clamp(620px,58vw,900px)] max-w-full ${heightCap}`;
        case "lead":
          return `w-[clamp(660px,62vw,980px)] max-w-full ${heightCap}`;
      }
      break;

    case "wide":
      return `w-full max-w-full ${heightCap}`;
  }
}
