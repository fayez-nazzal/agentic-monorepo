# Agentic Monorepo

[![ci](https://github.com/fayez-nazzal/agentic-monorepo/actions/workflows/ci.yml/badge.svg)](https://github.com/fayez-nazzal/agentic-monorepo/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A strict polyglot Nx monorepo for AI agent development. Swift, Rust, and TypeScript live side by side.

Checks fail clearly. Dependency boundaries are enforced by tooling rather than convention.

## Why

- **Deterministic feedback.** Type checks, lint, and tests fail fast with one clear signal. Agents can converge instead of guessing.
- **Native tooling.** Swift uses SwiftPM. Rust uses Cargo. TypeScript 7 uses its native engine with `oxlint`, `oxfmt`, `tsdown`, and Vite. Nx orchestrates and caches the work.
- **Machine-enforced boundaries.** Business domains own their code. A graph checker blocks forbidden dependencies across all three languages. Lint rejects relative escape imports. Resolution rejects undeclared packages.
- **Security defaults.** New package versions wait 48 hours before installation. Install scripts are blocked by default. Versions are exact. Rust forbids `unsafe`. Swift lint rejects force unwraps.
- **Low token cost.** Each failure class has one owner, so tools do not report the same problem twice. Autofix is preferred. Lint and format finish in milliseconds.

## Inside

| Path | Purpose |
| --- | --- |
| `apps/mac/example-app` | Native SwiftUI app built with SwiftPM |
| `apps/web/example-app` | Vite web app |
| `apps/cli/example-app` | Node CLI |
| `libs/domains/search` | Business domain in pure TypeScript |
| `libs/platform/mac/filesystem` | Swift platform capability |
| `libs/rust/search-index` | Rust capability crate |
| `docs/architecture.md` | Placement guide, boundary rules, and tool rules |

## Commands

```sh
pnpm install
pnpm nx run-many -t typecheck build test lint
```

The command above verifies the entire monorepo.

```sh
pnpm format
pnpm format:check
pnpm nx graph
```

`pnpm format` fixes formatting. `pnpm format:check` verifies formatting. `pnpm nx graph` shows the project graph.

## Make it yours

- Replace the `search` examples with your first real domain.
- Define a TypeScript project as a pnpm workspace package with scripts and `nx.tags`.
- Define a Swift or Rust project as a directory with a `project.json` that calls its native tool.
- Tag every project. The boundary checker handles the rest.

MIT licensed. Built to be forked.
