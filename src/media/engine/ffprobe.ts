import { executeSubprocess } from "./subprocess";
import type { PhysicalMediaProbeResult } from "../types";

interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  duration?: string;
  r_frame_rate?: string;
  avg_frame_rate?: string;
}

interface FfprobeFormat {
  duration?: string;
  size?: string;
  bit_rate?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
}

function parseFrameRate(rFrameRate?: string): number | null {
  if (!rFrameRate) return null;
  const parts = rFrameRate.split("/");
  if (parts.length === 2) {
    const num = parseFloat(parts[0]);
    const den = parseFloat(parts[1]);
    if (!isNaN(num) && !isNaN(den) && den > 0) {
      return Number((num / den).toFixed(2));
    }
  }
  const val = parseFloat(rFrameRate);
  return isNaN(val) ? null : Number(val.toFixed(2));
}

/**
 * Safely probes a media file using ffprobe CLI to extract physical dimensions,
 * duration, frame rate, and audio presence.
 */
export async function probeMediaFile(filePath: string): Promise<PhysicalMediaProbeResult> {
  const args = [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type,width,height,duration,r_frame_rate,avg_frame_rate:format=duration,size,bit_rate",
    "-of",
    "json",
    filePath,
  ];

  const result = await executeSubprocess("ffprobe", args, { timeoutMs: 15000 });
  const parsed: FfprobeOutput = JSON.parse(result.stdout || "{}");

  const videoStream = parsed.streams?.find((s) => s.codec_type === "video");
  const audioStream = parsed.streams?.find((s) => s.codec_type === "audio");

  const width = videoStream?.width ?? null;
  const height = videoStream?.height ?? null;

  const durationSecStr = parsed.format?.duration ?? videoStream?.duration;
  const durationSec = durationSecStr ? parseFloat(durationSecStr) : null;
  const durationMs = durationSec && !isNaN(durationSec) ? Math.round(durationSec * 1000) : null;

  const fps = parseFrameRate(videoStream?.r_frame_rate) ?? parseFrameRate(videoStream?.avg_frame_rate);
  const hasAudio = Boolean(audioStream);

  const byteSize = parsed.format?.size ? BigInt(parsed.format.size) : null;

  return {
    width,
    height,
    durationMs,
    hasAudio,
    fps,
    byteSize,
  };
}
