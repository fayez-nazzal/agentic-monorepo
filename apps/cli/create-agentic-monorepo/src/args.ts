/* eslint-disable */
import { parseArgs as parseNodeArgs, type ParseArgsConfig } from "node:util";

import {
  CreatorError,
  type AppId,
  type CreatorOverrides,
  type PresetId,
} from "@domains/scaffolding";

export interface CliArgs {
  readonly destination?: string;
  readonly name?: string;
  readonly preset?: string;
  readonly apps?: string;
  readonly rust?: boolean;
  readonly install?: boolean;
  readonly git?: boolean;
  readonly config?: string;
  readonly yes: boolean;
  readonly dryRun: boolean;
  readonly json: boolean;
  readonly plain: boolean;
  readonly list: boolean;
  readonly help: boolean;
  readonly version: boolean;
}

const comingSoon = new Set([
  "react",
  "nextjs",
  "vue",
  "sveltekit",
  "astro",
  "node-api",
  "ios",
  "android",
  "expo",
  "electron",
  "tauri",
  "rust-bindings",
]);
const appIds = new Set<AppId>(["web", "cli", "mac"]);
const presetIds = new Set<PresetId>(["web", "cli", "mac", "web-cli", "full", "workspace"]);

type OptionToken = {
  readonly kind: "option";
  readonly name: string;
  readonly value?: string | boolean;
};

function usageError(message: string, cause?: unknown): CreatorError {
  return new CreatorError("INVALID_ARGUMENT", message, cause === undefined ? undefined : { cause });
}

/** Parse the public command line; reject unknown and repeated options. */
export function parseCliArgs(argv: readonly string[]): CliArgs {
  const config: ParseArgsConfig = {
    args: [...argv],
    options: {
      name: { type: "string" },
      preset: { type: "string" },
      apps: { type: "string" },
      config: { type: "string" },
      rust: { type: "boolean" },
      "no-rust": { type: "boolean" },
      install: { type: "boolean" },
      "no-install": { type: "boolean" },
      git: { type: "boolean" },
      "no-git": { type: "boolean" },
      yes: { type: "boolean", short: "y" },
      "dry-run": { type: "boolean" },
      json: { type: "boolean" },
      plain: { type: "boolean" },
      list: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
    allowPositionals: true,
    strict: true,
    tokens: true,
  };

  let parsed: ReturnType<typeof parseNodeArgs>;
  try {
    parsed = parseNodeArgs(config);
  } catch (error) {
    throw usageError(
      error instanceof Error ? error.message : "Invalid command-line arguments",
      error,
    );
  }

  const seen = new Set<string>();
  const values = new Map<string, string | boolean>();
  for (const token of parsed.tokens as readonly (OptionToken | { readonly kind: string })[]) {
    if (token.kind !== "option") continue;
    const option = token as OptionToken;
    const normalized =
      option.name === "h"
        ? "help"
        : option.name === "v"
          ? "version"
          : option.name === "y"
            ? "yes"
            : option.name;
    if (normalized === "no-rust" || normalized === "no-install" || normalized === "no-git") {
      const positive = normalized.slice(3);
      if (seen.has(positive)) throw usageError(`Option --${positive} was specified more than once`);
      seen.add(positive);
      values.set(positive, false);
      continue;
    }
    if (seen.has(normalized))
      throw usageError(`Option --${normalized} was specified more than once`);
    seen.add(normalized);
    values.set(normalized, option.value ?? true);
  }

  if (parsed.positionals.length > 1) {
    throw usageError("Expected at most one destination positional argument");
  }

  const getString = (name: string): string | undefined => {
    const value = values.get(name);
    return typeof value === "string" ? value : undefined;
  };
  const getBoolean = (name: string): boolean | undefined => {
    const value = values.get(name);
    return typeof value === "boolean" ? value : undefined;
  };
  const result: CliArgs = {
    ...(parsed.positionals[0] === undefined ? {} : { destination: parsed.positionals[0] }),
    ...(getString("name") === undefined ? {} : { name: getString("name") }),
    ...(getString("preset") === undefined ? {} : { preset: getString("preset") }),
    ...(getString("apps") === undefined ? {} : { apps: getString("apps") }),
    ...(getBoolean("rust") === undefined ? {} : { rust: getBoolean("rust") }),
    ...(getBoolean("install") === undefined ? {} : { install: getBoolean("install") }),
    ...(getBoolean("git") === undefined ? {} : { git: getBoolean("git") }),
    ...(getString("config") === undefined ? {} : { config: getString("config") }),
    yes: getBoolean("yes") ?? false,
    dryRun: getBoolean("dry-run") ?? false,
    json: getBoolean("json") ?? false,
    plain: getBoolean("plain") ?? false,
    list: getBoolean("list") ?? false,
    help: getBoolean("help") ?? false,
    version: getBoolean("version") ?? false,
  };

  if (result.help && (result.version || result.list || result.destination !== undefined)) {
    throw usageError("--help cannot be combined with another command");
  }
  if (result.version && (result.list || result.destination !== undefined)) {
    throw usageError("--version cannot be combined with another command");
  }
  if (result.list && result.destination !== undefined) {
    throw usageError("--list does not accept a destination");
  }
  if (result.name !== undefined && result.name.length === 0)
    throw usageError("--name cannot be empty");
  if (result.preset !== undefined) parsePreset(result.preset);
  if (result.apps !== undefined) parseApps(result.apps);
  return result;
}

export function parsePreset(value: string): PresetId {
  if (!presetIds.has(value as PresetId)) {
    throw usageError(`Unknown preset ${JSON.stringify(value)}`);
  }
  return value as PresetId;
}

export function parseApps(value: string): readonly AppId[] {
  if (value === "none") return [];
  const parts = value.split(",");
  if (parts.some((part) => part.length === 0))
    throw usageError("--apps cannot contain empty values");
  const selected: AppId[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    if (seen.has(part)) throw usageError(`Duplicate app ${JSON.stringify(part)}`);
    seen.add(part);
    if (comingSoon.has(part)) {
      throw new CreatorError("UNSUPPORTED_OPTION", `${part} is Coming soon and has no starter yet`);
    }
    if (!appIds.has(part as AppId)) throw usageError(`Unknown app ${JSON.stringify(part)}`);
    selected.push(part as AppId);
  }
  return selected;
}

/** Keep only the command-line settings the user supplied. */
export function toOverrides(args: CliArgs): CreatorOverrides {
  const overrides: {
    name?: string;
    preset?: PresetId;
    apps?: readonly AppId[];
    rust?: boolean;
    install?: boolean;
    git?: boolean;
  } = {};
  if (args.name !== undefined) overrides.name = args.name;
  if (args.preset !== undefined) overrides.preset = parsePreset(args.preset);
  if (args.apps !== undefined) overrides.apps = parseApps(args.apps);
  if (args.rust !== undefined) overrides.rust = args.rust;
  if (args.install !== undefined) overrides.install = args.install;
  if (args.git !== undefined) overrides.git = args.git;
  return overrides;
}

export function hasSelection(args: CliArgs): boolean {
  return args.preset !== undefined || args.apps !== undefined;
}

export function isComingSoon(value: string): boolean {
  return comingSoon.has(value);
}
