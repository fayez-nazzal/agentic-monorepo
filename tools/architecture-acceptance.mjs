/* eslint-disable */
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  evaluatePreflight,
  formatVerdict,
  parsePlan,
  readConceptDeclaration,
  registryViolations,
} from "./check-boundaries.mjs";

let failures = 0;

function clipboardManifest() {
  return {
    name: "@domains/clipboard",
    nx: { tags: ["type:domain", "domain:clipboard", "lang:ts"], concepts: ["item"] },
  };
}

async function writeManifest(directory, manifest) {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function writePlan(root, file, changes) {
  const planPath = join(root, file);
  await writeFile(planPath, JSON.stringify({ changes }));
  return planPath;
}

async function scenarioSingleOwner(root) {
  const clipboardDirectory = join(root, "libs", "domains", "clipboard");
  const historyDirectory = join(root, "libs", "domains", "clipboard-history");
  await writeManifest(clipboardDirectory, clipboardManifest());
  await writeManifest(historyDirectory, {
    name: "@domains/clipboard-history",
    nx: { tags: ["type:domain", "domain:clipboard", "lang:ts"], concepts: [] },
  });
  const declarations = [
    ...readConceptDeclaration(join(clipboardDirectory, "package.json")),
    ...readConceptDeclaration(join(historyDirectory, "package.json")),
  ];
  const violations = registryViolations(declarations);
  return {
    pass: violations.length === 0,
    lines: [`observed registry violations: ${violations.length}`, ...violations],
    declarations,
  };
}

async function scenarioLegalGrowth(declarations, root) {
  const planPath = await writePlan(root, "plan-legal.json", [
    {
      action: "add-domain",
      project: "@domains/sync",
      tags: ["type:domain", "domain:sync", "lang:ts"],
      concepts: [],
    },
    {
      action: "add-app",
      project: "web-clipboard",
      tags: ["type:app", "platform:web", "lang:ts"],
      concepts: [],
    },
  ]);
  const expected = ["LEGAL @domains/sync add-domain", "LEGAL web-clipboard add-app"];
  return verdictResult(evaluatePreflight(parsePlan(planPath), declarations), expected, false);
}

async function scenarioBlockedTransfer(declarations, root) {
  const planPath = await writePlan(root, "plan-blocked.json", [
    {
      action: "add-concept",
      project: "@domains/clipboard-history",
      tags: ["type:domain", "domain:clipboard", "lang:ts"],
      concepts: ["item"],
    },
  ]);
  const expected = [
    "BLOCKED @domains/clipboard-history add-concept item | rule: one-owner-per-concept | conflicts with @domains/clipboard | minimal legal change: transfer clipboard:item ownership in a human-reviewed change, or declare a distinct concept name",
  ];
  return verdictResult(evaluatePreflight(parsePlan(planPath), declarations), expected, true);
}

async function scenarioUnknownProject(declarations, root) {
  const planPath = await writePlan(root, "plan-unknown.json", [
    {
      action: "add-concept",
      project: "@domains/missing-history",
      tags: ["type:domain", "domain:clipboard", "lang:ts"],
      concepts: ["item"],
    },
  ]);
  const expected = [
    "BLOCKED @domains/missing-history add-concept item | rule: project-not-found | minimal legal change: add-concept requires an existing project; add @domains/missing-history with add-domain or add-app first",
  ];
  return verdictResult(evaluatePreflight(parsePlan(planPath), declarations), expected, true);
}

async function snapshotFile(filePath) {
  const data = await readFile(filePath, "utf8");
  const { mtimeMs } = await stat(filePath);
  return { data, mtimeMs };
}

async function scenarioReadOnlyTui(root) {
  const planPath = join(root, "plan-readonly.json");
  const manifestPath = join(import.meta.dirname, "..", "libs", "domains", "search", "package.json");
  const changes = [
    {
      action: "add-domain",
      project: "@domains/acceptance-smoke",
      tags: ["type:domain", "domain:acceptance-smoke", "lang:ts"],
      concepts: ["scenario"],
    },
  ];
  await writeFile(planPath, JSON.stringify({ changes }));
  const planBefore = await snapshotFile(planPath);
  const manifestBefore = await snapshotFile(manifestPath);
  const tui = spawnSync(process.execPath, [join(import.meta.dirname, "preflight-tui.mjs")], {
    input: `${planPath}\nv\nq\n`,
    encoding: "utf8",
  });
  const planAfter = await snapshotFile(planPath);
  const manifestAfter = await snapshotFile(manifestPath);
  const planUnchanged =
    planBefore.data === planAfter.data && planBefore.mtimeMs === planAfter.mtimeMs;
  const manifestUnchanged =
    manifestBefore.data === manifestAfter.data && manifestBefore.mtimeMs === manifestAfter.mtimeMs;
  const verdictShown = tui.stdout.includes("LEGAL @domains/acceptance-smoke add-domain scenario");
  return {
    pass: tui.status === 0 && verdictShown && planUnchanged && manifestUnchanged,
    lines: [
      `tui exit status: ${tui.status}`,
      `plan content and mtime unchanged: ${planUnchanged}`,
      `manifest content and mtime unchanged: ${manifestUnchanged}`,
      `verdict rendered: ${verdictShown}`,
    ],
  };
}

function verdictResult(verdicts, expected, expectBlocked) {
  const observed = verdicts.map(formatVerdict);
  const statusesOk = verdicts.every((verdict) => statusMatches(verdict, expectBlocked));
  const pass = statusesOk && observed.join("\n") === expected.join("\n");
  return { pass, lines: scenarioLines(pass, expected, observed) };
}

function statusMatches(verdict, expectBlocked) {
  if (expectBlocked) return verdict.status === "blocked";
  return verdict.status === "legal";
}

function scenarioLines(pass, expected, observed) {
  if (pass) return observed;
  return ["expected:", ...expected, "observed:", ...observed];
}

function runScenario(label, result) {
  let status = "FAIL";
  if (result.pass) status = "PASS";
  console.log(`${label}: ${status}`);
  for (const line of result.lines) console.log(`  ${line}`);
  if (!result.pass) failures += 1;
}

const root = await mkdtemp(join(tmpdir(), "architecture-acceptance-"));
try {
  const singleOwner = await scenarioSingleOwner(root);
  runScenario("A1 single-owner", singleOwner);
  const legalGrowth = await scenarioLegalGrowth(singleOwner.declarations, root);
  runScenario("A2 legal growth", legalGrowth);
  const blockedTransfer = await scenarioBlockedTransfer(singleOwner.declarations, root);
  runScenario("A3 blocked transfer", blockedTransfer);
  const unknownProject = await scenarioUnknownProject(singleOwner.declarations, root);
  runScenario("A4 unknown project", unknownProject);
  const readOnlyTui = await scenarioReadOnlyTui(root);
  runScenario("A5 read-only tui", readOnlyTui);
} finally {
  await rm(root, { recursive: true, force: true });
}
console.log(`architecture acceptance: ${5 - failures}/5 scenarios passed`);
if (failures > 0) process.exitCode = 1;
