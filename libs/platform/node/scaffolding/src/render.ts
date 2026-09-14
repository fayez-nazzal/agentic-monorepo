/* eslint-disable */
import {
  catalog,
  CreatorError,
  type CatalogDescriptor,
  type ComponentId,
  type ResolvedOptions,
} from "@domains/scaffolding";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import {
  calculateTemplateDigest,
  type TemplateFile,
  type TemplateSnapshot,
  validateTemplatePath,
} from "./template.js";

const APP_PATHS: Record<string, string> = {
  web: "apps/web/example-app",
  cli: "apps/cli/example-app",
  mac: "apps/mac/example-app",
};
const IMPORTER_PATHS: Record<string, string> = {
  web: "apps/web/example-app",
  cli: "apps/cli/example-app",
};

export interface RenderedFile {
  readonly path: string;
  readonly mode: 420 | 493;
  readonly text: string;
}

function invalid(message: string, cause?: unknown): CreatorError {
  return new CreatorError("INVALID_TEMPLATE", message, cause === undefined ? undefined : { cause });
}

function descriptors(): readonly CatalogDescriptor[] {
  const source = catalog as unknown;
  if (Array.isArray(source)) {
    return source as readonly CatalogDescriptor[];
  }
  if (typeof source === "object" && source !== null) {
    return Object.values(source as Record<string, CatalogDescriptor>);
  }
  throw invalid("Scaffolding catalog is not an object or array");
}

function normalizeSource(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function parseJson(text: string, path: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("expected an object");
    }
    return value as Record<string, unknown>;
  } catch (cause) {
    throw invalid(`Template member ${path} is not a JSON object`, cause);
  }
}

function selectedSourcePaths(options: ResolvedOptions): readonly string[] {
  const selected = new Set(options.components);
  const paths: string[] = [];
  for (const descriptor of descriptors()) {
    if (!selected.has(descriptor.id as ComponentId) || descriptor.status !== "available") continue;
    for (const sourcePath of descriptor.sourcePaths) paths.push(sourcePath);
  }
  return paths;
}

function pathMatches(path: string, sourcePath: string): boolean {
  return path === sourcePath || path.startsWith(`${sourcePath}/`);
}

function renderPackage(text: string, options: ResolvedOptions): string {
  const packageJson = parseJson(text, "package.json");
  packageJson.name = options.name;
  packageJson.private = true;
  const roots = options.components
    .filter(
      (component) =>
        component === "web" ||
        component === "cli" ||
        component === "mac" ||
        component === "search-domain" ||
        component === "mac-filesystem",
    )
    .map(
      (component) =>
        APP_PATHS[component] ??
        (component === "search-domain" ? "libs/domains/search" : "libs/platform/mac/filesystem"),
    );
  const lintRoots = roots.length === 0 ? ["tools"] : [...roots, "tools"];
  packageJson.scripts = {
    ...(typeof packageJson.scripts === "object" && packageJson.scripts !== null
      ? packageJson.scripts
      : {}),
    lint: `oxlint ${lintRoots.join(" ")} && node tools/check-boundaries.mjs`,
  };
  return `${JSON.stringify(packageJson, null, 2)}\n`;
}

function selectedImporters(options: ResolvedOptions): Set<string> {
  const result = new Set<string>(["."]);
  for (const app of options.apps) {
    const importer = IMPORTER_PATHS[app];
    if (importer !== undefined) result.add(importer);
  }
  if (options.apps.some((app) => app === "web" || app === "cli")) {
    result.add("libs/domains/search");
  }
  return result;
}

function renderLockfile(text: string, options: ResolvedOptions, variant?: string): string {
  const source = variant ?? text;
  let document: unknown;
  try {
    document = parseYaml(source) as unknown;
  } catch (cause) {
    throw invalid("Template lockfile is not valid YAML", cause);
  }
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    throw invalid("Template lockfile must be a YAML object");
  }
  const lockfile = document as Record<string, unknown>;
  if (lockfile.lockfileVersion !== "9.0" && lockfile.lockfileVersion !== 9) {
    throw invalid("Template lockfile must use lockfileVersion 9.0");
  }
  if (
    typeof lockfile.importers !== "object" ||
    lockfile.importers === null ||
    Array.isArray(lockfile.importers)
  ) {
    throw invalid("Template lockfile has no importer map");
  }
  const importers = lockfile.importers as Record<string, unknown>;
  const keep = selectedImporters(options);
  for (const key of Object.keys(importers)) {
    if (!keep.has(key)) delete importers[key];
  }
  for (const key of keep) {
    if (importers[key] === undefined) {
      throw invalid(`Template lockfile is missing selected importer ${key}`);
    }
  }
  return normalizeSource(stringifyYaml(lockfile));
}

function renderNx(text: string): string {
  const nx = parseJson(text, "nx.json");
  if (typeof nx.analytics !== "boolean")
    throw invalid('Template member nx.json["analytics"] must be a boolean');
  const match = text.match(/("analytics"\s*:\s*)(true|false)/);
  if (match === null || match.index === undefined)
    throw invalid('Template nx.json is missing the "analytics" key');
  const rendered = `${text.slice(0, match.index)}${match[1]}false${text.slice(match.index + match[0].length)}`;
  return rendered.endsWith("\n") ? rendered : `${rendered}\n`;
}

function renderConfig(options: ResolvedOptions, template: TemplateSnapshot): string {
  return `{
  "schemaVersion": 1,
  "name": ${JSON.stringify(options.name)},
  "apps": [${options.apps.map((app) => JSON.stringify(app)).join(", ")}],
  "rust": ${JSON.stringify(options.rust)},
  "templateVersion": ${JSON.stringify(template.creatorVersion)},
  "templateDigest": ${JSON.stringify(template.digest)}
}
`;
}

function renderReadme(options: ResolvedOptions, template: TemplateSnapshot): string {
  const selected =
    options.apps.length === 0
      ? "an empty workspace"
      : options.apps.map((app) => `${app} starter`).join(", ");
  const appLines =
    options.apps.length === 0
      ? "- No application is included yet. Add a domain and app following docs/architecture.md."
      : options.apps.map((app) => `- ${APP_PATHS[app]} (${app})`).join("\n");
  const buildLines =
    options.apps.length === 0
      ? "pnpm nx run-many -t typecheck build test lint"
      : options.apps.map((app) => `pnpm nx run ${app}-example-app:build`).join("\n");
  const developCommands: Record<string, string> = {
    web: "pnpm nx run web-example-app:dev",
    cli: "pnpm nx run cli-example-app:start -- demo",
    mac: "pnpm nx run mac-example-app:run",
  };
  const developSection =
    options.apps.length === 0
      ? ""
      : `## Develop\n\n\`\`\`sh\n${options.apps.map((app) => developCommands[app]).join("\n")}\n\`\`\`\n\nIf you change a library, rebuild it before the running development server picks it up.\n\n`;
  const checkCommands = [
    buildLines,
    "pnpm nx run-many -t typecheck build test lint",
    "pnpm architecture:acceptance",
    "node tools/preflight-tui.mjs --smoke",
    "pnpm format:check",
  ].join("\n");
  return `# ${options.name}\n\nThis repository contains ${selected}, generated from Agentic Monorepo (template ${template.creatorVersion}). Examples are intentionally small and should be replaced with your product's real domains.\n\n## Included projects\n\n${appLines}\n${options.rust ? "- libs/rust/search-index (independent Rust library)\n" : ""}\n${developSection}## Checks\n\n\`\`\`sh\n${checkCommands}\n\`\`\`\n\n## Architecture pre-flight\n\nBefore adding a domain, app, or concept, run \`node tools/check-boundaries.mjs --preflight plan.json\` or use \`pnpm preflight:tui\`. A blocked verdict means do not write the change; choose the legal change described by the diagnostic. Ownership transfers require a human-reviewed manifest change. The same concept name is legal in different domains because the registry keys \`(domain, concept)\`.\n\nReplay this selection with npx create-agentic-monorepo ${options.name} --config ./agentic.config.json. The generated examples use the shared search domain where applicable; Rust is independent and is not wired into an application.\n`;
}

function renderWorkflow(options: ResolvedOptions): string {
  const steps: Array<Record<string, unknown>> = [
    { id: "checkout", uses: "actions/checkout@v4" },
    { id: "setup-pnpm", uses: "pnpm/action-setup@v4" },
    {
      id: "setup-node",
      uses: "actions/setup-node@v4",
      with: { "node-version": 22, cache: "pnpm" },
    },
  ];
  if (options.apps.includes("mac"))
    steps.push({ id: "setup-swiftlint", run: "brew install swiftlint" });
  if (options.rust)
    steps.push({
      id: "setup-rust",
      run: "rustup toolchain install 1.97.1 --profile minimal --component clippy --component rustfmt",
    });
  steps.push(
    { id: "install-dependencies", run: "pnpm install --frozen-lockfile" },
    { id: "architecture-acceptance", run: "pnpm architecture:acceptance" },
    { id: "preflight-tui-smoke", run: "node tools/preflight-tui.mjs --smoke" },
    { id: "verify-workspace", run: "pnpm nx run-many -t typecheck build test lint" },
    { id: "check-format", run: "pnpm format:check" },
  );
  return `${stringifyYaml({
    name: "ci",
    on: { push: { branches: ["main"] }, pull_request: {} },
    jobs: {
      verify: { "runs-on": options.apps.includes("mac") ? "macos-latest" : "ubuntu-latest", steps },
    },
  })}`;
}

/** Render a complete selected repository before any destination mutation. */
export function renderRepository(
  template: TemplateSnapshot,
  options: ResolvedOptions,
): readonly RenderedFile[] {
  const sourcePaths = selectedSourcePaths(options);
  const selectedFiles = template.files.filter((file) =>
    sourcePaths.some((sourcePath) => pathMatches(file.path, sourcePath)),
  );
  if (!selectedFiles.some((file) => file.path === "package.json")) {
    throw invalid("Selected template does not include package.json");
  }
  const files = new Map<string, RenderedFile>();
  for (const file of selectedFiles) {
    if (!validateTemplatePath(file.path))
      throw invalid(`Invalid selected template path ${file.path}`);
    files.set(file.path, { path: file.path, mode: file.mode, text: normalizeSource(file.text) });
  }

  const lockKey = `${options.apps.join("+") || "none"};rust=${options.rust ? "1" : "0"}`;
  const variant = template.variantLockfiles?.[lockKey];
  for (const file of files.values()) {
    if (file.path === "package.json")
      files.set(file.path, { ...file, text: renderPackage(file.text, options) });
    else if (file.path === "pnpm-lock.yaml")
      files.set(file.path, { ...file, text: renderLockfile(file.text, options, variant) });
    else if (file.path === "nx.json") files.set(file.path, { ...file, text: renderNx(file.text) });
    else if (file.path === ".github/workflows/ci.yml")
      files.set(file.path, { ...file, text: renderWorkflow(options) });
  }
  files.set("agentic.config.json", {
    path: "agentic.config.json",
    mode: 420,
    text: renderConfig(options, template),
  });
  files.set("README.md", { path: "README.md", mode: 420, text: renderReadme(options, template) });
  const rendered = [...files.values()].sort((left, right) => left.path.localeCompare(right.path));
  const seen = new Set<string>();
  for (const file of rendered) {
    if (seen.has(file.path)) throw invalid(`Duplicate rendered path ${file.path}`);
    seen.add(file.path);
  }
  return rendered;
}

export function verifyRenderedDigest(
  files: readonly TemplateFile[],
  variantLockfiles?: Readonly<Record<string, string>>,
): string {
  return calculateTemplateDigest(
    variantLockfiles === undefined ? { files } : { files, variantLockfiles },
  );
}
