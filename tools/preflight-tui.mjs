// Interactive planner for the concept registry.
//
// This file uses tools/check-boundaries.mjs, which is the only tool that
// Enforces boundaries and the concept registry. It supplies verdicts;
// FormatVerdict displays them, and parsePlan handles plan errors.
//
// Terminal interaction uses Node's built-in readline.
// A menu and prompt loop are enough, so this tool does not need a TUI framework.
// It writes exactly one file—the plan path—and only after explicit save.
// Validation uses a temporary copy, so project manifests are never changed.
//
// Prompt answers must remain sequential; parallel input would reorder edits.
// The JSON API uses null as its standard no-replacer argument.
/* eslint-disable max-lines, no-await-in-loop, unicorn/no-null */

import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";

import {
  evaluatePreflight,
  formatVerdict,
  parsePlan,
  runPreflight,
  supportedPlanActions,
} from "./check-boundaries.mjs";

const actions = supportedPlanActions();
const usage = "[a]dd [e]dit N [d]elete N [m]ove N up|down [v]alidate [s]ave [q]uit";
const fields = "[a]ction [p]roject [t]ags [c]oncepts — empty finishes";
const transferFields = "[a]ction [p]roject [o]wner [d]omain [n]concept — empty finishes";
const dependencyFields = "[a]ction [s]ource [t]arget — empty finishes";

class InputClosedError extends Error {
  constructor() {
    super("stdin closed");
    this.name = "InputClosedError";
  }
}

async function ask(reader, question) {
  process.stdout.write(question);
  const result = await reader.next();
  if (result.done) {
    throw new InputClosedError();
  }
  return result.value;
}

function parseList(text) {
  return text
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

function listHint(values) {
  if (values.length === 0) {
    return "none";
  }
  return values.join(", ");
}

async function promptList(rl, label, current, omitEmpty) {
  const answer = await ask(rl, `${label} [${listHint(current)}] ('-' clears, empty keeps): `);
  const trimmed = answer.trim();
  if (trimmed === "-") {
    return [];
  }
  if (trimmed === "") {
    if (omitEmpty) {
      return false;
    }
    return current;
  }
  return parseList(trimmed);
}

function actionPrompt() {
  return `action ${actions.map((action, index) => `[${index + 1}] ${action}`).join(" ")}: `;
}

async function promptAction(rl) {
  const answer = await ask(rl, actionPrompt());
  const choice = Math.trunc(Number(answer));
  if (choice >= 1 && choice <= actions.length) {
    return actions[choice - 1];
  }
  console.log("  no action picked — change skipped");
  return "";
}

function defaultTags(action) {
  if (action === "add-domain") {
    return ["type:domain", "lang:ts"];
  }
  if (action === "add-app") {
    return ["type:app", "lang:ts"];
  }
  return [];
}

function transferFieldsOf(change) {
  const clean = {};
  if (change.owner !== undefined) {
    clean.owner = change.owner;
  }
  if (change.domain !== undefined) {
    clean.domain = change.domain;
  }
  if (change.concept !== undefined) {
    clean.concept = change.concept;
  }
  return clean;
}
function dependencyFieldsOf(change) {
  const clean = {};
  if (change.source !== undefined) {
    clean.source = change.source;
  }
  if (change.target !== undefined) {
    clean.target = change.target;
  }
  return clean;
}
function normalizeExistingChange(change) {
  const clean = { action: change.action, project: change.project };
  if (change.tags !== undefined) {
    clean.tags = change.tags;
  }
  if (change.concepts !== undefined) {
    clean.concepts = change.concepts;
  }
  return clean;
}
function normalizeChange(change) {
  if (change.action === "transfer-concept") {
    return { action: change.action, project: change.project, ...transferFieldsOf(change) };
  }
  if (change.action === "add-dependency") {
    return { action: change.action, ...dependencyFieldsOf(change) };
  }
  return normalizeExistingChange(change);
}
async function promptTransferValue(rl, label) {
  const answer = await ask(rl, label);
  return answer.trim();
}

async function promptDependencyChange(rl) {
  const source = await promptTransferValue(rl, "source project name: ");
  const target = await promptTransferValue(rl, "target project name: ");
  if (source === "" || target === "") {
    console.log("  empty dependency field — change skipped");
    return false;
  }
  return normalizeChange({ action: "add-dependency", source, target });
}

async function promptTransferChange(rl) {
  const project = await promptTransferValue(rl, "target project name: ");
  const owner = await promptTransferValue(rl, "current owner project: ");
  const domain = await promptTransferValue(rl, "domain name: ");
  const concept = await promptTransferValue(rl, "concept name: ");
  const values = [project, owner, domain, concept];
  if (values.some((value) => value === "")) {
    console.log("  empty transfer field — change skipped");
    return false;
  }
  return normalizeChange({ action: "transfer-concept", project, owner, domain, concept });
}
async function promptProjectChange(rl, action) {
  const answer = await ask(rl, "project name: ");
  const project = answer.trim();
  if (project === "") {
    console.log("  empty project — change skipped");
    return false;
  }
  const tags = await promptList(rl, "tags", defaultTags(action), action === "add-concept");
  const concepts = await promptList(rl, "concepts", []);
  return changeFromPrompt(action, project, tags, concepts);
}

function promptChange(rl, action) {
  if (action === "transfer-concept") {
    return promptTransferChange(rl);
  }
  if (action === "add-dependency") {
    return promptDependencyChange(rl);
  }
  return promptProjectChange(rl, action);
}
async function addChange(rl, session) {
  const action = await promptAction(rl);
  if (action === "") {
    return;
  }
  const change = await promptChange(rl, action);
  if (change === false) {
    return;
  }
  session.changes.push(change);
  session.dirty = true;
}

function changeLabel(change) {
  if (change.action === "transfer-concept") {
    return `${change.action} ${change.project} | owner: ${change.owner} | claim: ${change.domain}:${change.concept}`;
  }
  if (change.action === "add-dependency") {
    return `${change.action} ${change.source} -> ${change.target}`;
  }
  const tags = listHint(change.tags ?? []);
  const concepts = listHint(change.concepts ?? []);
  return `${change.action} ${change.project} | tags: ${tags} | concepts: ${concepts}`;
}

function dirtySuffix(session) {
  if (session.dirty) {
    return " (unsaved)";
  }
  return "";
}

function printMenu(session) {
  console.log(
    `\nplan ${session.planPath}${dirtySuffix(session)} — ${session.changes.length} changes`,
  );
  session.changes.forEach((change, index) => {
    console.log(`  ${index + 1}) ${changeLabel(change)}`);
  });
  console.log(usage);
}

function changeIndex(session, token) {
  const index = Math.trunc(Number(token ?? "")) - 1;
  const inRange = Number.isInteger(index) && index >= 0 && index < session.changes.length;
  if (inRange) {
    return index;
  }
  console.log("  pick a change number from the list");
  return -1;
}

function deleteChange(session, token) {
  const index = changeIndex(session, token);
  if (index === -1) {
    return;
  }
  session.changes.splice(index, 1);
  session.dirty = true;
}

function moveTarget(index, direction) {
  if (direction === "up") {
    return index - 1;
  }
  return index + 1;
}

function reorderChanges(session, index, target) {
  const [change] = session.changes.splice(index, 1);
  session.changes.splice(target, 0, change);
}

function moveChange(session, token, direction) {
  const index = changeIndex(session, token);
  if (index === -1) {
    return;
  }
  const target = moveTarget(index, direction);
  const inside = target >= 0 && target < session.changes.length;
  if (!inside) {
    console.log("  already at the edge of the list");
    return;
  }
  reorderChanges(session, index, target);
  session.dirty = true;
}

function fieldsFor(change) {
  if (change.action === "transfer-concept") {
    return transferFields;
  }
  if (change.action === "add-dependency") {
    return dependencyFields;
  }
  return fields;
}

async function editChange(rl, session, index) {
  const change = session.changes[index];
  let field = await ask(rl, `edit ${index + 1}) ${changeLabel(change)} — ${fieldsFor(change)}: `);
  while (field.trim() !== "") {
    await editField(rl, change, field.trim());
    field = await ask(rl, `edit ${index + 1}) — ${fieldsFor(change)}: `);
  }
  session.dirty = true;
}

async function editField(rl, change, field) {
  if (change.action === "add-dependency" && field === "t") {
    await editTarget(rl, change);
    return;
  }
  const handler = editHandlers.get(field);
  if (handler === undefined) {
    console.log(`  unknown field ${field}`);
    return;
  }
  await handler(rl, change);
}

async function editAction(rl, change) {
  const action = await promptAction(rl);
  if (action !== "") {
    change.action = action;
  }
}

async function editProject(rl, change) {
  const answer = await ask(rl, `project [${change.project}]: `);
  if (answer.trim() !== "") {
    change.project = answer.trim();
  }
}

async function editTransferValue(rl, change, field, label) {
  const answer = await ask(rl, `${label} [${change[field]}]: `);
  if (answer.trim() !== "") {
    change[field] = answer.trim();
  }
}

async function editOwner(rl, change) {
  await editTransferValue(rl, change, "owner", "owner project");
}

async function editDomain(rl, change) {
  await editTransferValue(rl, change, "domain", "domain name");
}

async function editTransferConcept(rl, change) {
  await editTransferValue(rl, change, "concept", "concept name");
}

async function editTags(rl, change) {
  change.tags = await promptList(rl, "tags", change.tags ?? []);
}

async function editConcepts(rl, change) {
  change.concepts = await promptList(rl, "concepts", change.concepts ?? []);
}

async function editSource(rl, change) {
  await editTransferValue(rl, change, "source", "source project");
}

async function editTarget(rl, change) {
  await editTransferValue(rl, change, "target", "target project");
}

const editHandlers = new Map([
  ["a", editAction],
  ["p", editProject],
  ["t", editTags],
  ["c", editConcepts],
  ["o", editOwner],
  ["d", editDomain],
  ["n", editTransferConcept],
  ["s", editSource],
]);
async function editAt(rl, session, token) {
  const index = changeIndex(session, token);
  if (index !== -1) {
    await editChange(rl, session, index);
  }
}

function planFileText(changes) {
  const normalized = changes.map((change) => normalizeChange(change));
  return `${JSON.stringify({ changes: normalized }, null, 2)}\n`;
}

function writeTempPlan(changes) {
  const directory = mkdtempSync(join(tmpdir(), "preflight-tui-"));
  const planPath = join(directory, "plan.json");
  writeFileSync(planPath, planFileText(changes));
  return planPath;
}

function printVerdicts(verdicts) {
  for (const verdict of verdicts) {
    console.log(formatVerdict(verdict));
  }
  const blocked = verdicts.filter((verdict) => verdict.status === "blocked");
  console.log(`  ${verdicts.length - blocked.length} legal, ${blocked.length} blocked`);
}

function validate(session) {
  if (session.changes.length === 0) {
    console.log("  nothing to validate — add a change first");
    return;
  }
  console.log("  validating against the current registry…");
  const tempPath = writeTempPlan(session.changes);
  try {
    printVerdicts(runPreflight(tempPath));
  } catch (error) {
    console.log(`  validation failed: ${error.message}`);
  } finally {
    rmSync(dirname(tempPath), { recursive: true, force: true });
  }
}

function validatedPlanText(changes) {
  const tempPath = writeTempPlan(changes);
  try {
    parsePlan(tempPath);
    return planFileText(changes);
  } finally {
    rmSync(dirname(tempPath), { recursive: true, force: true });
  }
}

function savePlan(session) {
  try {
    const text = validatedPlanText(session.changes);
    mkdirSync(dirname(session.planPath), { recursive: true });
    writeFileSync(session.planPath, text);
  } catch (error) {
    console.log(`  save failed: ${error.message}`);
    return false;
  }
  session.dirty = false;
  console.log(`  saved ${session.changes.length} changes to ${session.planPath}`);
  return true;
}

function deleteCommand(session, indexToken) {
  deleteChange(session, indexToken);
}

function moveCommand(session, indexToken, direction) {
  moveChange(session, indexToken, direction);
}

function validateCommand(session) {
  validate(session);
}

function saveCommand(session) {
  savePlan(session);
}

const syncCommands = new Map([
  ["d", deleteCommand],
  ["m", moveCommand],
  ["v", validateCommand],
  ["s", saveCommand],
]);

function runSyncCommand(session, indexToken, direction, command) {
  const handler = syncCommands.get(command);
  if (handler === undefined) {
    console.log(`  unknown command — ${usage}`);
    return;
  }
  handler(session, indexToken, direction);
}

async function runCommand(rl, session, tokens) {
  const [command, indexToken, direction] = tokens;
  if (command === "a") {
    await addChange(rl, session);
    return;
  }
  if (command === "e") {
    await editAt(rl, session, indexToken);
    return;
  }
  runSyncCommand(session, indexToken, direction, command);
}

async function quitFlow(rl, session) {
  if (!session.dirty) {
    return true;
  }
  const answer = await ask(rl, "unsaved changes — [s]ave, [q]uit discards, anything else stays: ");
  const choice = answer.trim();
  if (choice === "s") {
    return savePlan(session);
  }
  return choice === "q";
}

async function repl(rl, session) {
  let running = true;
  while (running) {
    printMenu(session);
    const line = await ask(rl, "> ");
    if (line.trim() === "q") {
      running = !(await quitFlow(rl, session));
    } else {
      await runCommand(rl, session, line.trim().split(/\s+/u));
    }
  }
}

function newSession(path) {
  return { planPath: path, changes: [], dirty: false };
}

function loadSession(path) {
  if (!existsSync(path)) {
    console.log(`  no plan at ${path} — starting a new one`);
    return newSession(path);
  }
  try {
    return { ...newSession(path), changes: parsePlan(path) };
  } catch (error) {
    console.log(`  ${error.message}`);
    return false;
  }
}

function planPathOf(answer) {
  if (answer.trim() === "") {
    return "plan.json";
  }
  return answer.trim();
}

async function startSession(rl) {
  let session = newSession("plan.json");
  let loaded = false;
  while (!loaded) {
    const answer = await ask(rl, "plan file to load (empty starts a fresh plan.json): ");
    const candidate = loadSession(planPathOf(answer));
    if (candidate !== false) {
      session = candidate;
      loaded = true;
    }
  }
  return session;
}

async function interactiveMain(rl) {
  const reader = rl[Symbol.asyncIterator]();
  try {
    const session = await startSession(reader);
    await repl(reader, session);
  } catch (error) {
    if (error instanceof InputClosedError) {
      console.log("\ninput closed — nothing was saved");
    } else {
      throw error;
    }
  } finally {
    rl.close();
  }
}

// Deterministic CI self-check. It uses its own transfer fixture.
// This keeps changes to the real registry from changing expected statuses.
const smokePlan = {
  changes: [
    {
      action: "transfer-concept",
      project: "@domains/tui-smoke-target",
      owner: "@domains/tui-smoke-source",
      domain: "inbox",
      concept: "message",
    },
    {
      action: "add-dependency",
      source: "@domains/tui-smoke-source",
      target: "@domains/tui-smoke-target",
    },
    {
      action: "add-dependency",
      source: "@domains/tui-smoke-target",
      target: "tui-smoke-console",
    },
    {
      action: "add-dependency",
      source: "tui-smoke-console",
      target: "@domains/tui-smoke-target",
    },
    {
      action: "transfer-concept",
      project: "@domains/tui-smoke-archive",
      owner: "@domains/tui-smoke-source",
      domain: "inbox",
      concept: "message",
    },
    {
      action: "transfer-concept",
      project: "@domains/tui-smoke-archive",
      owner: "@domains/tui-smoke-target",
      domain: "inbox",
      concept: "message",
    },
    {
      action: "add-domain",
      project: "@domains/tui-smoke-inbox",
      tags: ["type:domain", "domain:inbox", "lang:ts"],
      concepts: ["digest"],
    },
    {
      action: "add-domain",
      project: "@domains/tui-smoke-message",
      tags: ["type:domain", "domain:inbox", "lang:ts"],
      concepts: ["message"],
    },
    { action: "add-concept", project: "@domains/tui-smoke-missing", concepts: ["digest"] },
  ],
  expectedStatuses: [
    "legal",
    "legal",
    "blocked",
    "legal",
    "blocked",
    "legal",
    "legal",
    "blocked",
    "blocked",
  ],
};
const smokeDeclarations = [
  {
    name: "@domains/tui-smoke-source",
    tags: ["type:domain", "domain:inbox", "lang:ts"],
    concepts: ["message"],
  },
  {
    name: "@domains/tui-smoke-target",
    tags: ["type:domain", "domain:inbox", "lang:ts"],
    concepts: [],
  },
  {
    name: "@domains/tui-smoke-archive",
    tags: ["type:domain", "domain:inbox", "lang:ts"],
    concepts: [],
  },
  {
    name: "tui-smoke-console",
    tags: ["type:app", "platform:web", "lang:ts"],
    concepts: [],
  },
];

function reportSmokeStatuses(verdicts, expected) {
  const observed = verdicts.map((verdict) => verdict.status);
  if (observed.join(",") === expected.join(",")) {
    console.log("preflight-tui smoke: ok");
    return;
  }
  console.log(
    `preflight-tui smoke: expected ${expected.join(", ")} but saw ${observed.join(", ")}`,
  );
  process.exitCode = 1;
}

function runSmoke() {
  console.log("preflight-tui smoke: validating an isolated demo plan");
  const tempPath = writeTempPlan(smokePlan.changes);
  let verdicts = [];
  try {
    verdicts = evaluatePreflight(parsePlan(tempPath), smokeDeclarations);
  } finally {
    rmSync(dirname(tempPath), { recursive: true, force: true });
  }
  printVerdicts(verdicts);
  reportSmokeStatuses(verdicts, smokePlan.expectedStatuses);
}

async function main() {
  const [flag] = process.argv.slice(2);
  if (flag === "--smoke") {
    runSmoke();
  } else if (flag === undefined) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await interactiveMain(rl);
  } else {
    throw new Error("usage: preflight-tui.mjs [--smoke]");
  }
}

function isEntryScript() {
  const [, entry] = process.argv;
  if (entry === undefined) {
    return false;
  }
  return realpathSync(entry) === realpathSync(import.meta.filename);
}

if (isEntryScript()) {
  await main();
}
