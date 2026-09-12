/* eslint-disable */
import { basename, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

import {
  box,
  cancel,
  confirm,
  intro,
  isCancel,
  multiselect,
  note,
  outro,
  select,
  text,
} from "@clack/prompts";
import {
  catalog,
  CreatorError,
  isValidName,
  presets,
  resolveOptions,
  type AppId,
  type CreatorConfig,
  type CreatorOverrides,
  type PresetId,
  type ResolvedOptions,
} from "@domains/scaffolding";

import { parseApps, parsePreset, type CliArgs, toOverrides } from "./args.js";

export interface WizardResult {
  readonly destination: string;
  readonly overrides: CreatorOverrides;
}

export interface WizardOptions {
  readonly args: CliArgs;
  readonly config: CreatorConfig;
  readonly signal: AbortSignal;
  readonly plain: boolean;
}

const presetChoices = presets.map((preset) => ({
  value: preset.id,
  label: preset.label,
  hint: preset.hint,
}));
const appChoices = catalog
  .filter(
    (entry) =>
      entry.status === "available" &&
      (entry.id === "web" || entry.id === "cli" || entry.id === "mac"),
  )
  .map((entry) => ({
    value: entry.id as AppId,
    label: entry.label,
    hint: entry.requirements.join(", "),
  }));

function cancelled(): never {
  throw new CreatorError("CANCELLED", "Creation cancelled");
}

function checkSignal(signal: AbortSignal): void {
  if (signal.aborted) cancelled();
}

function checked<T>(value: T | symbol): T {
  if (isCancel(value)) cancelled();
  return value;
}

function currentSelection(config: CreatorConfig, overrides: MutableOverrides): boolean {
  return (
    overrides.preset !== undefined ||
    overrides.apps !== undefined ||
    config.preset !== undefined ||
    config.apps !== undefined
  );
}

type MutableOverrides = {
  name?: string;
  preset?: PresetId;
  apps?: readonly AppId[];
  rust?: boolean;
  install?: boolean;
  git?: boolean;
};

function setSelection(overrides: MutableOverrides, preset: PresetId): void {
  delete overrides.apps;
  overrides.preset = preset;
}

function setApps(overrides: MutableOverrides, apps: readonly AppId[]): void {
  delete overrides.preset;
  overrides.apps = apps;
}

function selectedSummary(options: ResolvedOptions): string {
  const components = options.components.join(", ");
  return `Apps: ${options.apps.length === 0 ? "none" : options.apps.join(", ")}\nComponents: ${components}\nInstall: ${options.install ? "yes" : "no"}\nGit: ${options.git ? "yes" : "no"}`;
}

function resolveForWizard(
  config: CreatorConfig,
  overrides: MutableOverrides,
  destination: string,
): ResolvedOptions {
  return resolveOptions(config, overrides, basename(resolve(destination)));
}

async function richText(
  message: string,
  placeholder: string,
  signal: AbortSignal,
): Promise<string> {
  checkSignal(signal);
  return checked(
    await text({
      message,
      placeholder,
      validate: (value) => ((value ?? "").trim().length === 0 ? "Enter a value" : undefined),
    }),
  );
}

async function richChoice<T>(
  message: string,
  options: readonly { value: T; label: string; hint?: string }[],
  signal: AbortSignal,
): Promise<T> {
  checkSignal(signal);
  const promptOptions = options.map((option) =>
    option.hint === undefined
      ? { value: option.value, label: option.label }
      : { value: option.value, label: option.label, hint: option.hint },
  );
  return checked(await select({ message, options: promptOptions as never }));
}

async function askRichDestination(args: CliArgs, signal: AbortSignal): Promise<string> {
  if (args.destination !== undefined) return args.destination;
  return richText("Where should the repository be created?", "my-product", signal);
}

async function askRichName(
  destination: string,
  overrides: MutableOverrides,
  signal: AbortSignal,
): Promise<void> {
  if (overrides.name !== undefined) return;
  const suggested = basename(resolve(destination));
  if (isValidName(suggested)) return;
  const entered = await richText(
    `Choose a valid package name (suggested: ${suggested})`,
    "my-product",
    signal,
  );
  overrides.name = entered;
}

async function askRichSelection(
  config: CreatorConfig,
  overrides: MutableOverrides,
  signal: AbortSignal,
): Promise<void> {
  if (currentSelection(config, overrides)) return;
  const choice = await richChoice(
    "Choose a starter",
    [
      ...presetChoices,
      {
        value: "custom" as const,
        label: "Custom combination",
        hint: "Choose apps and Rust independently",
      },
    ],
    signal,
  );
  if (choice === "custom") {
    const apps = checked(
      await multiselect({ message: "Choose applications", options: appChoices, required: false }),
    );
    setApps(overrides, apps);
    const rust = checked(
      await confirm({
        message: "Include the independent Rust search-index library?",
        initialValue: false,
      }),
    );
    overrides.rust = rust;
  } else {
    setSelection(overrides, choice);
  }
}

async function askRichSetup(
  config: CreatorConfig,
  overrides: MutableOverrides,
  signal: AbortSignal,
): Promise<void> {
  const installSupplied = overrides.install !== undefined || config.install !== undefined;
  const gitSupplied = overrides.git !== undefined || config.git !== undefined;
  if (installSupplied && gitSupplied) return;
  if (!installSupplied && !gitSupplied) {
    const choice = await richChoice(
      "How should setup run?",
      [
        { value: "both", label: "Install dependencies and initialize Git", hint: "Recommended" },
        { value: "install", label: "Install dependencies only" },
        { value: "git", label: "Initialize Git only" },
        { value: "none", label: "Files only" },
      ],
      signal,
    );
    overrides.install = choice === "both" || choice === "install";
    overrides.git = choice === "both" || choice === "git";
    return;
  }
  if (!installSupplied)
    overrides.install = checked(
      await confirm({ message: "Install dependencies?", initialValue: false }),
    );
  if (!gitSupplied)
    overrides.git = checked(
      await confirm({ message: "Initialize local Git?", initialValue: false }),
    );
}

function withoutSelection(config: CreatorConfig): CreatorConfig {
  const result = { ...config } as { -readonly [Key in keyof CreatorConfig]?: CreatorConfig[Key] };
  delete result.preset;
  delete result.apps;
  return result as CreatorConfig;
}

function withoutSetup(config: CreatorConfig): CreatorConfig {
  const result = { ...config } as { -readonly [Key in keyof CreatorConfig]?: CreatorConfig[Key] };
  delete result.install;
  delete result.git;
  return result as CreatorConfig;
}

async function richWizard(input: WizardOptions): Promise<WizardResult> {
  const { args, config, signal } = input;
  intro("Agentic Monorepo");
  process.stderr.write("A clear foundation for your next product.\n");
  const destination = await askRichDestination(args, signal);
  const overrides: MutableOverrides = { ...toOverrides(args) };
  await askRichName(destination, overrides, signal);
  await askRichSelection(config, overrides, signal);
  await askRichSetup(config, overrides, signal);

  while (true) {
    checkSignal(signal);
    let resolved: ResolvedOptions;
    try {
      resolved = resolveForWizard(config, overrides, destination);
    } catch (error) {
      if (
        error instanceof CreatorError &&
        error.code === "INVALID_ARGUMENT" &&
        overrides.name === undefined
      ) {
        overrides.name = await richText("Choose a valid package name", "my-product", signal);
        continue;
      }
      throw error;
    }
    box(selectedSummary(resolved), "Review");
    const action = await richChoice(
      "Ready to create?",
      [
        { value: "create", label: "Create repository" },
        { value: "starter", label: "Change starter" },
        { value: "location", label: "Change location/name" },
        { value: "setup", label: "Change setup" },
        { value: "cancel", label: "Cancel" },
      ],
      signal,
    );
    if (action === "create") {
      outro("Creating repository");
      return { destination, overrides };
    }
    if (action === "cancel") {
      cancel("Creation cancelled");
      cancelled();
    }
    if (action === "starter") {
      delete overrides.preset;
      delete overrides.apps;
      await askRichSelection(withoutSelection(config), overrides, signal);
    } else if (action === "location") {
      const next = await richText("Where should the repository be created?", destination, signal);
      const name = await richText(
        "Root package name",
        overrides.name ?? basename(resolve(next)),
        signal,
      );
      overrides.name = name;
      return { destination: next, overrides };
    } else {
      delete overrides.install;
      delete overrides.git;
      await askRichSetup(withoutSetup(config), overrides, signal);
    }
  }
}

async function plainQuestion(
  rl: ReturnType<typeof createInterface>,
  message: string,
  signal: AbortSignal,
): Promise<string> {
  checkSignal(signal);
  try {
    const answer = await rl.question(`${message}\n> `);
    if (answer.trim().length === 0) return plainQuestion(rl, message, signal);
    return answer.trim();
  } catch {
    cancelled();
  }
}

async function plainChoice(
  rl: ReturnType<typeof createInterface>,
  message: string,
  choices: readonly string[],
  signal: AbortSignal,
): Promise<number> {
  process.stderr.write(`\n${message}\n`);
  choices.forEach((choice, index) => process.stderr.write(`  ${index + 1}) ${choice}\n`));
  while (true) {
    const answer = await plainQuestion(rl, "Choose a number", signal);
    const selected = Number(answer);
    if (Number.isInteger(selected) && selected >= 1 && selected <= choices.length)
      return selected - 1;
    process.stderr.write(`Enter a number from 1 to ${choices.length}.\n`);
  }
}

async function plainWizard(input: WizardOptions): Promise<WizardResult> {
  const { args, config, signal } = input;
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: false });
  try {
    process.stderr.write("Agentic Monorepo\nA clear foundation for your next product.\n");
    const destination =
      args.destination ??
      (await plainQuestion(rl, "Where should the repository be created?", signal));
    const overrides: MutableOverrides = { ...toOverrides(args) };
    if (overrides.name === undefined) {
      const suggested = basename(resolve(destination));
      if (!isValidName(suggested))
        overrides.name = await plainQuestion(
          rl,
          `Root package name (suggested: ${suggested})`,
          signal,
        );
    }
    if (!currentSelection(config, overrides)) {
      const index = await plainChoice(
        rl,
        "Choose a starter",
        [...presetChoices.map((p) => `${p.label} — ${p.hint}`), "Custom combination"],
        signal,
      );
      if (index === presets.length) {
        const appIndex = await plainChoice(
          rl,
          "Choose an application",
          ["web", "cli", "mac", "none"],
          signal,
        );
        const apps: AppId[] =
          appIndex === 3 ? [] : [appChoices[appIndex]?.value ?? ("web" as AppId)];
        setApps(overrides, apps);
        const rust = await plainChoice(rl, "Include Rust?", ["No", "Yes"], signal);
        overrides.rust = rust === 1;
      } else {
        setSelection(overrides, presets[index]?.id ?? "web");
      }
    }
    await askPlainSetup(rl, config, overrides, signal);
    while (true) {
      let resolved: ResolvedOptions;
      try {
        resolved = resolveForWizard(config, overrides, destination);
      } catch (error) {
        if (
          error instanceof CreatorError &&
          error.code === "INVALID_ARGUMENT" &&
          overrides.name === undefined
        ) {
          overrides.name = await plainQuestion(rl, "Root package name", signal);
          continue;
        }
        throw error;
      }
      process.stderr.write(
        `\nReview\n${selectedSummary(resolved)}\nDestination: ${resolve(destination)}\n`,
      );
      const action = await plainChoice(
        rl,
        "Next action",
        ["Create repository", "Change starter", "Change location/name", "Change setup", "Cancel"],
        signal,
      );
      if (action === 0) return { destination, overrides };
      if (action === 4) cancelled();
      if (action === 1) {
        delete overrides.preset;
        delete overrides.apps;
        const index = await plainChoice(
          rl,
          "Choose a starter",
          [...presetChoices.map((p) => p.label), "Custom combination"],
          signal,
        );
        if (index === presets.length) setApps(overrides, []);
        else setSelection(overrides, presets[index]?.id ?? "web");
      } else if (action === 2) {
        const next = await plainQuestion(rl, "Where should the repository be created?", signal);
        const name = await plainQuestion(rl, "Root package name", signal);
        overrides.name = name;
        return { destination: next, overrides };
      } else {
        delete overrides.install;
        delete overrides.git;
        await askPlainSetup(rl, withoutSetup(config), overrides, signal);
      }
    }
  } finally {
    rl.close();
  }
}

async function askPlainSetup(
  rl: ReturnType<typeof createInterface>,
  config: CreatorConfig,
  overrides: MutableOverrides,
  signal: AbortSignal,
): Promise<void> {
  const installSupplied = overrides.install !== undefined || config.install !== undefined;
  const gitSupplied = overrides.git !== undefined || config.git !== undefined;
  if (installSupplied && gitSupplied) return;
  if (!installSupplied && !gitSupplied) {
    const index = await plainChoice(
      rl,
      "How should setup run?",
      ["Install and Git", "Install only", "Git only", "Files only"],
      signal,
    );
    overrides.install = index === 0 || index === 1;
    overrides.git = index === 0 || index === 2;
  } else {
    if (!installSupplied)
      overrides.install =
        (await plainChoice(rl, "Install dependencies?", ["No", "Yes"], signal)) === 1;
    if (!gitSupplied)
      overrides.git = (await plainChoice(rl, "Initialize local Git?", ["No", "Yes"], signal)) === 1;
  }
}

export async function runWizard(input: WizardOptions): Promise<WizardResult> {
  return input.plain ? plainWizard(input) : richWizard(input);
}

export { parseApps, parsePreset };
