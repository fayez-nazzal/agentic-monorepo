/* eslint-disable */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
  const directory = join(root, "libs", "domains", "clipboard");
  await writeManifest(directory, clipboardManifest());
  const [declaration] = readConceptDeclaration(join(directory, "package.json"));
  if (declaration === undefined) throw new Error("clipboard fixture manifest is unreadable");
  const violations = registryViolations([declaration]);
  return {
    pass: violations.length === 0,
    lines: [`observed registry violations: ${violations.length}`, ...violations],
    declarations: [declaration],
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
} finally {
  await rm(root, { recursive: true, force: true });
}
console.log(`architecture acceptance: ${3 - failures}/3 scenarios passed`);
if (failures > 0) process.exitCode = 1;
