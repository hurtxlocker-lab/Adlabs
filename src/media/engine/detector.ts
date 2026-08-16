import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveFfmpegPath, resolveFfprobePath } from "./binaries";

const execFileAsync = promisify(execFile);

export interface BinaryAvailability {
  ffmpeg: boolean;
  ffprobe: boolean;
  ffmpegVersion?: string;
  ffprobeVersion?: string;
  ffmpegPath?: string;
  ffprobePath?: string;
}

/**
 * Probes the runtime environment to verify whether ffmpeg and ffprobe CLI binaries
 * are executable in the current environment.
 */
export async function checkFfmpegAvailability(): Promise<BinaryAvailability> {
  const result: BinaryAvailability = {
    ffmpeg: false,
    ffprobe: false,
  };

  try {
    const ffmpegPath = resolveFfmpegPath();
    const { stdout } = await execFileAsync(ffmpegPath, ["-version"], { timeout: 5000 });
    result.ffmpeg = true;
    result.ffmpegPath = ffmpegPath;
    result.ffmpegVersion = stdout.split("\n")[0]?.trim();
  } catch {
    result.ffmpeg = false;
  }

  try {
    const ffprobePath = resolveFfprobePath();
    const { stdout } = await execFileAsync(ffprobePath, ["-version"], { timeout: 5000 });
    result.ffprobe = true;
    result.ffprobePath = ffprobePath;
    result.ffprobeVersion = stdout.split("\n")[0]?.trim();
  } catch {
    result.ffprobe = false;
  }

  return result;
}
