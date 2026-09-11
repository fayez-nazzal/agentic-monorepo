import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const graphFile = ".nx/boundaries-graph.json";
const failureExitCode = 1;

const allowedDependencyTags = {
  "type:app": ["type:domain", "type:platform", "type:infrastructure"],
  "type:domain": ["type:domain"],
  "type:platform": ["type:platform", "type:domain"],
};

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

function violationsForOutsideDomain(sourceName, sourceTag, targetName, targetTags) {
  if (sourceTag.startsWith("domain:") && !targetTags.includes(sourceTag)) {
    return [`${sourceName} (${sourceTag}) may not depend on ${targetName} outside its domain`];
  }
  return [];
}

function violationsForSourceTag(sourceName, sourceTag, targetName, targetTags) {
  const found = [];
  const allowed = allowedDependencyTags[sourceTag];
  if (allowed && !hasAnyTag(targetTags, allowed)) {
    found.push(`${sourceName} (${sourceTag}) may not depend on ${targetName}`);
  }
  found.push(...violationsForOutsideDomain(sourceName, sourceTag, targetName, targetTags));
  return found;
}

function violationsForDependency(sourceName, sourceTags, targetName, targetTags) {
  const found = [];
  if (targetTags.includes("type:app")) {
    found.push(`${sourceName} depends on application ${targetName}`);
  }
  for (const sourceTag of sourceTags) {
    found.push(...violationsForSourceTag(sourceName, sourceTag, targetName, targetTags));
  }
  return found;
}

function violationsForDependencyInGraph(graph, sourceName, sourceTags, dependency) {
  const targetNode = graph.nodes[dependency.target];
  if (!targetNode) {
    return [];
  }
  return violationsForDependency(sourceName, sourceTags, dependency.target, tagsOf(targetNode));
}

function violationsForSource(graph, sourceName) {
  const found = [];
  const sourceNode = graph.nodes[sourceName];
  if (sourceNode) {
    const sourceTags = tagsOf(sourceNode);
    for (const dependency of graph.dependencies[sourceName]) {
      found.push(...violationsForDependencyInGraph(graph, sourceName, sourceTags, dependency));
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

const graph = loadGraph();
const violations = collectViolations(graph);
for (const violation of violations) {
  console.error(violation);
}
if (violations.length === 0) {
  console.log(`boundaries ok across ${Object.keys(graph.nodes).length} projects`);
} else {
  process.exitCode = failureExitCode;
}
