/* eslint-disable */
import { createHash } from "node:crypto";
import { lstat, mkdir, open, readdir, rmdir, unlink } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

import { CreatorError, type ResolvedOptions } from "@domains/scaffolding";

import { inspectDestination, type Destination } from "./destination.js";
import { renderRepository, type RenderedFile } from "./render.js";
import type { TemplateSnapshot } from "./template.js";

interface CreatedFile {
  readonly path: string;
  readonly dev: number;
  readonly ino: number;
  readonly digest: string;
}

interface CreatedDirectory {
  readonly path: string;
  readonly dev: number;
  readonly ino: number;
}

function error(
  code: ConstructorParameters<typeof CreatorError>[0],
  message: string,
  cause?: unknown,
): CreatorError {
  return new CreatorError(code, message, cause === undefined ? undefined : { cause });
}

function digest(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function checkAborted(signal: AbortSignal): void {
  if (signal.aborted) throw error("CANCELLED", "Repository creation was cancelled");
}

function contained(destination: string, candidate: string): boolean {
  const root = resolve(destination);
  const target = resolve(candidate);
  return target !== root && target.startsWith(`${root}${sep}`);
}

async function rollback(
  files: readonly CreatedFile[],
  directories: readonly CreatedDirectory[],
  destination: Destination,
  destinationOwned: boolean,
): Promise<void> {
  for (const file of [...files].reverse()) {
    try {
      const current = await lstat(file.path);
      if (current.isSymbolicLink() || current.dev !== file.dev || current.ino !== file.ino)
        continue;
      const handle = await open(file.path, "r");
      const text = await handle.readFile({ encoding: "utf8" });
      if (file.digest.length === 0 || digest(text) === file.digest) await unlink(file.path);
    } catch {
      // A changed or unavailable entry belongs to the user; never remove it.
    }
  }
  for (const directory of [...directories].reverse()) {
    try {
      const current = await lstat(directory.path);
      if (current.isDirectory() && current.dev === directory.dev && current.ino === directory.ino) {
        await rmdir(directory.path);
      }
    } catch {
      // Preserve entries that changed during rollback.
    }
  }
  if (destinationOwned) {
    try {
      const current = await lstat(destination.path);
      if (current.isDirectory() && (await readdir(destination.path)).length === 0)
        await rmdir(destination.path);
    } catch {
      // Preserve a raced or changed destination.
    }
  }
}

async function reserveDestination(destination: Destination): Promise<boolean> {
  if (!destination.existed) {
    try {
      await mkdir(destination.path, { mode: 0o755, recursive: false });
      return true;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "EEXIST") {
        throw error(
          "DESTINATION_CONFLICT",
          `Destination appeared while creating it: ${destination.path}`,
          cause,
        );
      }
      throw error("WRITE_FAILED", `Unable to reserve destination ${destination.path}`, cause);
    }
  }

  let current;
  try {
    current = await lstat(destination.path);
  } catch (cause) {
    throw error(
      "DESTINATION_CONFLICT",
      `Destination changed before creation: ${destination.path}`,
      cause,
    );
  }
  if (!current.isDirectory() || current.isSymbolicLink()) {
    throw error("DESTINATION_CONFLICT", `Destination changed before creation: ${destination.path}`);
  }
  if (
    destination.identity === null ||
    current.dev !== destination.identity.dev ||
    current.ino !== destination.identity.ino
  ) {
    throw error("DESTINATION_CONFLICT", `Destination changed before creation: ${destination.path}`);
  }
  try {
    if ((await readdir(destination.path)).length !== 0)
      throw error("DESTINATION_CONFLICT", `Destination is no longer empty: ${destination.path}`);
  } catch (cause) {
    if (cause instanceof CreatorError) throw cause;
    throw error("DESTINATION_CONFLICT", `Unable to recheck destination ${destination.path}`, cause);
  }
  return false;
}

async function ensureParentDirectories(
  destination: string,
  filePath: string,
  owned: CreatedDirectory[],
): Promise<void> {
  const parent = dirname(filePath);
  if (parent === destination) return;
  const relativeParent = relative(destination, parent);
  if (!relativeParent || relativeParent.startsWith("..") || relativeParent.includes(`..${sep}`)) {
    throw error("INVALID_TEMPLATE", `Template file escapes destination: ${filePath}`);
  }
  let current = destination;
  for (const segment of relativeParent.split(sep)) {
    current = resolve(current, segment);
    let stat;
    try {
      stat = await lstat(current);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error("WRITE_FAILED", `Unable to inspect directory ${current}`, cause);
      }
      try {
        await mkdir(current, { mode: 0o755, recursive: false });
      } catch (mkdirCause) {
        throw error("WRITE_FAILED", `Unable to create directory ${current}`, mkdirCause);
      }
      stat = await lstat(current);
      owned.push({ path: current, dev: stat.dev, ino: stat.ino });
      continue;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw error("DESTINATION_CONFLICT", `Template parent is not a safe directory: ${current}`);
    }
    if (!owned.some((entry) => entry.path === current)) {
      throw error("DESTINATION_CONFLICT", `Unexpected existing template directory: ${current}`);
    }
  }
}

async function writeFileExclusive(
  file: RenderedFile,
  destination: string,
  created: CreatedFile[],
  signal: AbortSignal,
): Promise<void> {
  checkAborted(signal);
  const filePath = resolve(destination, file.path);
  if (!contained(destination, filePath))
    throw error("INVALID_TEMPLATE", `Template file escapes destination: ${file.path}`);
  let handle;
  try {
    handle = await open(filePath, "wx", file.mode);
    const opened = await handle.stat();
    created.push({ path: filePath, dev: opened.dev, ino: opened.ino, digest: "" });
    await handle.writeFile(file.text, "utf8");
    await handle.chmod(file.mode);
    await handle.close();
    const index = created.length - 1;
    const createdFile = created[index];
    if (createdFile !== undefined) created[index] = { ...createdFile, digest: digest(file.text) };
  } catch (cause) {
    try {
      await handle?.close();
    } catch {
      // Ignore close failures while reporting the original write failure.
    }
    if ((cause as NodeJS.ErrnoException).code === "EEXIST") {
      throw error("DESTINATION_CONFLICT", `Template file already exists: ${file.path}`, cause);
    }
    throw error("WRITE_FAILED", `Unable to create ${file.path}`, cause);
  }
  const stat = await lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw error("WRITE_FAILED", `Created path is not a regular file: ${file.path}`);
  checkAborted(signal);
}

/** Render and write a repository using exclusive files and ownership-aware rollback. */
export async function createRepository(
  template: TemplateSnapshot,
  options: ResolvedOptions,
  destination: Destination,
  signal: AbortSignal,
): Promise<void> {
  checkAborted(signal);
  const rendered = renderRepository(template, options);
  const destinationOwned = await reserveDestination(destination);
  const files: CreatedFile[] = [];
  const directories: CreatedDirectory[] = [];
  try {
    for (const file of rendered) {
      checkAborted(signal);
      const filePath = resolve(destination.path, file.path);
      if (!contained(destination.path, filePath))
        throw error("INVALID_TEMPLATE", `Template file escapes destination: ${file.path}`);
      await ensureParentDirectories(destination.path, filePath, directories);
      await writeFileExclusive(file, destination.path, files, signal);
    }
    checkAborted(signal);
  } catch (cause) {
    await rollback(files, directories, destination, destinationOwned);
    if (cause instanceof CreatorError) throw cause;
    throw error("WRITE_FAILED", `Unable to create repository in ${destination.path}`, cause);
  }
}

/** Convenience helper for callers that have not inspected a destination yet. */
export async function createRepositoryAt(
  template: TemplateSnapshot,
  options: ResolvedOptions,
  directory: string,
  signal: AbortSignal,
): Promise<void> {
  await createRepository(template, options, await inspectDestination(directory), signal);
}
