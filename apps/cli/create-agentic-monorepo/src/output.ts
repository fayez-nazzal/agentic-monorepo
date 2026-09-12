/* eslint-disable */
import type { CatalogDescriptor, PresetDescriptor } from "@domains/scaffolding";
import type { SetupResult, TemplateSnapshot } from "@platform/node-scaffolding";
import pc from "picocolors";

export interface JsonCreatedResult {
  readonly schemaVersion: 1;
  readonly status: "created" | "planned";
  readonly directory: string;
  readonly name: string;
  readonly apps: readonly string[];
  readonly rust: boolean;
  readonly templateVersion: string;
  readonly templateDigest: string;
  readonly setup: SetupResult;
  readonly nextSteps: readonly string[];
}

export interface JsonErrorResult {
  readonly schemaVersion: 1;
  readonly status: "error" | "cancelled";
  readonly code: string;
  readonly message: string;
  readonly directory: string | null;
  readonly repositoryCreated: boolean;
  readonly nextSteps: readonly string[];
}

export interface JsonCatalogResult {
  readonly schemaVersion: 1;
  readonly status: "catalog";
  readonly presets: readonly PresetDescriptor[];
  readonly capabilities: readonly CatalogDescriptor[];
}

export function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

export function stripAnsi(value: string): string {
  return value.replace(
    /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g,
    "",
  );
}

export function cleanDiagnostic(value: string): string {
  return stripAnsi(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

export function printHelp(stream: NodeJS.WritableStream = process.stdout): void {
  stream.write(
    `create-agentic-monorepo [destination]\n\nCreate a repository from the Agentic Monorepo starter.\n\nOptions:\n  --name <name>             Root package/repository name\n  --preset <id>             web, cli, mac, web-cli, full, or workspace\n  --apps <csv>              web, cli, mac, or none\n  --rust / --no-rust       Include the independent Rust library\n  --install / --no-install Install dependencies with pinned pnpm\n  --git / --no-git         Initialize local Git\n  --config <path>           Read a strict JSON configuration\n  --yes, -y                Do not prompt (defaults to web)\n  --dry-run                Print the plan without writing or running commands\n  --json                   Emit one machine-readable result on stdout\n  --plain                  Use accessible line-oriented prompts\n  --list                   List supported and Coming soon capabilities\n  --help, -h               Show this help\n  --version, -v            Show the creator version\n`,
  );
}

export function printList(
  presets: readonly PresetDescriptor[],
  capabilities: readonly CatalogDescriptor[],
  json: boolean,
): void {
  if (json) {
    writeJson({
      schemaVersion: 1,
      status: "catalog",
      presets,
      capabilities,
    } satisfies JsonCatalogResult);
    return;
  }
  const lines = ["Supported starters", ""];
  for (const preset of presets) lines.push(`  ${preset.label} — ${preset.hint}`);
  lines.push("", "Capabilities");
  for (const capability of capabilities) {
    const badge = capability.status === "available" ? "Available" : "Coming soon";
    const requirements =
      capability.requirements.length > 0 ? ` (${capability.requirements.join(", ")})` : "";
    lines.push(`  ${badge}: ${capability.label} — ${capability.hint}${requirements}`);
  }
  lines.push(
    "",
    "Host prerequisites: creator, web, and CLI output run on macOS, Linux, and Windows; Mac code needs macOS 14+ and Swift 6; Rust needs Rust 1.97.1.",
  );
  process.stdout.write(`${lines.join("\n")}\n`);
}

export function printPlan(
  directory: string,
  name: string,
  apps: readonly string[],
  rust: boolean,
  template: TemplateSnapshot,
  install: boolean,
  git: boolean,
): readonly string[] {
  const actions = ["create files"];
  if (install) actions.push("install dependencies");
  if (git) actions.push("initialize local Git");
  const lines = [
    `Plan for ${name}`,
    `  destination: ${directory}`,
    `  apps: ${apps.length === 0 ? "none" : apps.join(", ")}`,
    `  libraries: ${rust ? "Rust search-index" : "none"}`,
    `  files: ${template.files.length}`,
    `  actions: ${actions.join(", ")}`,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
  return actions;
}

function shellQuote(value: string): string {
  if (process.platform === "win32")
    return `Set-Location -LiteralPath '${value.replaceAll("'", "''")}'`;
  return `cd -- '${value.replaceAll("'", "'\\''")}'`;
}

export function nextSteps(
  directory: string,
  apps: readonly string[],
  rust: boolean,
  setup: SetupResult,
): string[] {
  const result = [shellQuote(directory)];
  if (setup.install !== "completed") result.push("pnpm install --frozen-lockfile");
  const first = apps[0];
  if (first === "web")
    result.push("pnpm nx run web-example-app:build", "pnpm nx run web-example-app:dev");
  else if (first === "cli")
    result.push("pnpm nx run cli-example-app:build", "pnpm nx run cli-example-app:start -- demo");
  else if (first === "mac")
    result.push("pnpm nx run mac-example-app:build", "pnpm nx run mac-example-app:run");
  else if (rust) result.push("pnpm nx run search-index:build", "pnpm nx run search-index:test");
  else result.push("pnpm nx run-many -t typecheck build test lint");
  return result;
}

export function printSuccess(
  directory: string,
  name: string,
  apps: readonly string[],
  rust: boolean,
  template: TemplateSnapshot,
  setup: SetupResult,
  json: boolean,
  planned = false,
): void {
  const steps = nextSteps(directory, apps, rust, setup);
  if (json) {
    writeJson({
      schemaVersion: 1,
      status: planned ? "planned" : "created",
      directory,
      name,
      apps,
      rust,
      templateVersion: template.creatorVersion,
      templateDigest: template.digest,
      setup: planned ? { install: "skipped", git: "skipped" } : setup,
      nextSteps: steps,
    } satisfies JsonCreatedResult);
    return;
  }
  const heading = planned ? "Planned" : "Created";
  process.stderr.write(`${pc.cyan(pc.bold(heading))} ${name}\n\n`);
  process.stderr.write(`  ${directory}\n`);
  process.stderr.write(
    `  apps: ${apps.length === 0 ? "none" : apps.join(", ")}${rust ? "; Rust search-index" : ""}\n`,
  );
  process.stderr.write(`  install: ${setup.install}; git: ${setup.git}\n\n`);
  process.stderr.write(`${pc.bold("Next")}\n${steps.map((step) => `  ${step}`).join("\n")}\n`);
  if (apps.includes("mac") && process.platform !== "darwin") {
    process.stderr.write(`${pc.yellow("Warning")}: Mac commands require macOS 14+ and Swift 6.\n`);
  }
}

export function printError(result: JsonErrorResult, json: boolean): void {
  if (json) {
    writeJson(result);
    return;
  }
  process.stderr.write(
    `${pc.red(pc.bold(result.status === "cancelled" ? "Cancelled" : "Error"))}: ${cleanDiagnostic(result.message)}\n`,
  );
  for (const step of result.nextSteps) process.stderr.write(`  Next: ${cleanDiagnostic(step)}\n`);
}
