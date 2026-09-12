/* eslint-disable */
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const mode = process.argv[process.argv.indexOf("--mode") + 1] ?? "portable";
if (!new Set(["portable", "native"]).has(mode))
  throw new Error("--mode must be portable or native");
const temp = await mkdtemp(join(tmpdir(), "agentic-monorepo-smoke-"));
const run = (command, args, cwd = root) => {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
};
try {
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  run(pnpm, [
    "--dir",
    "apps/cli/create-agentic-monorepo",
    "pack",
    "--pack-destination",
    temp,
    "--json",
  ]);
  const tarball = (await import("node:fs/promises"))
    .readdir(temp)
    .then((names) => names.find((name) => name.endsWith(".tgz")));
  const archive = await tarball;
  if (!archive) throw new Error("pnpm pack produced no tarball");
  const consumer = join(temp, "consumer");
  await mkdir(join(temp, "scaffold smoke & check"), { recursive: true });
  run("npm", [
    "install",
    "--prefix",
    consumer,
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    join(temp, archive),
  ]);
  const destination = join(temp, "scaffold smoke & check", "demo");
  run("node", [
    join(consumer, "node_modules/create-agentic-monorepo/dist/main.mjs"),
    destination,
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
  console.log(`creator smoke passed (${mode})`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
