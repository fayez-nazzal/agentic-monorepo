/* eslint-disable */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../../");
const app = resolve(root, "apps/cli/create-agentic-monorepo");
const out = resolve(app, "dist/package");
const creator = JSON.parse(await readFile(join(app, "package.json"), "utf8"));
const allowed = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "nx.json",
  "tsconfig.base.json",
  ".npmrc",
  ".gitignore",
  ".editorconfig",
  ".oxlintrc.json",
  ".oxfmtrc.json",
  "LICENSE",
  "docs/architecture.md",
  "tools/check-boundaries.mjs",
  "tools/architecture-acceptance.mjs",
  "tools/preflight-tui.mjs",
  ".github/workflows/ci.yml",
  ".github/dependabot.yml",
  ".swift-format",
  ".swiftlint.yml",
  "tools/swiftlint.sh",
  "rust-toolchain.toml",
  "apps/web/example-app",
  "apps/cli/example-app",
  "apps/mac/example-app",
  "libs/domains/search",
  "libs/platform/mac/filesystem",
  "libs/rust/search-index",
];
const excluded =
  /(^|\/)(node_modules|dist|\.nx|target|\.build|\.swiftpm)(\/|$)|(^|\/)(\.env|.*\.pem|.*\.key)$/;
const paths = execFileSync("git", ["ls-files", "--stage", "-z", "--", ...allowed], { cwd: root })
  .toString()
  .split("\0")
  .filter(Boolean);
const files = [];
for (const record of paths) {
  const [meta, file] = record.split("\t");
  const [mode, , stage] = meta.split(" ");
  if (stage !== "0" || excluded.test(file) || !file) continue;
  const text = (await readFile(join(root, file), "utf8")).replaceAll("\r\n", "\n");
  files.push({ path: file, mode: mode === "100755" ? 493 : 420, text });
}
files.sort((a, b) => a.path.localeCompare(b.path));
const canonical = JSON.stringify({ files, variantLockfiles: {} });
const digest = `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
const snapshot = { formatVersion: 1, creatorVersion: creator.version, digest, files };
await rm(out, { recursive: true, force: true });
await mkdir(join(out, "dist"), { recursive: true });
for (const entryName of await readdir(resolve(app, "dist"))) {
  if (entryName === "package") continue;
  await cp(join(app, "dist", entryName), join(out, "dist", entryName), { recursive: true });
}
await mkdir(out, { recursive: true });
const built = resolve(app, "dist/main.mjs");
let entry = await readFile(built, "utf8");
if (!entry.startsWith("#!")) entry = `#!/usr/bin/env node\n${entry}`;
for (const entryName of await readdir(resolve(app, "dist"))) {
  if (entryName === "package") continue;
  if (entryName === "main.mjs") {
    await writeFile(join(out, "dist", entryName), entry);
    await chmod(join(out, "dist", entryName), 0o755);
  }
}
const external = ["@clack/prompts", "picocolors", "yaml", "cross-spawn"];
const dependencies = Object.fromEntries(external.map((name) => [name, creator.dependencies[name]]));
const manifest = {
  name: creator.name,
  version: creator.version,
  description: creator.description,
  type: "module",
  license: creator.license,
  engines: creator.engines,
  repository: creator.repository,
  homepage: creator.homepage,
  bugs: creator.bugs,
  bin: { "create-agentic-monorepo": "dist/main.mjs" },
  files: ["dist", "template.json", "LICENSE", "README.md"],
  dependencies,
  publishConfig: { access: "public" },
};
await writeFile(join(out, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(join(out, "template.json"), `${JSON.stringify(snapshot)}\n`);
await writeFile(join(out, "LICENSE"), await readFile(join(root, "LICENSE")));
await writeFile(join(out, "README.md"), await readFile(join(root, "README.md")));
console.log(`Packaged ${files.length} template files (${digest})`);
