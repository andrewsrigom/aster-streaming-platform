import { spawn } from "node:child_process";
import { MediaError } from "../domain/policy.js";

export async function runProcess(
  binary: string,
  args: readonly string[],
  cwd: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<string> {
  if (signal.aborted) {
    throw new MediaError("CANCELLED");
  }
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd,
      shell: false,
      detached: true,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: "/usr/local/bin:/usr/bin:/bin", LANG: "C", HOME: "/tmp" },
    });
    let failure: MediaError | undefined;
    let bytes = 0;
    let stderrBytes = 0;
    const chunks: Buffer[] = [];
    const kill = () => {
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) {
            failure ??= new MediaError("PROCESS_FAILED");
          }
        }
      }
    };
    const abort = () => {
      failure = new MediaError("CANCELLED");
      kill();
    };
    const timer = setTimeout(() => {
      failure = new MediaError("PROCESS_TIMEOUT");
      kill();
    }, timeoutMs);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
    }
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 65536) {
        failure = new MediaError("OUTPUT_LIMIT");
        kill();
      } else {
        chunks.push(chunk);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > 16384) {
        failure = new MediaError("OUTPUT_LIMIT");
        kill();
      }
    });
    child.on("error", () => {
      failure ??= new MediaError("PROCESS_FAILED");
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      kill();
      if (failure || code !== 0) {
        reject(failure ?? new MediaError("PROCESS_FAILED"));
      } else {
        resolve(Buffer.concat(chunks).toString("utf8"));
      }
    });
  });
}
