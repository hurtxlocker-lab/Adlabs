import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

/**
 * Cached resolved paths to avoid repeated disk inspection.
 */
let cachedFfmpegPath: string | null = null;
let cachedFfprobePath: string | null = null;

export interface BinaryResolutionDependencies {
  env?: Record<string, string | undefined>;
  fileExists?: (filePath: string) => boolean;
  platform?: NodeJS.Platform;
  readDir?: (dirPath: string) => Array<{ name: string; isDirectory: () => boolean }>;
}

/**
 * Scans directories on PATH for a specific binary name.
 */
function findExecutableOnPath(
  executableName: string,
  deps?: BinaryResolutionDependencies,
): string | null {
  const env = deps?.env ?? process.env;
  const fileExists = deps?.fileExists ?? fs.existsSync;
  const platform = deps?.platform ?? process.platform;

  const pathEnv = env.PATH || "";
  const pathSeparator = path.delimiter;
  const dirs = pathEnv.split(pathSeparator).filter(Boolean);
  const extensions = platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];

  for (const dir of dirs) {
    for (const ext of extensions) {
      const fullPath = path.join(dir, `${executableName}${ext}`);
      try {
        if (fileExists(fullPath)) {
          return fullPath;
        }
      } catch {
        // Skip inaccessible path segments
      }
    }
  }

  return null;
}

/**
 * On Windows, searches for Gyan.FFmpeg or FFmpeg in standard WinGet Packages directory.
 */
function findWinGetBinary(
  binaryName: string,
  deps?: BinaryResolutionDependencies,
): string | null {
  const env = deps?.env ?? process.env;
  const fileExists = deps?.fileExists ?? fs.existsSync;
  const platform = deps?.platform ?? process.platform;

  if (platform !== "win32") return null;

  const localAppData =
    env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const winGetPackagesDir = path.join(
    localAppData,
    "Microsoft",
    "WinGet",
    "Packages",
  );

  if (!fileExists(winGetPackagesDir)) return null;

  try {
    const entries = fs.readdirSync(winGetPackagesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.toLowerCase().includes("gyan.ffmpeg")) {
        const packagePath = path.join(winGetPackagesDir, entry.name);
        const subEntries = fs.readdirSync(packagePath, { withFileTypes: true });
        for (const sub of subEntries) {
          if (sub.isDirectory() && sub.name.toLowerCase().startsWith("ffmpeg")) {
            const candidateBin = path.join(
              packagePath,
              sub.name,
              "bin",
              `${binaryName}.exe`,
            );
            if (fileExists(candidateBin)) {
              return candidateBin;
            }
          }
        }
      }
    }
  } catch {
    // Ignore read errors
  }

  return null;
}

/**
 * Resolves the absolute path to the FFmpeg executable.
 *
 * Resolution order:
 *  1. FFMPEG_PATH environment variable override.
 *  2. Executable found on system PATH.
 *  3. Dynamic WinGet discovery on Windows.
 *
 * @throws Error with actionable message if FFmpeg cannot be located.
 */
export function resolveFfmpegPath(
  forceRefresh = false,
  deps?: BinaryResolutionDependencies,
): string {
  if (!forceRefresh && !deps && cachedFfmpegPath) {
    return cachedFfmpegPath;
  }

  const env = deps?.env ?? process.env;
  const fileExists = deps?.fileExists ?? fs.existsSync;

  // 1. Environment override
  if (env.FFMPEG_PATH && fileExists(env.FFMPEG_PATH)) {
    const resolved = env.FFMPEG_PATH;
    if (!deps) cachedFfmpegPath = resolved;
    return resolved;
  }

  // 2. PATH resolution
  const pathExecutable = findExecutableOnPath("ffmpeg", deps);
  if (pathExecutable) {
    const resolved = pathExecutable;
    if (!deps) cachedFfmpegPath = resolved;
    return resolved;
  }

  // 3. WinGet discovery on Windows
  const winGetExecutable = findWinGetBinary("ffmpeg", deps);
  if (winGetExecutable) {
    const resolved = winGetExecutable;
    if (!deps) cachedFfmpegPath = resolved;
    return resolved;
  }

  throw new Error(
    "ffmpeg executable not found. Add ffmpeg to PATH or configure the FFMPEG_PATH environment variable.",
  );
}

/**
 * Resolves the absolute path to the FFprobe executable.
 *
 * Resolution order:
 *  1. FFPROBE_PATH environment variable override.
 *  2. Executable found on system PATH.
 *  3. Dynamic WinGet discovery on Windows.
 *
 * @throws Error with actionable message if FFprobe cannot be located.
 */
export function resolveFfprobePath(
  forceRefresh = false,
  deps?: BinaryResolutionDependencies,
): string {
  if (!forceRefresh && !deps && cachedFfprobePath) {
    return cachedFfprobePath;
  }

  const env = deps?.env ?? process.env;
  const fileExists = deps?.fileExists ?? fs.existsSync;

  // 1. Environment override
  if (env.FFPROBE_PATH && fileExists(env.FFPROBE_PATH)) {
    const resolved = env.FFPROBE_PATH;
    if (!deps) cachedFfprobePath = resolved;
    return resolved;
  }

  // 2. PATH resolution
  const pathExecutable = findExecutableOnPath("ffprobe", deps);
  if (pathExecutable) {
    const resolved = pathExecutable;
    if (!deps) cachedFfprobePath = resolved;
    return resolved;
  }

  // 3. WinGet discovery on Windows
  const winGetExecutable = findWinGetBinary("ffprobe", deps);
  if (winGetExecutable) {
    const resolved = winGetExecutable;
    if (!deps) cachedFfprobePath = resolved;
    return resolved;
  }

  throw new Error(
    "ffprobe executable not found. Add ffprobe to PATH or configure the FFPROBE_PATH environment variable.",
  );
}
