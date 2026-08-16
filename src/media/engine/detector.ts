import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface BinaryAvailability {
  ffmpeg: boolean;
  ffprobe: boolean;
  ffmpegVersion?: string;
  ffprobeVersion?: string;
}

/**
 * Probes the runtime environment to verify whether ffmpeg and ffprobe CLI binaries
 * are executable in the current PATH.
 */
export async function checkFfmpegAvailability(): Promise<BinaryAvailability> {
  const result: BinaryAvailability = {
    ffmpeg: false,
    ffprobe: false,
  };

  try {
    const { stdout } = await execFileAsync("ffmpeg", ["-version"], { timeout: 5000 });
    result.ffmpeg = true;
    result.ffmpegVersion = stdout.split("\n")[0]?.trim();
  } catch {
    result.ffmpeg = false;
  }

  try {
    const { stdout } = await execFileAsync("ffprobe", ["-version"], { timeout: 5000 });
    result.ffprobe = true;
    result.ffprobeVersion = stdout.split("\n")[0]?.trim();
  } catch {
    result.ffprobe = false;
  }

  return result;
}
