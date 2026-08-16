# Agentic Monorepo

[![ci](https://github.com/fayez-nazzal/agentic-monorepo/actions/workflows/ci.yml/badge.svg)](https://github.com/fayez-nazzal/agentic-monorepo/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A strict polyglot Nx monorepo built for AI agent development. Swift and Rust and TypeScript side by side. Every check is an error or off. Every boundary is enforced by a machine and never by convention.

## Why

- **Deterministic feedback.** Typecheck and lint and test fail fast with one clear signal. Agents converge instead of guessing.
- **Native everything.** SwiftPM for Swift. Cargo for Rust. TypeScript 7 on its native engine plus `oxlint` and `oxfmt` and `tsdown` and Vite. Nx only orchestrates and caches. No wrappers and no legacy tools.
- **Boundaries by machine.** Business domains own their code. A graph checker blocks forbidden dependencies across all three languages. Relative escape imports fail lint. Undeclared packages fail resolution.
- **Security posture.** New package versions wait 48 hours before they can install. Install scripts are blocked by default. Versions are exact. Rust forbids `unsafe`. Swift lint rejects force unwraps.
- **Token cheap.** One tool owns each failure class so nothing reports twice. Autofix beats report. Lint and format finish in milliseconds.

## Inside

- `apps/mac/example-app` native SwiftUI app built with SwiftPM
- `apps/web/example-app` Vite web app
- `apps/cli/example-app` Node CLI
- `libs/domains/search` a business domain in pure TypeScript
- `libs/platform/mac/filesystem` a Swift platform capability
- `libs/rust/search-index` a Rust capability crate
- `docs/architecture.md` the placement guide and boundary rules and tool rules

## Commands

- `pnpm install` then `pnpm nx run-many -t typecheck build test lint` verifies everything
- `pnpm format` fixes formatting and `pnpm format:check` verifies it
- `pnpm nx graph` shows the project graph

## Make it yours

- Replace the `search` examples with your first real domain.
- A TypeScript project is a pnpm workspace package with scripts and `nx.tags`.
- A Swift or Rust project is a directory with a `project.json` calling its native tool.
- Tag every project. The boundary checker does the rest.

MIT licensed. Built to be forked.
