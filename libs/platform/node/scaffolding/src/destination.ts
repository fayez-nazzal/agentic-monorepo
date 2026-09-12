/* eslint-disable */
import { lstat, readdir, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { CreatorError } from "@domains/scaffolding";

export interface Destination {
  readonly path: string;
  readonly existed: boolean;
  readonly identity: { readonly dev: number; readonly ino: number } | null;
}

function conflict(message: string, cause?: unknown): CreatorError {
  return new CreatorError(
    "DESTINATION_CONFLICT",
    message,
    cause === undefined ? undefined : { cause },
  );
}

/** Resolve a destination through its existing parent and enforce an empty target. */
export async function inspectDestination(directory: string): Promise<Destination> {
  const requested = resolve(process.cwd(), directory);
  let current;
  try {
    current = await lstat(requested);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") {
      throw conflict(`Unable to inspect destination ${requested}`, cause);
    }
    const parent = dirname(requested);
    let canonicalParent: string;
    try {
      canonicalParent = await realpath(parent);
    } catch (parentCause) {
      throw conflict(`Destination parent does not exist: ${parent}`, parentCause);
    }
    let parentStat;
    try {
      parentStat = await lstat(canonicalParent);
    } catch (parentCause) {
      throw conflict(`Unable to inspect destination parent ${canonicalParent}`, parentCause);
    }
    if (!parentStat.isDirectory()) {
      throw conflict(`Destination parent is not a directory: ${canonicalParent}`);
    }
    return {
      path: join(canonicalParent, requested.slice(parent.length + 1)),
      existed: false,
      identity: null,
    };
  }

  if (current.isSymbolicLink()) {
    throw conflict(`Destination must not be a symbolic link: ${requested}`);
  }
  if (!current.isDirectory()) {
    throw conflict(`Destination is not a directory: ${requested}`);
  }
  let entries: string[];
  try {
    entries = await readdir(requested);
  } catch (cause) {
    throw conflict(`Unable to inspect destination ${requested}`, cause);
  }
  if (entries.length > 0) {
    throw conflict(`Destination is not empty: ${requested}`);
  }
  return {
    path: requested,
    existed: true,
    identity: { dev: current.dev, ino: current.ino },
  };
}
