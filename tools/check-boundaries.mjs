import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const graphFile = ".nx/boundaries-graph.json";
const failureExitCode = 1;

const allowedDependencyTags = {
  "type:app": ["type:domain", "type:platform", "type:infrastructure", "type:binding"],
  "type:domain": ["type:domain", "type:binding"],
  "type:platform": ["type:platform", "type:domain"],
  "type:binding": ["type:rust"],
};

// A binding itself is lang:rust; consumers speak the target language instead.
const bindingEcosystemLanguages = {
  "binding:node": ["lang:ts"],
  "binding:swift": ["lang:swift"],
};

const ffiCratePrefixes = ["napi", "uniffi"];

function loadGraph() {
  execFileSync("pnpm", ["exec", "nx", "graph", `--file=${graphFile}`], { stdio: "pipe" });
  const parsed = JSON.parse(readFileSync(graphFile, "utf8"));
  return parsed.graph;
}

function tagsOf(node) {
  let result = [];
  if (node.data.tags) {
    result = node.data.tags;
  }
  return result;
}

function hasAnyTag(tags, allowed) {
  let result = false;
  for (const tag of tags) {
    if (allowed.includes(tag)) {
      result = true;
    }
  }
  return result;
}

function bindingTagsOf(tags) {
  return tags.filter((tag) => bindingEcosystemLanguages[tag]);
}

function languageTagsOf(tags) {
  return tags.filter((tag) => tag.startsWith("lang:"));
}

function ecosystemViolations(sourceName, sourceTags, targetName, targetTags) {
  const found = [];
  for (const targetTag of bindingTagsOf(targetTags)) {
    const speaksLanguage = hasAnyTag(sourceTags, bindingEcosystemLanguages[targetTag]);
    const isSameEcosystem = sourceTags.includes(targetTag);
    if (!speaksLanguage && !isSameEcosystem) {
      found.push(`${sourceName} may not depend on ${targetName} outside the ${targetTag} ecosystem`);
    }
  }
  return found;
}

function languageMismatchViolations(sourceName, sourceTags, targetName, targetTags) {
  // Bindings bridge languages, so any edge touching one stays exempt.
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

function typeTagViolations(sourceName, sourceTags, targetName, targetTags) {
  const found = [];
  for (const sourceTag of sourceTags) {
    const allowed = allowedDependencyTags[sourceTag];
    if (allowed && !hasAnyTag(targetTags, allowed)) {
      found.push(`${sourceName} (${sourceTag}) may not depend on ${targetName}`);
    }
    if (sourceTag.startsWith("domain:") && !targetTags.includes(sourceTag)) {
      found.push(`${sourceName} (${sourceTag}) may not depend on ${targetName} outside its domain`);
    }
  }
  return found;
}

function violationsForDependency(sourceName, sourceTags, targetName, targetTags) {
  const found = [];
  if (targetTags.includes("type:app")) {
    found.push(`${sourceName} depends on application ${targetName}`);
  }
  found.push(
    ...ecosystemViolations(sourceName, sourceTags, targetName, targetTags),
    ...languageMismatchViolations(sourceName, sourceTags, targetName, targetTags),
    ...typeTagViolations(sourceName, sourceTags, targetName, targetTags),
  );
  return found;
}

function violationsForSource(graph, sourceName) {
  const found = [];
  const sourceNode = graph.nodes[sourceName];
  if (sourceNode) {
    const sourceTags = tagsOf(sourceNode);
    for (const dependency of graph.dependencies[sourceName]) {
      const targetNode = graph.nodes[dependency.target];
      if (targetNode) {
        const targetTags = tagsOf(targetNode);
        found.push(
          ...violationsForDependency(sourceName, sourceTags, dependency.target, targetTags),
        );
      }
    }
  }
  return found;
}

function collectViolations(graph) {
  const found = [];
  for (const sourceName of Object.keys(graph.dependencies)) {
    found.push(...violationsForSource(graph, sourceName));
  }
  return found;
}

function bindingTagViolations(graph) {
  const found = [];
  for (const name of Object.keys(graph.nodes)) {
    const tags = tagsOf(graph.nodes[name]);
    const ecosystems = bindingTagsOf(tags);
    if (tags.includes("type:binding") && ecosystems.length !== 1) {
      found.push(`${name} carries type:binding without exactly one known binding tag`);
    }
    if (!tags.includes("type:binding") && ecosystems.length > 0) {
      found.push(`${name} carries a binding tag without type:binding`);
    }
  }
  return found;
}

function parseDependencyCrates(manifest) {
  const crates = [];
  let section = "";
  for (const line of manifest.split("\n")) {
    const header = line.match(/^\[(?<name>.+)\]$/u);
    if (header) {
      section = header.groups.name;
    } else if (section.endsWith("dependencies")) {
      const entry = line.match(/^(?<name>[A-Za-z0-9_-]+)\s*=/u);
      if (entry) {
        crates.push(entry.groups.name);
      }
    }
  }
  return crates;
}

function dependencyCratesOrEmpty(manifestPath) {
  try {
    return parseDependencyCrates(readFileSync(manifestPath, "utf8"));
  } catch {
    return [];
  }
}

function ffiDependencyViolations(name, manifestPath) {
  const ffi = new Set(
    dependencyCratesOrEmpty(manifestPath).filter((crate) =>
      ffiCratePrefixes.some((prefix) => crate.startsWith(prefix)),
    ),
  );
  return [...ffi].map(
    (crate) => `core crate ${name} must stay FFI-free; move ${crate} into a binding crate`,
  );
}

function ffiFreeCoreViolations(graph) {
  const found = [];
  for (const name of Object.keys(graph.nodes)) {
    const tags = tagsOf(graph.nodes[name]);
    const isPureCore = tags.includes("type:rust") && !tags.includes("type:binding");
    if (isPureCore) {
      found.push(...ffiDependencyViolations(name, join(graph.nodes[name].data.root, "Cargo.toml")));
    }
  }
  return found;
}

const graph = loadGraph();
const violations = [
  ...collectViolations(graph),
  ...bindingTagViolations(graph),
  ...ffiFreeCoreViolations(graph),
];
for (const violation of violations) {
  console.error(violation);
}
if (violations.length === 0) {
  console.log(`boundaries ok across ${Object.keys(graph.nodes).length} projects`);
} else {
  process.exitCode = failureExitCode;
}
