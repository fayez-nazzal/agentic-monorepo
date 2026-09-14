/* eslint-disable */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, posix, win32 } from "node:path";

import { CreatorError } from "@domains/scaffolding";

export interface TemplateFile {
  readonly path: string;
  readonly mode: 420 | 493;
  readonly text: string;
}

export interface TemplateSnapshot {
  readonly formatVersion: 1;
  readonly creatorVersion: string;
  readonly digest: string;
  readonly files: readonly TemplateFile[];
  readonly variantLockfiles?: Readonly<Record<string, string>>;
}

/** Canonical JSON used to calculate the template digest. */
export function canonicalTemplateValue(
  snapshot: Pick<TemplateSnapshot, "files" | "variantLockfiles">,
): string {
  const files = [...snapshot.files]
    .map((file) => ({ path: file.path, mode: file.mode, text: file.text }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const variantLockfiles = Object.fromEntries(
    Object.entries(snapshot.variantLockfiles ?? {}).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
  return JSON.stringify({ files, variantLockfiles });
}

export function calculateTemplateDigest(
  snapshot: Pick<TemplateSnapshot, "files" | "variantLockfiles">,
): string {
  return `sha256:${createHash("sha256").update(canonicalTemplateValue(snapshot), "utf8").digest("hex")}`;
}

export function validateTemplatePath(value: string): boolean {
  if (value.length === 0 || value.includes("\\") || value.includes("\0")) {
    return false;
  }
  if (isAbsolute(value) || win32.isAbsolute(value) || win32.parse(value).root.length > 0) {
    return false;
  }
  const normalized = posix.normalize(value);
  return (
    normalized === value &&
    normalized !== "." &&
    !normalized.split("/").includes("..") &&
    !value.startsWith("/")
  );
}

function invalid(message: string, cause?: unknown): CreatorError {
  return new CreatorError("INVALID_TEMPLATE", message, cause === undefined ? undefined : { cause });
}

function parseSnapshot(value: unknown): TemplateSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid("Template asset must contain a JSON object");
  }
  const record = value as Record<string, unknown>;
  if (record.formatVersion !== 1) {
    throw invalid("Unsupported template format version");
  }
  if (typeof record.creatorVersion !== "string" || record.creatorVersion.length === 0) {
    throw invalid("Template creatorVersion must be a non-empty string");
  }
  if (typeof record.digest !== "string" || !/^sha256:[0-9a-f]{64}$/.test(record.digest)) {
    throw invalid("Template digest must be a sha256 digest");
  }
  if (!Array.isArray(record.files) || record.files.length === 0) {
    throw invalid("Template files must be a non-empty array");
  }

  const files: TemplateFile[] = [];
  const paths = new Set<string>();
  const caseFoldedPaths = new Set<string>();
  for (const item of record.files) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw invalid("Template file entries must be objects");
    }
    const file = item as Record<string, unknown>;
    if (
      typeof file.path !== "string" ||
      (file.mode !== 420 && file.mode !== 493) ||
      typeof file.text !== "string" ||
      !validateTemplatePath(file.path)
    ) {
      throw invalid("Template contains an invalid file entry");
    }
    const key = file.path.toLocaleLowerCase("en-US");
    if (paths.has(file.path) || caseFoldedPaths.has(key)) {
      throw invalid(`Template contains duplicate file path ${file.path}`);
    }
    paths.add(file.path);
    caseFoldedPaths.add(key);
    files.push({ path: file.path, mode: file.mode, text: file.text });
  }

  let variantLockfiles: Readonly<Record<string, string>> | undefined;
  if (record.variantLockfiles !== undefined) {
    if (
      typeof record.variantLockfiles !== "object" ||
      record.variantLockfiles === null ||
      Array.isArray(record.variantLockfiles)
    ) {
      throw invalid("Template variantLockfiles must be an object");
    }
    const variants: Record<string, string> = {};
    for (const [key, text] of Object.entries(record.variantLockfiles as Record<string, unknown>)) {
      if (key.length === 0 || typeof text !== "string") {
        throw invalid("Template variantLockfiles contains an invalid entry");
      }
      variants[key] = text;
    }
    variantLockfiles = variants;
  }

  const snapshot: TemplateSnapshot = {
    formatVersion: 1,
    creatorVersion: record.creatorVersion,
    digest: record.digest,
    files,
    ...(variantLockfiles === undefined ? {} : { variantLockfiles }),
  };
  if (calculateTemplateDigest(snapshot) !== snapshot.digest) {
    throw invalid("Template digest does not match its contents");
  }
  return snapshot;
}

/** Read, check, and verify an immutable bundled template asset. */
export async function loadTemplate(templateUrl: URL): Promise<TemplateSnapshot> {
  let text: string;
  try {
    text = await readFile(templateUrl, "utf8");
  } catch (cause) {
    throw invalid(`Unable to read template asset ${templateUrl.href}`, cause);
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (cause) {
    throw invalid("Template asset is not valid JSON", cause);
  }
  return parseSnapshot(value);
}
