/* eslint-disable */
import { type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { CreatorError, type ResolvedOptions } from "@domains/scaffolding";
import spawn from "cross-spawn";
export interface SetupResult {
  readonly install: "skipped" | "completed";
  readonly git: "skipped" | "completed";
}

type SetupOptions = Pick<ResolvedOptions, "install" | "git">;
type OutputHandler = (text: string) => void;
interface ProcessResult {
  readonly code: number | null;
  readonly stdout: string;
}

function setupError(message: string, cause?: unknown): CreatorError {
  return new CreatorError("SETUP_FAILED", message, cause === undefined ? undefined : { cause });
}

function cancellation(): CreatorError {
  return new CreatorError("CANCELLED", "Setup was cancelled");
}

function terminate(child: ChildProcess): void {
  const pid = child.pid;
  if (pid === undefined || pid === null) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      shell: false,
    });
    killer.unref();
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      // The process may have exited since the check.
    }
  }
  const timer = setTimeout(() => {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // The process may have exited during the grace period.
    }
  }, 5000);
  timer.unref();
}
function runProcess(
  executable: string,
  args: readonly string[],
  directory: string,
  signal: AbortSignal,
  onOutput: OutputHandler,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(executable, [...args], {
        cwd: directory,
        shell: false,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (cause) {
      reject(setupError(`Unable to start ${executable}`, cause));
      return;
    }

    let stdout = "";
    let aborted = signal.aborted;
    const onAbort = (): void => {
      aborted = true;
      terminate(child);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    child.stdout?.on("data", (chunk: Buffer | string) => {
      const text = String(chunk);
      stdout += text;
      onOutput(text);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => onOutput(String(chunk)));
    child.once("error", (cause) => {
      signal.removeEventListener("abort", onAbort);
      reject(aborted ? cancellation() : setupError(`Unable to run ${executable}`, cause));
    });
    child.once("close", (code) => {
      signal.removeEventListener("abort", onAbort);
      if (aborted) {
        reject(cancellation());
      } else {
        resolve({ code, stdout });
      }
    });
    if (aborted) onAbort();
  });
}

function packageManagerVersion(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("pnpm@") ||
    value.slice("pnpm@".length).length === 0
  ) {
    throw setupError("Generated package.json must pin packageManager to pnpm@<version>");
  }
  return value.slice("pnpm@".length);
}

/** Run only the setup operations the user requested, in order and without a shell. */
export async function runSetup(
  directory: string,
  options: SetupOptions,
  signal: AbortSignal,
  onOutput: OutputHandler,
): Promise<SetupResult> {
  const result: { install: "skipped" | "completed"; git: "skipped" | "completed" } = {
    install: "skipped",
    git: "skipped",
  };
  if (options.install) {
    let packageJson: Record<string, unknown>;
    try {
      packageJson = JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as Record<
        string,
        unknown
      >;
    } catch (cause) {
      throw setupError("Unable to read generated package.json for setup", cause);
    }
    const expected = packageManagerVersion(packageJson.packageManager);
    const version = await runProcess("pnpm", ["--version"], directory, signal, onOutput);
    if (version.code !== 0 || version.stdout.trim() !== expected) {
      throw setupError(
        `Expected pnpm ${expected}, but found ${version.stdout.trim() || "an unavailable version"}`,
      );
    }
    const install = await runProcess(
      "pnpm",
      ["install", "--frozen-lockfile"],
      directory,
      signal,
      onOutput,
    );
    if (install.code !== 0)
      throw setupError(`pnpm install failed with exit code ${install.code ?? 1}`);
    result.install = "completed";
  }
  if (options.git) {
    const git = await runProcess(
      "git",
      ["init", "--initial-branch=main"],
      directory,
      signal,
      onOutput,
    );
    if (git.code !== 0) throw setupError(`git init failed with exit code ${git.code ?? 1}`);
    result.git = "completed";
  }
  return result;
}
