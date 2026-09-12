#!/usr/bin/env node
/* eslint-disable */

import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import {
  catalog,
  CreatorError,
  presets,
  resolveOptions,
  type CreatorConfig,
  type CreatorOverrides,
  type ResolvedOptions,
} from "@domains/scaffolding";
import {
  createRepository,
  inspectDestination,
  loadTemplate,
  readConfig,
  runSetup,
  type SetupResult,
  type TemplateSnapshot,
} from "@platform/node-scaffolding";

import { hasSelection, parseCliArgs, toOverrides, type CliArgs } from "./args.js";
import {
  cleanDiagnostic,
  printError,
  printHelp,
  printList,
  printPlan,
  printSuccess,
  type JsonErrorResult,
} from "./output.js";

const packageMetadataUrl = new URL("../package.json", import.meta.url);
const templateAssetUrl = new URL("../template.json", import.meta.url);

interface PackageMetadata {
  readonly name: string;
  readonly version: string;
}

function isTruthyCi(value: string | undefined): boolean {
  return value !== undefined && value !== "" && value !== "0" && value !== "false";
}

function defaultSetup(): SetupResult {
  return { install: "skipped", git: "skipped" };
}

function errorCode(error: unknown): string {
  return error instanceof CreatorError ? error.code : "WRITE_FAILED";
}

function exitCode(error: unknown, signalCode: number): number {
  if (signalCode !== 0) return signalCode;
  if (error instanceof CreatorError) {
    if (error.code === "CANCELLED") return 130;
    if (
      error.code === "INVALID_ARGUMENT" ||
      error.code === "INVALID_CONFIG" ||
      error.code === "UNSUPPORTED_OPTION" ||
      error.code === "UNSUPPORTED_RUNTIME" ||
      error.code === "TEMPLATE_MISMATCH" ||
      error.code === "DESTINATION_CONFLICT"
    )
      return 2;
  }
  return 1;
}

async function readPackageMetadata(): Promise<PackageMetadata> {
  const value: unknown = JSON.parse(await readFile(packageMetadataUrl, "utf8"));
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as { name?: unknown }).name !== "string" ||
    typeof (value as { version?: unknown }).version !== "string"
  ) {
    throw new CreatorError("INVALID_TEMPLATE", "The staged package manifest is invalid");
  }
  return value as PackageMetadata;
}

function selectionInConfig(config: CreatorConfig): boolean {
  return config.preset !== undefined || config.apps !== undefined;
}

function checkTemplatePins(config: CreatorConfig, template: TemplateSnapshot): void {
  if (config.templateVersion !== undefined && config.templateVersion !== template.creatorVersion) {
    throw new CreatorError(
      "TEMPLATE_MISMATCH",
      `Configuration requires creator version ${config.templateVersion}; use create-agentic-monorepo@${config.templateVersion} or remove the templateVersion pin`,
    );
  }
  if (config.templateDigest !== undefined && config.templateDigest !== template.digest) {
    throw new CreatorError(
      "TEMPLATE_MISMATCH",
      `Configuration requires template digest ${config.templateDigest}; use the pinned creator or remove the templateDigest pin`,
    );
  }
}

function noninteractive(args: CliArgs): boolean {
  return (
    args.yes ||
    args.json ||
    isTruthyCi(process.env["CI"]) ||
    !process.stdin.isTTY ||
    !process.stdout.isTTY ||
    !process.stderr.isTTY
  );
}

function plannedSteps(options: ResolvedOptions): string[] {
  const steps = ["create files"];
  if (options.install) steps.push("install dependencies");
  if (options.git) steps.push("initialize local Git");
  return steps;
}

function makeErrorResult(
  error: unknown,
  directory: string | null,
  repositoryCreated: boolean,
  signalCode: number,
): JsonErrorResult {
  const cancelled =
    signalCode !== 0 || (error instanceof CreatorError && error.code === "CANCELLED");
  const message = error instanceof Error ? error.message : "Creator failed";
  const nextSteps = repositoryCreated
    ? ["cd to the generated directory", "pnpm install --frozen-lockfile"]
    : [];
  return {
    schemaVersion: 1,
    status: cancelled ? "cancelled" : "error",
    code: cancelled ? "CANCELLED" : errorCode(error),
    message: cleanDiagnostic(message),
    directory,
    repositoryCreated,
    nextSteps,
  };
}

async function run(argv: readonly string[]): Promise<number> {
  let args: CliArgs;
  try {
    args = parseCliArgs(argv);
  } catch (error) {
    const json = argv.includes("--json");
    const result = makeErrorResult(error, null, false, 0);
    printError(result, json);
    return exitCode(error, 0);
  }

  if (args.help) {
    printHelp();
    return 0;
  }
  if (args.version) {
    const metadata = await readPackageMetadata();
    process.stdout.write(`${metadata.version}\n`);
    return 0;
  }
  if (args.list) {
    printList(presets, catalog, args.json);
    return 0;
  }

  let destination: string | undefined = args.destination;
  let repositoryCreated = false;
  let signalCode = 0;
  const controller = new AbortController();
  const onInterrupt = (): void => {
    signalCode = 130;
    controller.abort();
  };
  const onTerminate = (): void => {
    signalCode = 143;
    controller.abort();
  };
  process.once("SIGINT", onInterrupt);
  process.once("SIGTERM", onTerminate);

  try {
    const config: CreatorConfig =
      args.config === undefined ? { schemaVersion: 1 } : await readConfig(args.config);
    let overrides: CreatorOverrides = toOverrides(args);
    if (!noninteractive(args)) {
      const { runWizard } = await import("./wizard.js");
      const wizardResult = await runWizard({
        args,
        config,
        signal: controller.signal,
        plain: args.plain || process.env["TERM"] === "dumb",
      });
      destination = wizardResult.destination;
      overrides = wizardResult.overrides;
    } else {
      if (destination === undefined)
        throw new CreatorError(
          "INVALID_ARGUMENT",
          "A destination is required in noninteractive mode; for example: create-agentic-monorepo my-product --preset web --yes",
        );
      if (!hasSelection(args) && !selectionInConfig(config)) {
        if (args.yes) overrides = { ...overrides, preset: "web" };
        else
          throw new CreatorError(
            "INVALID_ARGUMENT",
            "A starter selection is required in noninteractive mode; use --preset web, --apps web, or --yes",
          );
      }
    }

    if (destination === undefined)
      throw new CreatorError("INVALID_ARGUMENT", "A destination is required");
    const fallbackName = basename(resolve(destination));
    const options = resolveOptions(config, overrides, fallbackName);
    const template = await loadTemplate(templateAssetUrl);
    const packageMetadata = await readPackageMetadata();
    if (template.creatorVersion !== packageMetadata.version) {
      throw new CreatorError(
        "TEMPLATE_MISMATCH",
        `Bundled template ${template.creatorVersion} does not match creator ${packageMetadata.version}`,
      );
    }
    checkTemplatePins(config, template);

    const inspected = await inspectDestination(destination);
    if (args.dryRun) {
      if (args.json) {
        printSuccess(
          inspected.path,
          options.name,
          options.apps,
          options.rust,
          template,
          defaultSetup(),
          true,
          true,
        );
      } else {
        printPlan(
          inspected.path,
          options.name,
          options.apps,
          options.rust,
          template,
          options.install,
          options.git,
        );
      }
      return 0;
    }

    process.stderr.write("Validating destination and template...\n");
    process.stderr.write("Creating files...\n");
    await createRepository(template, options, inspected, controller.signal);
    repositoryCreated = true;
    let setup = defaultSetup();
    if (options.install || options.git) {
      process.stderr.write("Running requested setup...\n");
      setup = await runSetup(
        destination,
        { install: options.install, git: options.git },
        controller.signal,
        (text) => {
          process.stderr.write(`${cleanDiagnostic(text)}\n`);
        },
      );
    }
    printSuccess(
      inspected.path,
      options.name,
      options.apps,
      options.rust,
      template,
      setup,
      args.json,
    );
    return 0;
  } catch (error) {
    const result = makeErrorResult(
      error,
      destination === undefined ? null : resolve(destination),
      repositoryCreated,
      signalCode,
    );
    printError(result, args.json);
    return exitCode(error, signalCode);
  } finally {
    process.removeListener("SIGINT", onInterrupt);
    process.removeListener("SIGTERM", onTerminate);
  }
}

const exitStatus = await run(process.argv.slice(2));
process.exitCode = exitStatus;
