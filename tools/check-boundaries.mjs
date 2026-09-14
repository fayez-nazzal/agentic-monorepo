import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* eslint-disable curly, init-declarations, max-depth, max-lines, max-lines-per-function, max-statements, no-array-sort, no-continue */
import crossSpawn from "cross-spawn";

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
const domainTagPrefix = "domain:";
const preflightTypeTags = {
  "add-domain": "type:domain",
  "add-app": "type:app",
  "add-concept": "type:domain",
};
const preflightActions = [...Object.keys(preflightTypeTags), "transfer-concept", "add-dependency"];

const transferPlanKeys = new Set(["action", "project", "owner", "domain", "concept"]);
const dependencyPlanKeys = new Set(["action", "source", "target"]);

function supportedPlanActions() {
  return [...preflightActions];
}

function loadGraph() {
  const tempDir = mkdtempSync(join(tmpdir(), "boundaries-graph-"));
  const graphFile = join(tempDir, "graph.json");
  try {
    const result = crossSpawn.sync("pnpm", ["exec", "nx", "graph", `--file=${graphFile}`], {
      stdio: "pipe",
      encoding: "utf8",
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0 || result.signal) {
      const diagnostics = [result.stdout, result.stderr].filter(Boolean).join("\n");
      let status = String(result.status);
      if (result.status === null) status = "null";
      let signal = "";
      if (result.signal !== null) signal = `, signal=${result.signal}`;
      let detail = "";
      if (diagnostics.length > 0) detail = `\n${diagnostics}`;
      throw new Error(`Unable to load Nx graph (status=${status}${signal})${detail}`);
    }
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

function domainNamesOf(tags) {
  return tags
    .filter((tag) => tag.startsWith(domainTagPrefix))
    .map((tag) => tag.slice(domainTagPrefix.length));
}

function manifestTags(nxField) {
  if (!Array.isArray(nxField.tags)) return [];
  return nxField.tags.filter((tag) => typeof tag === "string");
}

function conceptNamesOf(nxField) {
  const { concepts } = nxField;
  if (concepts === undefined) return [];
  if (!Array.isArray(concepts) || !concepts.every((name) => typeof name === "string")) {
    return false;
  }
  return concepts;
}

function readConceptDeclaration(manifestPath) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return [];
  }
  if (typeof manifest.name !== "string" || manifest.name === "") return [];
  const nxField = manifest.nx ?? {};
  return [{ name: manifest.name, tags: manifestTags(nxField), concepts: conceptNamesOf(nxField) }];
}

function projectDeclaration(node) {
  const packageDeclarations = readConceptDeclaration(join(node.data.root, "package.json"));
  if (packageDeclarations.length > 0) return packageDeclarations;
  let project;
  try {
    project = JSON.parse(readFileSync(join(node.data.root, "project.json"), "utf8"));
  } catch {
    return [];
  }
  const name = project.name ?? node.name;
  return [{ name, tags: manifestTags({ tags: project.tags }), concepts: [] }];
}

function conceptDeclarations(graph) {
  const declarations = [];
  for (const node of Object.values(graph.nodes)) {
    if (node.data.root === ".") continue;
    declarations.push(...projectDeclaration(node));
  }
  return declarations;
}

function registryViolations(declarations) {
  const found = [];
  for (const declaration of declarations) {
    found.push(...declarationViolations(declaration));
  }
  found.push(...conceptOwnershipViolations(declarations));
  return found;
}

function declarationViolations(declaration) {
  if (declaration.concepts === false) {
    return [
      `${declaration.name} declares nx.concepts that is not an array of concept names | rule: concepts-format | minimal legal change: make nx.concepts an array of concept names or remove it`,
    ];
  }
  if (declaration.concepts.length === 0) return [];
  return conceptTagViolations(declaration);
}

function conceptTagViolations(declaration) {
  const found = [];
  if (!declaration.tags.includes("type:domain")) {
    found.push(
      `${declaration.name} declares concepts without type:domain | rule: domain-only-concepts | minimal legal change: remove the concepts field or re-tag ${declaration.name} as type:domain`,
    );
  }
  if (domainNamesOf(declaration.tags).length === 0) {
    found.push(
      `${declaration.name} declares concepts without a ${domainTagPrefix}<name> tag | rule: concepts-need-domain-tag | minimal legal change: add a ${domainTagPrefix}<name> tag to ${declaration.name} or remove its concepts`,
    );
  }
  return found;
}

function registerClaim(ownersByClaim, domain, concept, name) {
  const concepts = ownersByClaim.get(domain) ?? new Map();
  const owners = concepts.get(concept) ?? new Set();
  owners.add(name);
  concepts.set(concept, owners);
  ownersByClaim.set(domain, concepts);
}

function conceptOwnershipViolations(declarations) {
  const ownersByClaim = new Map();
  for (const declaration of declarations) {
    if (declaration.concepts === false) continue;
    for (const domain of domainNamesOf(declaration.tags)) {
      for (const concept of declaration.concepts) {
        registerClaim(ownersByClaim, domain, concept, declaration.name);
      }
    }
  }
  return conflictingClaims(ownersByClaim);
}

function conflictingClaims(ownersByClaim) {
  const found = [];
  for (const [domain, concepts] of ownersByClaim) {
    for (const [concept, owners] of concepts) {
      if (owners.size > 1) found.push(claimViolation(domain, concept, owners));
    }
  }
  return found;
}

function joinNames(names) {
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return names.join(", ");
}

function claimViolation(domain, concept, owners) {
  return `domain:${domain} concept ${concept} is declared by ${joinNames([...owners])} | rule: one-owner-per-concept | minimal legal change: transfer ${domain}:${concept} ownership in a human-reviewed change, or declare a distinct concept name`;
}

function parsePlan(planPath) {
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  if (typeof plan !== "object" || plan === null || !Array.isArray(plan.changes)) {
    throw new Error(`plan ${planPath} must be an object with a changes array`);
  }
  return plan.changes.map((change, index) => parseChange(change, index));
}

function parseChange(change, index) {
  if (typeof change !== "object" || change === null) {
    throw new Error(`change ${index} must be an object`);
  }
  if (!preflightActions.includes(change.action)) {
    throw new Error(`change ${index} has unsupported action ${JSON.stringify(change.action)}`);
  }
  if (change.action === "transfer-concept") {
    return parseTransferChange(change, index);
  }
  if (change.action === "add-dependency") {
    return parseDependencyChange(change, index);
  }
  if (typeof change.project !== "string" || change.project === "") {
    throw new Error(`change ${index} must name a project`);
  }
  return {
    action: change.action,
    project: change.project,
    tags: optionalStrings(change.tags, `change ${index} tags`),
    concepts: optionalStrings(change.concepts, `change ${index} concepts`),
  };
}

function parseTransferChange(change, index) {
  const unexpected = Object.keys(change).find((key) => !transferPlanKeys.has(key));
  if (unexpected !== undefined) {
    throw new Error(
      `change ${index} transfer-concept does not accept ${unexpected}; use owner, domain, and concept`,
    );
  }
  return {
    action: "transfer-concept",
    project: requiredPlanString(change.project, `change ${index} project`),
    owner: requiredPlanString(change.owner, `change ${index} owner`),
    domain: requiredPlanString(change.domain, `change ${index} domain`),
    concept: requiredPlanString(change.concept, `change ${index} concept`),
  };
}

function parseDependencyChange(change, index) {
  const unexpected = Object.keys(change).find((key) => !dependencyPlanKeys.has(key));
  if (unexpected !== undefined) {
    throw new Error(
      `change ${index} add-dependency does not accept ${unexpected}; use source and target`,
    );
  }
  return {
    action: "add-dependency",
    source: requiredPlanString(change.source, `change ${index} source`),
    target: requiredPlanString(change.target, `change ${index} target`),
  };
}

function requiredPlanString(value, label) {
  if (typeof value !== "string" || value === "" || value.trim() !== value) {
    throw new Error(`${label} must be a non-empty string without surrounding whitespace`);
  }
  return value;
}

function optionalStrings(value, label) {
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) return value;
  if (value === undefined) return value;
  throw new Error(`${label} must be an array of strings`);
}

function declaredProjects(declarations) {
  const declared = new Map();
  for (const declaration of declarations) {
    const concepts = conceptList(declaration.concepts);
    declared.set(declaration.name, { tags: [...declaration.tags], concepts: [...concepts] });
  }
  return declared;
}

function conceptList(concepts) {
  if (concepts === false) return [];
  return concepts;
}

function ownershipOf(declared) {
  const ownersByClaim = new Map();
  for (const [name, project] of declared) {
    for (const domain of domainNamesOf(project.tags)) {
      for (const concept of project.concepts) {
        registerClaim(ownersByClaim, domain, concept, name);
      }
    }
  }
  return ownersByClaim;
}

function evaluatePreflight(changes, declarations) {
  const declared = declaredProjects(declarations);
  const context = { declared, ownersByClaim: ownershipOf(declared) };
  return changes.map((change) => evaluateChange(change, context));
}

function evaluateChange(change, context) {
  if (change.action === "add-dependency") {
    const [blockedBy] = dependencyPlanReasons(change, context);
    const verdict = { change, status: "legal" };
    if (blockedBy === undefined) return verdict;
    verdict.status = "blocked";
    verdict.reason = blockedBy;
    return verdict;
  }
  const existing = context.declared.get(change.project);
  const tags = change.tags ?? existing?.tags ?? [];
  const concepts = mergedConcepts(change, existing);
  const [blockedBy] = changeReasons(change, tags, concepts, context);
  const verdict = { change, status: "legal" };
  if (blockedBy === undefined) {
    applyChange(change, tags, concepts, context);
  } else {
    verdict.status = "blocked";
    verdict.reason = blockedBy;
  }
  return verdict;
}

function dependencyPlanReasons(change, context) {
  if (change.source === change.target) {
    return [blockReason("dependency-self", "choose different source and target projects")];
  }
  const source = context.declared.get(change.source);
  if (source === undefined) {
    return [
      blockReason(
        "dependency-source-not-found",
        `add ${change.source} before declaring a dependency from it`,
        change.source,
      ),
    ];
  }
  const target = context.declared.get(change.target);
  if (target === undefined) {
    return [
      blockReason(
        "dependency-target-not-found",
        `add ${change.target} before declaring a dependency on it`,
        change.target,
      ),
    ];
  }
  if (dependencyViolations(change.source, source.tags, change.target, target.tags).length > 0) {
    return [
      blockReason(
        "dependency-edge-not-allowed",
        `change ${change.source} or ${change.target} tags so the dependency is permitted`,
        change.target,
      ),
    ];
  }
  return [];
}

function mergedConcepts(change, existing) {
  const added = change.concepts ?? [];
  if (existing === undefined) return [...new Set(added)];
  return [...new Set([...existing.concepts, ...added])];
}

function changeReasons(change, tags, concepts, context) {
  if (change.action === "transfer-concept") {
    return transferReasons(change, context);
  }
  return [
    ...actionReasons(change, tags, context),
    ...declarationReasons(change, tags, concepts),
    ...ownershipReasons(change, tags, concepts, context.ownersByClaim),
  ];
}

function transferReasons(change, context) {
  const owner = context.declared.get(change.owner);
  if (owner === undefined) {
    return [
      blockReason(
        "transfer-owner-not-found",
        `identify the existing owner of ${change.domain}:${change.concept}, or add ${change.owner} with add-domain first`,
      ),
    ];
  }
  const target = context.declared.get(change.project);
  if (target === undefined) {
    return [
      blockReason(
        "transfer-target-not-found",
        `add ${change.project} with add-domain before transferring ${change.domain}:${change.concept}`,
      ),
    ];
  }
  if (change.owner === change.project) {
    return [
      blockReason(
        "transfer-distinct-projects",
        `choose different owner and target projects to move ${change.domain}:${change.concept}`,
      ),
    ];
  }
  const ownerTypeReasons = transferProjectReasons(change, owner, "owner", change.owner);
  if (ownerTypeReasons.length > 0) return ownerTypeReasons;
  const targetTypeReasons = transferProjectReasons(change, target, "target", change.project);
  if (targetTypeReasons.length > 0) return targetTypeReasons;
  if (target.concepts.includes(change.concept)) {
    return [
      blockReason(
        "transfer-target-already-owns",
        `remove ${change.domain}:${change.concept} from ${change.project}, or choose a target without it`,
        change.project,
      ),
    ];
  }
  const owners = [...(context.ownersByClaim.get(change.domain)?.get(change.concept) ?? [])].sort(
    (left, right) => left.localeCompare(right),
  );
  if (owners.length === 0) {
    return [
      blockReason(
        "transfer-claim-not-found",
        `choose an existing owner of ${change.domain}:${change.concept}; transfer-concept cannot create a claim`,
      ),
    ];
  }
  if (owners.length > 1) {
    return [
      blockReason(
        "transfer-claim-multiple-owners",
        `resolve ${change.domain}:${change.concept} to one owner before transferring it`,
        joinNames(owners),
      ),
    ];
  }
  if (owners[0] !== change.owner) {
    return [
      blockReason(
        "transfer-owner-not-current",
        `set owner to ${owners[0]} before transferring ${change.domain}:${change.concept}`,
        owners[0],
      ),
    ];
  }
  return [];
}

function transferProjectReasons(change, project, role, projectName) {
  const recognized = project.tags.filter((tag) => typeTags.has(tag));
  if (recognized.length !== 1 || recognized[0] !== "type:domain") {
    return [
      blockReason(
        `transfer-${role}-type`,
        `re-tag ${role} ${projectName} as exactly type:domain before transferring ${change.domain}:${change.concept}`,
      ),
    ];
  }
  const domains = domainNamesOf(project.tags);
  if (domains.length !== 1 || domains[0] !== change.domain) {
    return [
      blockReason(
        `transfer-${role}-domain`,
        `set ${role} ${projectName} domain tags to exactly ${domainTagPrefix}${change.domain} before transferring ${change.domain}:${change.concept}`,
      ),
    ];
  }
  return [];
}

function actionReasons(change, tags, context) {
  if (change.action === "add-concept" && !context.declared.has(change.project)) {
    return [
      blockReason(
        "project-not-found",
        `add-concept requires an existing project; add ${change.project} with add-domain or add-app first`,
      ),
    ];
  }
  if (change.action === "add-concept") return [];
  if (context.declared.has(change.project)) {
    return [
      blockReason(
        "project-exists",
        `extend ${change.project} with add-concept instead of adding it again`,
      ),
    ];
  }
  const required = preflightTypeTags[change.action];
  if (!tags.includes(required)) {
    return [blockReason("action-type-tag", `${change.action} requires ${required} in tags`)];
  }
  return [];
}

function declarationReasons(change, tags, concepts) {
  if (concepts.length === 0) return [];
  if (!tags.includes("type:domain")) {
    return [
      blockReason(
        "domain-only-concepts",
        `only type:domain projects declare concepts; tag ${change.project} as type:domain or remove its concepts`,
      ),
    ];
  }
  if (domainNamesOf(tags).length === 0) {
    return [
      blockReason(
        "concepts-need-domain-tag",
        `add a ${domainTagPrefix}<name> tag to ${change.project} or remove its concepts`,
      ),
    ];
  }
  return [];
}

function ownershipReasons(change, tags, concepts, ownersByClaim) {
  for (const domain of domainNamesOf(tags)) {
    for (const concept of concepts) {
      const [owner] = ownersByClaim.get(domain)?.get(concept) ?? [];
      if (owner !== undefined && owner !== change.project) {
        return [
          blockReason(
            "one-owner-per-concept",
            `transfer ${domain}:${concept} ownership in a human-reviewed change, or declare a distinct concept name`,
            owner,
          ),
        ];
      }
    }
  }
  return [];
}

function blockReason(rule, minimalChange, conflictsWith) {
  const entry = { rule, minimalChange };
  if (conflictsWith !== undefined) entry.conflictsWith = conflictsWith;
  return entry;
}

function applyChange(change, tags, concepts, context) {
  if (change.action === "transfer-concept") {
    const source = context.declared.get(change.owner);
    const target = context.declared.get(change.project);
    source.concepts = source.concepts.filter((concept) => concept !== change.concept);
    target.concepts = [...target.concepts, change.concept];
  } else if (change.action !== "add-dependency") {
    context.declared.set(change.project, { tags: [...tags], concepts });
  }
  context.ownersByClaim = ownershipOf(context.declared);
}

function conceptSuffix(change) {
  if (change.action === "add-dependency") {
    return ` ${change.source} -> ${change.target}`;
  }
  if (change.action === "transfer-concept") {
    return ` ${change.domain}:${change.concept} from ${change.owner}`;
  }
  if (change.concepts === undefined || change.concepts.length === 0) return "";
  return ` ${change.concepts.join(", ")}`;
}

function formatVerdict(verdict) {
  const project = verdict.change.project ?? verdict.change.source;
  const head = `${verdict.status.toUpperCase()} ${project} ${verdict.change.action}${conceptSuffix(verdict.change)}`;
  if (verdict.reason === undefined) return head;
  return `${head} | ${formatReason(verdict.reason)}`;
}

function formatReason(entry) {
  let text = `rule: ${entry.rule}`;
  if ("conflictsWith" in entry) text += ` | conflicts with ${entry.conflictsWith}`;
  return `${text} | minimal legal change: ${entry.minimalChange}`;
}

function boundariesMode() {
  const graph = loadGraph();
  const violations = [
    ...graphViolations(graph),
    ...typeTagViolations(graph),
    ...bindingTagViolations(graph),
    ...ffiViolations(graph),
    ...thirdPartyDependencyViolations(graph),
    ...registryViolations(conceptDeclarations(graph)),
  ];
  reportViolations(violations, Object.keys(graph.nodes).length);
}

function reportViolations(violations, projectCount) {
  for (const violation of violations) console.error(violation);
  if (violations.length === 0) {
    console.log(`boundaries ok across ${projectCount} projects`);
  } else {
    process.exitCode = failureExitCode;
  }
}

function runPreflight(planPath) {
  const changes = parsePlan(planPath);
  const graph = loadGraph();
  return evaluatePreflight(changes, conceptDeclarations(graph));
}

function preflightMode(planPath) {
  const verdicts = runPreflight(planPath);
  for (const verdict of verdicts) console.log(formatVerdict(verdict));
  if (verdicts.some((verdict) => verdict.status === "blocked")) {
    process.exitCode = failureExitCode;
  }
}

function main(args) {
  if (args[0] === "--preflight") {
    if (args.length !== 2) throw new Error("usage: check-boundaries.mjs [--preflight <plan.json>]");
    preflightMode(args[1]);
    return;
  }
  if (args.length > 0) throw new Error(`unknown arguments: ${args.join(" ")}`);
  boundariesMode();
}

function isEntryScript() {
  const [, entry] = process.argv;
  if (entry === undefined) return false;
  const entryPath = realpathSync(entry);
  return entryPath === realpathSync(import.meta.filename);
}

if (isEntryScript()) {
  main(process.argv.slice(2));
}

export {
  evaluatePreflight,
  formatVerdict,
  parsePlan,
  readConceptDeclaration,
  registryViolations,
  runPreflight,
  supportedPlanActions,
};
