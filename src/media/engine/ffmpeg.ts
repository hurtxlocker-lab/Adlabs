import { executeSubprocess } from "./subprocess";
import { buildFfmpegScaleFilter } from "../recipes";
import type { VideoRecipeConfig } from "../types";

export interface EncodeVideoDerivativeOptions {
  inputPath: string;
  outputPath: string;
  recipe: VideoRecipeConfig;
  timeoutMs?: number;
}

/**
 * Builds the exact FFmpeg argument array for a video derivative recipe.
 */
export function buildFfmpegArgs(
  inputPath: string,
  outputPath: string,
  recipe: VideoRecipeConfig,
): string[] {
  const args: string[] = [
    "-y", // Overwrite output if present in temp dir
    "-ss",
    recipe.startOffsetSeconds.toString(),
    "-t",
    recipe.durationSeconds.toString(),
    "-i",
    inputPath,
    "-vf",
    buildFfmpegScaleFilter(recipe.maxLongEdge),
    "-r",
    recipe.targetFps.toString(),
    "-c:v",
    recipe.codec,
    "-pix_fmt",
    recipe.pixelFormat,
    "-crf",
    recipe.crf.toString(),
    "-preset",
    recipe.preset,
  ];

  if (recipe.stripAudio) {
    args.push("-an");
  }

  if (recipe.faststart) {
    args.push("-movflags", "+faststart");
  }

  // Strip all non-essential global and stream metadata
  args.push("-map_metadata", "-1");

  args.push(outputPath);
  return args;
}

/**
 * Encodes a video derivative using FFmpeg CLI with strict argument array safety.
 */
export async function encodeVideoDerivative({
  inputPath,
  outputPath,
  recipe,
  timeoutMs = 45000,
}: EncodeVideoDerivativeOptions): Promise<void> {
  const args = buildFfmpegArgs(inputPath, outputPath, recipe);
  await executeSubprocess("ffmpeg", args, { timeoutMs });
}
