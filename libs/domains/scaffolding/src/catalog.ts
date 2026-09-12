/* eslint-disable */
export type AppId = "web" | "cli" | "mac";
export type PresetId = "web" | "cli" | "mac" | "web-cli" | "full" | "workspace";
export type ComponentId = "base" | AppId | "search-domain" | "mac-filesystem" | "rust";
export type ComingSoonId =
  | "react"
  | "nextjs"
  | "vue"
  | "sveltekit"
  | "astro"
  | "node-api"
  | "ios"
  | "android"
  | "expo"
  | "electron"
  | "tauri"
  | "rust-bindings";
export type CatalogId = ComponentId | ComingSoonId;
export type CapabilityStatus = "available" | "coming-soon";

/** A command that can be safely passed to a child process without a shell. */
export interface CommandSpec {
  readonly executable: string;
  readonly args: readonly string[];
}

export interface CatalogDescriptor {
  readonly id: CatalogId;
  readonly label: string;
  readonly hint: string;
  readonly status: CapabilityStatus;
  /** Repository-relative POSIX paths, rooted at the template checkout. */
  readonly sourcePaths: readonly string[];
  /** Other capabilities that must be included before this one. */
  readonly requires: readonly ComponentId[];
  /** Nx/SwiftPM/Cargo project names emitted by this capability. */
  readonly projectNames: readonly string[];
  readonly nextCommands: readonly CommandSpec[];
  /** Host/toolchain prerequisites, when applicable. */
  readonly requirements: readonly string[];
}

export interface PresetDescriptor {
  readonly id: PresetId;
  readonly label: string;
  readonly hint: string;
  readonly apps: readonly AppId[];
  readonly rust: boolean;
}

const rootCommands: readonly CommandSpec[] = [
  { executable: "pnpm", args: ["nx", "run-many", "-t", "typecheck", "build", "test", "lint"] },
];

export const catalog: readonly CatalogDescriptor[] = [
  {
    id: "base",
    label: "Workspace",
    hint: "Workspace tooling and architecture without sample projects.",
    status: "available",
    sourcePaths: [
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
      ".github/workflows/ci.yml",
      ".github/dependabot.yml",
    ],
    requires: [],
    projectNames: ["workspace"],
    nextCommands: rootCommands,
    requirements: [],
  },
  {
    id: "web",
    label: "Web · TypeScript + Vite",
    hint: "A vanilla TypeScript + Vite browser starter with a shared search domain.",
    status: "available",
    sourcePaths: ["apps/web/example-app"],
    requires: ["search-domain"],
    projectNames: ["web-example-app"],
    nextCommands: [
      { executable: "pnpm", args: ["nx", "run", "web-example-app:build"] },
      { executable: "pnpm", args: ["nx", "run", "web-example-app:dev"] },
    ],
    requirements: [],
  },
  {
    id: "cli",
    label: "CLI · Node + TypeScript",
    hint: "A Node and TypeScript command-line starter with a shared search domain.",
    status: "available",
    sourcePaths: ["apps/cli/example-app"],
    requires: ["search-domain"],
    projectNames: ["cli-example-app"],
    nextCommands: [
      { executable: "pnpm", args: ["nx", "run", "cli-example-app:build"] },
      { executable: "pnpm", args: ["nx", "run", "cli-example-app:start", "--", "demo"] },
    ],
    requirements: [],
  },
  {
    id: "mac",
    label: "Mac · SwiftUI",
    hint: "A native SwiftUI and SwiftPM starter for macOS utilities and products.",
    status: "available",
    sourcePaths: ["apps/mac/example-app"],
    requires: ["mac-filesystem"],
    projectNames: ["mac-example-app"],
    nextCommands: [
      { executable: "pnpm", args: ["nx", "run", "mac-example-app:build"] },
      { executable: "pnpm", args: ["nx", "run", "mac-example-app:run"] },
    ],
    requirements: ["macOS 14+ and Swift 6", "SwiftLint for lint checks"],
  },
  {
    id: "search-domain",
    label: "Search domain",
    hint: "A pure TypeScript search query and result-ranking domain library.",
    status: "available",
    sourcePaths: ["libs/domains/search"],
    requires: [],
    projectNames: ["@domains/search"],
    nextCommands: [
      { executable: "pnpm", args: ["nx", "run", "@domains/search:build"] },
      { executable: "pnpm", args: ["nx", "run", "@domains/search:test"] },
    ],
    requirements: [],
  },
  {
    id: "mac-filesystem",
    label: "Mac filesystem",
    hint: "A SwiftPM filesystem locations library for macOS applications.",
    status: "available",
    sourcePaths: ["libs/platform/mac/filesystem"],
    requires: [],
    projectNames: ["mac-filesystem"],
    nextCommands: [
      { executable: "pnpm", args: ["nx", "run", "mac-filesystem:build"] },
      { executable: "pnpm", args: ["nx", "run", "mac-filesystem:test"] },
    ],
    requirements: ["macOS 14+ and Swift 6"],
  },
  {
    id: "rust",
    label: "Rust · independent search index",
    hint: "An optional independent Rust library; no application bindings are included.",
    status: "available",
    sourcePaths: ["libs/rust/search-index", "rust-toolchain.toml"],
    requires: [],
    projectNames: ["search-index"],
    nextCommands: [
      { executable: "pnpm", args: ["nx", "run", "search-index:build"] },
      { executable: "pnpm", args: ["nx", "run", "search-index:test"] },
    ],
    requirements: ["Rust 1.97.1 with clippy and rustfmt"],
  },
  {
    id: "react",
    label: "React",
    hint: "Coming soon: this template has no React starter yet.",
    status: "coming-soon",
    sourcePaths: [],
    requires: [],
    projectNames: [],
    nextCommands: [],
    requirements: [],
  },
  {
    id: "nextjs",
    label: "Next.js",
    hint: "Coming soon: this template has no Next.js starter or integration yet.",
    status: "coming-soon",
    sourcePaths: [],
    requires: [],
    projectNames: [],
    nextCommands: [],
    requirements: [],
  },
  {
    id: "vue",
    label: "Vue",
    hint: "Coming soon: this template has no Vue starter yet.",
    status: "coming-soon",
    sourcePaths: [],
    requires: [],
    projectNames: [],
    nextCommands: [],
    requirements: [],
  },
  {
    id: "sveltekit",
    label: "SvelteKit",
    hint: "Coming soon: this template has no SvelteKit starter or integration yet.",
    status: "coming-soon",
    sourcePaths: [],
    requires: [],
    projectNames: [],
    nextCommands: [],
    requirements: [],
  },
  {
    id: "astro",
    label: "Astro",
    hint: "Coming soon: this template has no Astro starter or integration yet.",
    status: "coming-soon",
    sourcePaths: [],
    requires: [],
    projectNames: [],
    nextCommands: [],
    requirements: [],
  },
  {
    id: "node-api",
    label: "Node API",
    hint: "Coming soon: this template has no Node API starter or integration yet.",
    status: "coming-soon",
    sourcePaths: [],
    requires: [],
    projectNames: [],
    nextCommands: [],
    requirements: [],
  },
  {
    id: "ios",
    label: "iOS",
    hint: "Coming soon: this template has no iOS starter or integration yet.",
    status: "coming-soon",
    sourcePaths: [],
    requires: [],
    projectNames: [],
    nextCommands: [],
    requirements: [],
  },
  {
    id: "android",
    label: "Android",
    hint: "Coming soon: this template has no Android starter or integration yet.",
    status: "coming-soon",
    sourcePaths: [],
    requires: [],
    projectNames: [],
    nextCommands: [],
    requirements: [],
  },
  {
    id: "expo",
    label: "Expo",
    hint: "Coming soon: this template has no Expo starter or integration yet.",
    status: "coming-soon",
    sourcePaths: [],
    requires: [],
    projectNames: [],
    nextCommands: [],
    requirements: [],
  },
  {
    id: "electron",
    label: "Electron",
    hint: "Coming soon: this template has no Electron starter or integration yet.",
    status: "coming-soon",
    sourcePaths: [],
    requires: [],
    projectNames: [],
    nextCommands: [],
    requirements: [],
  },
  {
    id: "tauri",
    label: "Tauri",
    hint: "Coming soon: this template has no Tauri starter or integration yet.",
    status: "coming-soon",
    sourcePaths: [],
    requires: [],
    projectNames: [],
    nextCommands: [],
    requirements: [],
  },
  {
    id: "rust-bindings",
    label: "Rust bindings",
    hint: "Coming soon: this template has no Rust application bindings yet.",
    status: "coming-soon",
    sourcePaths: [],
    requires: [],
    projectNames: [],
    nextCommands: [],
    requirements: [],
  },
] as const;

export const presets: readonly PresetDescriptor[] = [
  {
    id: "web",
    label: "Web · TypeScript + Vite",
    hint: "Browser tools, dashboards, and web product frontends.",
    apps: ["web"],
    rust: false,
  },
  {
    id: "cli",
    label: "CLI · Node + TypeScript",
    hint: "Developer tools, automation, and internal command-line utilities.",
    apps: ["cli"],
    rust: false,
  },
  {
    id: "mac",
    label: "Mac · SwiftUI",
    hint: "Native Mac utilities and products using SwiftUI and SwiftPM.",
    apps: ["mac"],
    rust: false,
  },
  {
    id: "web-cli",
    label: "Web + CLI",
    hint: "A browser app and command-line app sharing one search domain.",
    apps: ["web", "cli"],
    rust: false,
  },
  {
    id: "full",
    label: "Full stack",
    hint: "Web, CLI, and Mac examples plus an independent Rust library.",
    apps: ["web", "cli", "mac"],
    rust: true,
  },
  {
    id: "workspace",
    label: "Workspace only",
    hint: "Architecture-first tooling with no application yet.",
    apps: [],
    rust: false,
  },
] as const;

export function isAppId(value: unknown): value is AppId {
  return value === "web" || value === "cli" || value === "mac";
}

export function isPresetId(value: unknown): value is PresetId {
  return (
    value === "web" ||
    value === "cli" ||
    value === "mac" ||
    value === "web-cli" ||
    value === "full" ||
    value === "workspace"
  );
}

export function isComingSoonId(value: unknown): value is ComingSoonId {
  return (
    value === "react" ||
    value === "nextjs" ||
    value === "vue" ||
    value === "sveltekit" ||
    value === "astro" ||
    value === "node-api" ||
    value === "ios" ||
    value === "android" ||
    value === "expo" ||
    value === "electron" ||
    value === "tauri" ||
    value === "rust-bindings"
  );
}

export function findCatalogDescriptor(id: CatalogId): CatalogDescriptor {
  const descriptor = catalog.find((entry) => entry.id === id);
  if (!descriptor) {
    throw new Error(`Unknown catalog capability: ${id}`);
  }
  return descriptor;
}
