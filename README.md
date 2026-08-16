# Agentic Monorepo

[![ci](https://github.com/fayez-nazzal/agentic-monorepo/actions/workflows/ci.yml/badge.svg)](https://github.com/fayez-nazzal/agentic-monorepo/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A strict polyglot Nx monorepo for AI agent development. Swift, Rust, and TypeScript live side by side behind one task graph.

Use it as a starting point for projects where agents need fast feedback, predictable commands, and machine-enforced architecture.

## Why this exists

- **Predictable feedback.** Type checks, lint, and tests fail fast with one clear signal.
- **Native toolchains.** Swift uses SwiftPM. Rust uses Cargo. TypeScript uses its native engine with `oxlint`, `oxfmt`, `tsdown`, and Vite. Nx orchestrates and caches each task.
- **Enforced architecture.** A graph checker blocks forbidden dependencies across all three languages. Lint rejects imports that escape a project. Package resolution rejects undeclared dependencies.
- **Secure defaults.** New package versions wait 48 hours before installation. Install scripts are blocked by default. Versions are exact. Rust forbids `unsafe`. Swift lint rejects force unwraps.
- **Agent-friendly output.** Each failure class has one owner, so tools do not report the same problem twice. Autofix handles formatting before an agent needs to reason about it.

## Quick start

You need Node.js 22 or later and pnpm 11. Full workspace verification also needs macOS, Swift, SwiftLint, and the stable Rust toolchain.

```sh
pnpm install
pnpm nx run-many -t typecheck build test lint
pnpm format:check
```

These are the same checks run by CI.

## Repository map

### Apps

| Project                                        | Description                                     |
| ---------------------------------------------- | ----------------------------------------------- |
| [`apps/mac/example-app`](apps/mac/example-app) | Native macOS app built with SwiftUI and SwiftPM |
| [`apps/web/example-app`](apps/web/example-app) | TypeScript web app built with Vite              |
| [`apps/cli/example-app`](apps/cli/example-app) | TypeScript command-line app built for Node.js   |

### Libraries

| Project                                                        | Description                                     |
| -------------------------------------------------------------- | ----------------------------------------------- |
| [`libs/domains/search`](libs/domains/search)                   | Pure TypeScript search domain                   |
| [`libs/platform/mac/filesystem`](libs/platform/mac/filesystem) | Swift wrapper around macOS filesystem locations |
| [`libs/rust/search-index`](libs/rust/search-index)             | Rust search indexing crate                      |

Read the [architecture guide](docs/architecture.md) for project placement, dependency boundaries, tags, and tool ownership.

## Common commands

| Task                   | Command                                         |
| ---------------------- | ----------------------------------------------- |
| Install dependencies   | `pnpm install`                                  |
| Verify every project   | `pnpm nx run-many -t typecheck build test lint` |
| Fix formatting         | `pnpm format`                                   |
| Check formatting       | `pnpm format:check`                             |
| View the project graph | `pnpm nx graph`                                 |

Each project README lists its individual build, run, test, and lint commands.

## Make it yours

1. Replace the `search` examples with your first business domain.
2. Define each TypeScript project as a pnpm workspace package with scripts and `nx.tags`.
3. Define each Swift or Rust project with a `project.json` that calls its native toolchain.
4. Tag every project so the boundary checker can enforce its allowed dependencies.

## License

[MIT](LICENSE). Built to be forked.
