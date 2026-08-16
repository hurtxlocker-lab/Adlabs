import { execFile } from "node:child_process";

export class SubprocessError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly args: string[],
    public readonly exitCode?: number | null,
    public readonly stderr?: string,
  ) {
    super(message);
    this.name = "SubprocessError";
  }
}

export interface SubprocessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SubprocessOptions {
  timeoutMs?: number;
  maxBufferBytes?: number;
}

/**
 * Safely executes a CLI binary using an argument array.
 * Never invokes a shell string interpreter.
 */
export async function executeSubprocess(
  binaryPath: string,
  args: string[],
  options: SubprocessOptions = {},
): Promise<SubprocessResult> {
  const timeoutMs = options.timeoutMs ?? 30000;
  const maxBufferBytes = options.maxBufferBytes ?? 10 * 1024 * 1024; // 10MB

  return new Promise((resolve, reject) => {
    execFile(
      binaryPath,
      args,
      {
        timeout: timeoutMs,
        maxBuffer: maxBufferBytes,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const cleanStderr = typeof stderr === "string" ? stderr.slice(0, 4000) : "";
        const cleanStdout = typeof stdout === "string" ? stdout : "";

        if (error) {
          return reject(
            new SubprocessError(
              `Command "${binaryPath}" failed with exit code ${error.code ?? "unknown"}: ${cleanStderr || error.message}`,
              binaryPath,
              args,
              typeof error.code === "number" ? error.code : null,
              cleanStderr,
            ),
          );
        }

        resolve({
          stdout: cleanStdout,
          stderr: cleanStderr,
          exitCode: 0,
        });
      },
    );
  });
}
