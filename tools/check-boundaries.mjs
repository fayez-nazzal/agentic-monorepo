/* eslint-disable curly, init-declarations, max-depth, max-lines-per-function, max-statements, no-array-sort, no-continue */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const failureExitCode = 1;
const typeTags = new Set([
  "type:app",
  "type:domain",
  "type:platform",
  "type:infrastructure",
  "type:rust",
  "type:binding",
]);

const allowedDependencyTags = {
  "type:app": ["type:domain", "type:platform", "type:infrastructure", "type:binding"],
  "type:domain": ["type:domain", "type:binding"],
  "type:platform": ["type:platform", "type:domain"],
  "type:infrastructure": ["type:infrastructure", "type:platform", "type:domain"],
  "type:rust": ["type:rust"],
  "type:binding": ["type:rust"],
};

const bindingEcosystemLanguages = {
  "binding:node": ["lang:ts"],
  "binding:swift": ["lang:swift"],
};
const ffiCratePrefixes = ["napi", "uniffi"];

function loadGraph() {
  const tempDir = mkdtempSync(join(tmpdir(), "boundaries-graph-"));
  const graphFile = join(tempDir, "graph.json");
  try {
    execFileSync("pnpm", ["exec", "nx", "graph", `--file=${graphFile}`], { stdio: "pipe" });
    return JSON.parse(readFileSync(graphFile, "utf8")).graph;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function tagsOf(node) {
  return node.data.tags ?? [];
}

function hasAnyTag(tags, allowed) {
  return tags.some((tag) => allowed.includes(tag));
}

function typeTagViolations(graph) {
  const found = [];
  for (const [name, node] of Object.entries(graph.nodes)) {
    const tags = tagsOf(node);
    const recognized = tags.filter((tag) => typeTags.has(tag));
    if (node.data.root !== "." && recognized.length === 0) {
      found.push(`${name} has no recognized type tag`);
    }
    if (recognized.length > 1) {
      found.push(`${name} has multiple recognized type tags: ${recognized.join(", ")}`);
    }
  }
  return found;
}

function bindingTagsOf(tags) {
  return tags.filter((tag) => Object.hasOwn(bindingEcosystemLanguages, tag));
}

function languageTagsOf(tags) {
  return tags.filter((tag) => tag.startsWith("lang:"));
}

function bindingTagViolations(graph) {
  const found = [];
  for (const [name, node] of Object.entries(graph.nodes)) {
    const tags = tagsOf(node);
    const ecosystems = bindingTagsOf(tags);
    if (tags.includes("type:binding") && ecosystems.length !== 1) {
      found.push(`${name} carries type:binding without exactly one known binding tag`);
    }
    if (!tags.includes("type:binding") && ecosystems.length > 0) {
      found.push(`${name} carries a binding tag without type:binding`);
    }
    if (tags.includes("type:binding") && !tags.includes("lang:rust")) {
      found.push(`${name} binding must carry lang:rust`);
    }
  }
  return found;
}

function ecosystemViolations(sourceName, sourceTags, targetName, targetTags) {
  const found = [];
  for (const targetTag of bindingTagsOf(targetTags)) {
    const allowedLanguages = bindingEcosystemLanguages[targetTag];
    if (!hasAnyTag(sourceTags, allowedLanguages) && !sourceTags.includes(targetTag)) {
      found.push(
        `${sourceName} may not depend on ${targetName} outside the ${targetTag} ecosystem`,
      );
    }
  }
  return found;
}

function languageMismatchViolations(sourceName, sourceTags, targetName, targetTags) {
  if (sourceTags.includes("type:binding") || targetTags.includes("type:binding")) {
    return [];
  }
  const sourceLanguages = languageTagsOf(sourceTags);
  const targetLanguages = languageTagsOf(targetTags);
  if (sourceLanguages.length !== 1 || targetLanguages.length !== 1) {
    return [];
  }
  if (sourceLanguages[0] === targetLanguages[0]) {
    return [];
  }
  return [
    `${sourceName} (${sourceLanguages[0]}) may not depend on ${targetName} (${targetLanguages[0]}) across languages`,
  ];
}

function dependencyViolations(sourceName, sourceTags, targetName, targetTags) {
  const found = [];
  if (targetTags.includes("type:app")) {
    found.push(`${sourceName} depends on application ${targetName}`);
  }
  for (const sourceTag of sourceTags) {
    const allowed = allowedDependencyTags[sourceTag];
    if (allowed && !hasAnyTag(targetTags, allowed)) {
      found.push(`${sourceName} (${sourceTag}) may not depend on ${targetName}`);
    }
    if (sourceTag.startsWith("domain:") && !targetTags.includes(sourceTag)) {
      found.push(`${sourceName} (${sourceTag}) may not depend on ${targetName} outside its domain`);
    }
  }
  return [
    ...found,
    ...ecosystemViolations(sourceName, sourceTags, targetName, targetTags),
    ...languageMismatchViolations(sourceName, sourceTags, targetName, targetTags),
  ];
}

function graphViolations(graph) {
  const found = [];
  for (const [sourceName, dependencies] of Object.entries(graph.dependencies)) {
    const sourceNode = graph.nodes[sourceName];
    if (sourceNode) {
      const sourceTags = tagsOf(sourceNode);
      for (const dependency of dependencies) {
        const targetNode = graph.nodes[dependency.target];
        if (targetNode) {
          found.push(
            ...dependencyViolations(sourceName, sourceTags, dependency.target, tagsOf(targetNode)),
          );
        }
      }
    }
  }
  return found;
}

function stripTomlComment(line) {
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"' && line[index - 1] !== "\\") {
      quoted = !quoted;
    }
    if (line[index] === "#" && !quoted) {
      return line.slice(0, index);
    }
  }
  return line;
}

function parseDependencyCrates(manifest) {
  const crates = [];
  let inDependencyTable = false;
  for (const rawLine of manifest.split(/\r?\n/u)) {
    const line = stripTomlComment(rawLine).trim();
    const header = line.match(/^\[(?<name>[^\]]+)\]$/u);
    if (header) {
      inDependencyTable = /(?:^|\.)dependencies(?:\.|$)/u.test(header.groups.name.trim());
      continue;
    }
    if (!inDependencyTable) continue;
    const entry = line.match(
      /^(?:"(?<double>[^"]+)"|'(?<single>[^']+)'|(?<bare>[A-Za-z0-9_-]+))\s*=\s*(?<value>.*)$/u,
    );
    if (!entry) continue;
    const crate = entry.groups.double ?? entry.groups.single ?? entry.groups.bare;
    const packageMatch = entry.groups.value.match(/\bpackage\s*=\s*["'](?<name>[^"']+)["']/u);
    crates.push(crate);
    if (packageMatch) crates.push(packageMatch.groups.name);
  }
  return crates;
}

function ffiDependencyViolations(name, manifestPath) {
  let manifest;
  try {
    manifest = readFileSync(manifestPath, "utf8");
  } catch {
    return [];
  }
  const crates = new Set(
    parseDependencyCrates(manifest).filter((crate) =>
      ffiCratePrefixes.some((prefix) => crate === prefix || crate.startsWith(`${prefix}-`)),
    ),
  );
  return [...crates]
    .sort((left, right) => left.localeCompare(right))
    .map((crate) => `core crate ${name} must stay FFI-free; move ${crate} into a binding crate`);
}

function ffiViolations(graph) {
  const found = [];
  for (const [name, node] of Object.entries(graph.nodes)) {
    const tags = tagsOf(node);
    if (tags.includes("type:rust") && !tags.includes("type:binding")) {
      found.push(...ffiDependencyViolations(name, join(node.data.root, "Cargo.toml")));
    }
  }
  return found;
}

function typescriptDomainRoots(graph) {
  return Object.entries(graph.nodes)
    .filter(([, node]) => tagsOf(node).includes("type:domain") && tagsOf(node).includes("lang:ts"))
    .map(([name, node]) => ({ name, root: node.data.root }));
}

function thirdPartyDependencyViolations(graph) {
  const found = [];
  for (const { name, root } of typescriptDomainRoots(graph)) {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    } catch {
      continue;
    }
    const runtimeDependencies = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]);
    for (const dependencyName of [...runtimeDependencies].sort()) {
      const sections = [
        manifest.dependencies,
        manifest.optionalDependencies,
        manifest.peerDependencies,
      ];
      const specifiers = sections
        .filter((section) => section && dependencyName in section)
        .map((section) => section[dependencyName]);
      if (!specifiers.every((specifier) => specifier.startsWith("workspace:"))) {
        found.push(`${name} has third-party runtime dependency ${dependencyName}`);
      }
    }
  }
  return found;
}

const graph = loadGraph();
const violations = [
  ...graphViolations(graph),
  ...typeTagViolations(graph),
  ...bindingTagViolations(graph),
  ...ffiViolations(graph),
  ...thirdPartyDependencyViolations(graph),
];
for (const violation of violations) console.error(violation);
if (violations.length === 0) {
  console.log(`boundaries ok across ${Object.keys(graph.nodes).length} projects`);
} else {
  process.exitCode = failureExitCode;
}
