/* eslint-disable */
import { spawn, spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import crossSpawn from "cross-spawn";

const root = resolve(import.meta.dirname, "..");
const { values } = parseArgs({
  options: {
    mode: { type: "string", default: "portable" },
    package: { type: "string" },
  },
  strict: true,
});
const mode = values.mode;
if (!new Set(["portable", "native", "dev"]).has(mode))
  throw new Error("--mode must be portable, native, or dev");
if (values.package === "")
  throw new Error("--package must not be empty");
const temp = await mkdtemp(join(tmpdir(), "agentic-monorepo-smoke-"));
const run = (command, args, cwd = root) => {
  const result = crossSpawn.sync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
};

async function installCreator(packageSpec) {
  let installSpec = packageSpec;
  if (installSpec === undefined) {
    run("pnpm", [
      "--dir",
      "apps/cli/create-agentic-monorepo",
      "pack",
      "--pack-destination",
      temp,
      "--json",
    ]);
    const archiveName = (await readdir(temp)).find((name) => name.endsWith(".tgz"));
    if (!archiveName) throw new Error("pnpm pack produced no tarball");
    installSpec = join(temp, archiveName);
  }
  const consumer = join(temp, "consumer");
  run("npm", [
    "install",
    "--prefix",
    consumer,
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--registry=https://registry.npmjs.org",
    installSpec,
  ]);
  return consumer;
}

function generate(consumer, destination, args) {
  const executable = join(
    consumer,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "create-agentic-monorepo.cmd" : "create-agentic-monorepo",
  );
  run(executable, [destination, ...args], consumer);
}

function terminateTree(child) {
  if (child.pid === undefined) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
}

async function runDevSmoke(destination) {
  const child = spawn("pnpm", ["nx", "run", "web-example-app:dev"], {
    cwd: destination,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  try {
    const url = await new Promise((resolveUrl, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback(value);
      };
      const timer = setTimeout(
        () => finish(reject, new Error(`timed out waiting for Vite Local URL\n${output}`)),
        120_000,
      );
      child.once("error", (error) => finish(reject, error));
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
        const match = output.match(/Local:\s+(http:\/\/[^\s]+)/);
        if (match) finish(resolveUrl, match[1]);
      });
    });
    const response = await fetch(new URL("src/search-preview.ts", url), {
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`module request failed with HTTP ${response.status}`);
    if (!body.includes("libs/domains/search/dist/index.mjs"))
      throw new Error("served module does not resolve the built search domain");
    if (body.includes("Failed to resolve import"))
      throw new Error("served module contains a failed import");
    console.log(`dev server smoke passed (${url})`);
  } finally {
    terminateTree(child);
    await Promise.race([
      new Promise((resolveExit) => child.once("close", resolveExit)),
      new Promise((resolveExit) => setTimeout(resolveExit, 5_000)),
    ]);
  }
}

try {
  const consumer = await installCreator(values.package);
  const destination = join(temp, "scaffold smoke & check", mode);
  await mkdir(join(temp, "scaffold smoke & check"), { recursive: true });
  if (mode === "dev") {
    generate(consumer, destination, [
      "--preset",
      "web",
      "--yes",
      "--install",
      "--no-git",
      "--json",
    ]);
    run("pnpm", ["format:check"], destination);
    await runDevSmoke(destination);
  } else {
    generate(consumer, destination, [
      "--preset",
      "web-cli",
      "--yes",
      "--no-install",
      "--no-git",
      "--json",
    ]);
    const config = JSON.parse(await readFile(join(destination, "agentic.config.json"), "utf8"));
    if (config.apps.join(",") !== "web,cli" || config.rust !== false)
      throw new Error("unexpected generated selection");
    if (mode === "native" && process.platform !== "darwin")
      console.log("Native source generation verified; native execution requires macOS.");
  }
  console.log(`creator smoke passed (${mode})`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
