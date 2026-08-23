# Agentic Monorepo

[![ci](https://github.com/fayez-nazzal/agentic-monorepo/actions/workflows/ci.yml/badge.svg)](https://github.com/fayez-nazzal/agentic-monorepo/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Start organized. Stay organized as you scale.

A ready-to-build foundation for software that must stay clear as it grows.

Business domains stay separate. Architecture rules stay enforceable. Every command gives predictable feedback.

AI agents can load only the domain they need. Smaller context uses fewer tokens. Clear ownership reduces noise. Work stays fast and reliable.

Start with working examples. Replace them with your domains. Keep the structure as the product grows.

## What you get

- **A structure built to scale.** Business capabilities stay separate behind small public interfaces.
- **Lower token use.** Agents can work inside one domain without loading the whole repository.
- **Predictable feedback.** Each failure has one owner and one clear signal.
- **Enforced boundaries.** Automated checks stop accidental coupling before it spreads.
- **Faster work.** Formatting fixes itself and cached tasks do not run twice.
- **Secure defaults.** Exact versions and a 48-hour release delay reduce supply-chain risk.
- **Room to grow.** Apps compose domain libraries instead of collecting reusable business logic.

## Architecture that stays clear

The folder structure follows the business. Each domain owns its rules and language. It also owns its tests and public interface.

Apps compose domains. Platform libraries wrap device services. Infrastructure is added only for a real persistence or networking need.

This separation keeps each change local. Humans see less unrelated code. Agents spend fewer tokens. Teams can grow without making every part depend on every other part.

| Purpose                 | Location                           |
| ----------------------- | ---------------------------------- |
| Business domain rules   | `libs/domains/<domain>`            |
| Platform integrations   | `libs/platform/<platform>/<area>`  |
| Persistence and network | `libs/infrastructure/<capability>` |
| Native performance code | `libs/rust/<crate>`                |
| Product entry points    | `apps/<platform>/<app>`            |
| Repository automation   | `tools`                            |

The boundary checker enforces this model across every project. Domain code cannot reach into unrelated domains. Nothing can depend on an app.

Read the [architecture guide](docs/architecture.md) for placement rules and allowed dependencies.

## Quick start

You need `Node.js` 22 or newer and `pnpm` 11.21.0. Full workspace checks also need `macOS` 14 or newer with `Swift` 6 and `SwiftLint`. They also need `Rust` 1.97.1 from the pinned `rust-toolchain.toml`.

```sh
pnpm install
pnpm nx run-many -t typecheck build test lint
pnpm format:check
```

These commands match the checks run by CI.

## Carefully chosen technologies

The stack combines a mature runtime baseline with recent build tools and modern language editions. Every choice is deliberate.

The JavaScript tools use exact versions. Native tools use declared language and platform baselines. Each tool has one role. No tool repeats work owned by another tool.

These choices target superior scalability and performance. Task caching avoids repeated work. Native toolchains keep incremental builds fast. Strict package isolation keeps growth predictable.

| Technology            | Version                  | Why it is here                                       |
| --------------------- | ------------------------ | ---------------------------------------------------- |
| `Node.js`             | 22 or newer              | Mature runtime baseline for workspace automation     |
| `pnpm`                | 11.21.0                  | Fast installs with strict dependency isolation       |
| `Nx`                  | 23.1.1                   | One task graph with caching across every project     |
| `TypeScript`          | 7.0.2                    | Fast native type checks with strict contracts        |
| `Vite`                | 8.2.1                    | Fast web development and optimized production builds |
| `Vitest`              | 4.1.10                   | Fast tests that share the web build pipeline         |
| `tsdown`              | 0.22.14                  | High-speed library and command-line builds           |
| `oxlint`              | 1.78.0                   | Fast semantic linting                                |
| `oxlint-tsgolint`     | 7.0.2001                 | Type-aware rules on the native type engine           |
| `oxfmt`               | 0.63.0                   | Fast formatting and import order                     |
| `Swift` and `SwiftPM` | 6.0 tools level          | Strict native macOS code and package boundaries      |
| `SwiftUI`             | macOS 14 SDK baseline    | Native interface development                         |
| `swift format`        | Swift 6 toolchain        | Native formatting with strict checks                 |
| `SwiftLint`           | Current Homebrew release | Additional native semantic checks                    |
| `macOS`               | 14 minimum target        | Modern platform APIs with a clear support baseline   |
| `Rust`                | 1.97.1 (2024 edition)    | Native performance with memory safety                |
| `Cargo` and `Clippy`  | Rust 1.97.1 toolchain    | Incremental builds and strict native checks          |
| `rustfmt`             | Rust 1.97.1 toolchain    | Native formatting without another dependency         |

The `SwiftLint` version follows Homebrew because CI installs it directly.

## Repository map

### Apps

| Project                                        | Description                      |
| ---------------------------------------------- | -------------------------------- |
| [`apps/mac/example-app`](apps/mac/example-app) | Native macOS interface example   |
| [`apps/web/example-app`](apps/web/example-app) | Browser application example      |
| [`apps/cli/example-app`](apps/cli/example-app) | Command-line application example |

### Libraries

| Project                                                        | Description                            |
| -------------------------------------------------------------- | -------------------------------------- |
| [`libs/domains/search`](libs/domains/search)                   | Pure search business domain            |
| [`libs/platform/mac/filesystem`](libs/platform/mac/filesystem) | macOS filesystem integration           |
| [`libs/rust/search-index`](libs/rust/search-index)             | High-performance search indexing crate |

## Common commands

| Task                   | Command                                         |
| ---------------------- | ----------------------------------------------- |
| Install dependencies   | `pnpm install`                                  |
| Verify every project   | `pnpm nx run-many -t typecheck build test lint` |
| Fix formatting         | `pnpm format`                                   |
| Check formatting       | `pnpm format:check`                             |
| View the project graph | `pnpm nx graph`                                 |

Each project `README` lists its own build and run commands. It also lists its test and lint commands.

## Make it yours

1. Replace the `search` examples with the first real business domain.
2. Name domains after business capabilities instead of technical layers.
3. Keep reusable business rules inside domain libraries.
4. Add project tags so the boundary checker can protect every new dependency.
5. Let apps assemble domains without becoming homes for shared business logic.

## License

[MIT](LICENSE). Built to be forked.
