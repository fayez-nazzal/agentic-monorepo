/* eslint-disable */
import {
  catalog,
  isAppId,
  isComingSoonId,
  isPresetId,
  presets,
  type AppId,
  type CatalogDescriptor,
  type ComponentId,
  type PresetId,
} from "./catalog.js";

export type CreatorErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_CONFIG"
  | "UNSUPPORTED_OPTION"
  | "UNSUPPORTED_RUNTIME"
  | "TEMPLATE_MISMATCH"
  | "INVALID_TEMPLATE"
  | "DESTINATION_CONFLICT"
  | "WRITE_FAILED"
  | "SETUP_FAILED"
  | "CANCELLED";

export class CreatorError extends Error {
  readonly code: CreatorErrorCode;

  constructor(code: CreatorErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CreatorError";
    this.code = code;
  }
}

export interface CreatorConfig {
  readonly schemaVersion: 1;
  readonly name?: string;
  readonly preset?: PresetId;
  readonly apps?: readonly AppId[];
  readonly rust?: boolean;
  readonly install?: boolean;
  readonly git?: boolean;
  readonly templateVersion?: string;
  readonly templateDigest?: string;
}

export type CreatorOverrides = Partial<
  Omit<CreatorConfig, "schemaVersion" | "templateVersion" | "templateDigest">
>;

export interface ResolvedOptions {
  readonly name: string;
  readonly apps: readonly AppId[];
  readonly rust: boolean;
  readonly install: boolean;
  readonly git: boolean;
  readonly components: readonly ComponentId[];
}

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CONFIG_KEYS: Record<string, true> = {
  schemaVersion: true,
  name: true,
  preset: true,
  apps: true,
  rust: true,
  install: true,
  git: true,
  templateVersion: true,
  templateDigest: true,
};
const OVERRIDE_KEYS: Record<string, true> = {
  name: true,
  preset: true,
  apps: true,
  rust: true,
  install: true,
  git: true,
};
const APP_ORDER: readonly AppId[] = ["web", "cli", "mac"];

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function invalidConfig(message: string, cause?: unknown): CreatorError {
  return new CreatorError("INVALID_CONFIG", message, cause === undefined ? undefined : { cause });
}

function invalidArgument(message: string, cause?: unknown): CreatorError {
  return new CreatorError("INVALID_ARGUMENT", message, cause === undefined ? undefined : { cause });
}

function assertName(value: unknown, code: "INVALID_ARGUMENT" | "INVALID_CONFIG"): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 100 ||
    !NAME_PATTERN.test(value)
  ) {
    throw new CreatorError(
      code,
      "Name must be 1–100 characters of lower-kebab-case (a-z, 0-9, and single hyphens).",
    );
  }
  return value;
}

/** Check a repository or package name supplied by the user. */
export function validateName(value: unknown): string {
  return assertName(value, "INVALID_ARGUMENT");
}

/** Return whether a value is a valid lower-kebab-case repository name. */
export function isValidName(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= 100 && NAME_PATTERN.test(value)
  );
}

function validatePinnedString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw invalidConfig(`${field} must be a non-empty string when provided.`);
  }
  return value;
}

function normalizeConfigApps(value: unknown): readonly AppId[] {
  if (!Array.isArray(value)) {
    throw invalidConfig("apps must be an array containing web, cli, and/or mac.");
  }

  const seen = new Set<AppId>();
  const apps: AppId[] = [];
  for (const item of value) {
    if (!isAppId(item)) {
      if (isComingSoonId(item)) {
        throw new CreatorError(
          "UNSUPPORTED_OPTION",
          `The ${item} capability is coming soon and cannot be selected.`,
        );
      }
      throw invalidConfig(`Unknown app capability: ${String(item)}.`);
    }
    if (seen.has(item)) {
      throw invalidConfig(`apps contains duplicate entry: ${item}.`);
    }
    seen.add(item);
    apps.push(item);
  }
  return sortApps(apps);
}

function normalizeOverrideApps(value: unknown): readonly AppId[] {
  try {
    return normalizeConfigApps(value);
  } catch (error) {
    if (error instanceof CreatorError && error.code === "INVALID_CONFIG") {
      throw invalidArgument(error.message, error);
    }
    throw error;
  }
}

function sortApps(apps: readonly AppId[]): readonly AppId[] {
  return APP_ORDER.filter((app) => apps.includes(app));
}

/**
 * Check the complete JSON configuration. Reject unknown fields and malformed
 * values instead of ignoring them or merging them into defaults.
 */
export function validateConfig(value: unknown): CreatorConfig {
  if (!isRecord(value)) {
    throw invalidConfig("Configuration must be a JSON object.");
  }

  for (const key of Object.keys(value)) {
    if (CONFIG_KEYS[key] !== true) {
      throw invalidConfig(`Unknown configuration field: ${key}.`);
    }
  }
  if (value["schemaVersion"] !== 1) {
    throw invalidConfig("schemaVersion must be exactly 1.");
  }

  const result: { -readonly [Key in keyof CreatorConfig]?: CreatorConfig[Key] } = {
    schemaVersion: 1,
  };

  if (hasOwn(value, "name")) {
    result.name = assertName(value["name"], "INVALID_CONFIG");
  }
  if (hasOwn(value, "preset")) {
    const preset = value["preset"];
    if (!isPresetId(preset)) {
      if (isComingSoonId(preset)) {
        throw new CreatorError(
          "UNSUPPORTED_OPTION",
          `The ${String(preset)} capability is coming soon and cannot be selected.`,
        );
      }
      throw invalidConfig(`Unknown preset: ${String(preset)}.`);
    }
    result.preset = preset;
  }
  if (hasOwn(value, "apps")) {
    result.apps = normalizeConfigApps(value["apps"]);
  }
  if (hasOwn(value, "rust")) {
    const rust = value["rust"];
    if (typeof rust !== "boolean") {
      throw invalidConfig("rust must be a boolean when provided.");
    }
    result.rust = rust;
  }
  if (hasOwn(value, "install")) {
    const install = value["install"];
    if (typeof install !== "boolean") {
      throw invalidConfig("install must be a boolean when provided.");
    }
    result.install = install;
  }
  if (hasOwn(value, "git")) {
    const git = value["git"];
    if (typeof git !== "boolean") {
      throw invalidConfig("git must be a boolean when provided.");
    }
    result.git = git;
  }
  if (hasOwn(value, "templateVersion")) {
    result.templateVersion = validatePinnedString(value["templateVersion"], "templateVersion");
  }
  if (hasOwn(value, "templateDigest")) {
    result.templateDigest = validatePinnedString(value["templateDigest"], "templateDigest");
  }

  if (hasOwn(value, "preset") && hasOwn(value, "apps")) {
    throw invalidConfig("preset and apps cannot both be specified in the same configuration.");
  }

  return result as CreatorConfig;
}

function validateOverrides(value: CreatorOverrides): CreatorOverrides {
  if (!isRecord(value)) {
    throw invalidArgument("Overrides must be an object.");
  }
  for (const key of Object.keys(value)) {
    if (OVERRIDE_KEYS[key] !== true) {
      throw invalidArgument(`Unknown override field: ${key}.`);
    }
  }

  if (hasOwn(value, "name")) {
    assertName(value["name"], "INVALID_ARGUMENT");
  }
  if (hasOwn(value, "preset")) {
    const preset = value["preset"];
    if (!isPresetId(preset)) {
      if (isComingSoonId(preset)) {
        throw new CreatorError(
          "UNSUPPORTED_OPTION",
          `The ${String(preset)} capability is coming soon and cannot be selected.`,
        );
      }
      throw invalidArgument(`Unknown preset: ${String(preset)}.`);
    }
  }
  if (hasOwn(value, "apps")) {
    normalizeOverrideApps(value["apps"]);
  }
  if (hasOwn(value, "rust") && typeof value["rust"] !== "boolean") {
    throw invalidArgument("rust must be a boolean when provided.");
  }
  if (hasOwn(value, "install") && typeof value["install"] !== "boolean") {
    throw invalidArgument("install must be a boolean when provided.");
  }
  if (hasOwn(value, "git") && typeof value["git"] !== "boolean") {
    throw invalidArgument("git must be a boolean when provided.");
  }
  if (hasOwn(value, "preset") && hasOwn(value, "apps")) {
    throw invalidArgument("preset and apps cannot both be specified as explicit overrides.");
  }
  return value;
}

function descriptorFor(id: ComponentId): CatalogDescriptor {
  const descriptor = catalog.find((entry) => entry.id === id);
  if (!descriptor || descriptor.status !== "available") {
    throw new CreatorError("INVALID_TEMPLATE", `Catalog is missing available component ${id}.`);
  }
  return descriptor;
}

function resolveClosure(apps: readonly AppId[], rust: boolean): readonly ComponentId[] {
  const components: ComponentId[] = [];
  const visited = new Set<ComponentId>();
  const visiting = new Set<ComponentId>();

  const visit = (id: ComponentId): void => {
    if (visited.has(id)) {
      return;
    }
    if (visiting.has(id)) {
      throw new CreatorError("INVALID_TEMPLATE", `Catalog dependency cycle includes ${id}.`);
    }
    visiting.add(id);
    const descriptor = descriptorFor(id);
    for (const required of descriptor.requires) {
      if (!isComponentId(required)) {
        throw new CreatorError(
          "INVALID_TEMPLATE",
          `Catalog component ${id} requires unknown component ${String(required)}.`,
        );
      }
      visit(required);
    }
    visiting.delete(id);
    visited.add(id);
    components.push(id);
  };

  visit("base");
  for (const app of apps) {
    visit(app);
  }
  if (rust) {
    visit("rust");
  }
  return components;
}

function isComponentId(value: unknown): value is ComponentId {
  if (
    value === "base" ||
    value === "search-domain" ||
    value === "mac-filesystem" ||
    value === "rust"
  ) {
    return true;
  }
  return isAppId(value);
}

function presetFor(id: PresetId): PresetDescriptorLike {
  const descriptor = presets.find((entry) => entry.id === id);
  if (!descriptor) {
    throw new CreatorError("INVALID_TEMPLATE", `Catalog is missing preset ${id}.`);
  }
  return descriptor;
}

type PresetDescriptorLike = (typeof presets)[number];

/**
 * Combine config and explicit flag overrides into one deterministic plan.
 * Selection flags replace the config selection instead of merging with it.
 */
export function resolveOptions(
  config: CreatorConfig,
  overrides: CreatorOverrides,
  fallbackName: string,
): ResolvedOptions {
  const validatedConfig = validateConfig(config);
  const validatedOverrides = validateOverrides(overrides);

  const name = hasOwn(validatedOverrides, "name")
    ? assertName(validatedOverrides.name, "INVALID_ARGUMENT")
    : (validatedConfig.name ?? assertName(fallbackName, "INVALID_ARGUMENT"));

  const overrideHasPreset = hasOwn(validatedOverrides, "preset");
  const overrideHasApps = hasOwn(validatedOverrides, "apps");
  const configHasPreset = hasOwn(validatedConfig, "preset");
  const configHasApps = hasOwn(validatedConfig, "apps");

  let apps: readonly AppId[];
  let rustDefault: boolean;
  if (overrideHasPreset) {
    const preset = presetFor(validatedOverrides.preset as PresetId);
    apps = sortApps(preset.apps);
    rustDefault = preset.rust;
  } else if (overrideHasApps) {
    apps = normalizeOverrideApps(validatedOverrides.apps);
    rustDefault = false;
  } else if (configHasPreset) {
    const preset = presetFor(validatedConfig.preset as PresetId);
    apps = sortApps(preset.apps);
    rustDefault = preset.rust;
  } else if (configHasApps) {
    apps = sortApps(validatedConfig.apps ?? []);
    rustDefault = false;
  } else {
    const preset = presetFor("web");
    apps = sortApps(preset.apps);
    rustDefault = preset.rust;
  }

  const rust = hasOwn(validatedOverrides, "rust")
    ? (validatedOverrides.rust as boolean)
    : hasOwn(validatedConfig, "rust")
      ? (validatedConfig.rust as boolean)
      : rustDefault;
  const install = hasOwn(validatedOverrides, "install")
    ? (validatedOverrides.install as boolean)
    : (validatedConfig.install ?? false);
  const git = hasOwn(validatedOverrides, "git")
    ? (validatedOverrides.git as boolean)
    : (validatedConfig.git ?? false);

  return {
    name,
    apps,
    rust,
    install,
    git,
    components: resolveClosure(apps, rust),
  };
}
