# Architecture

## Placement

- Business logic for a domain lives in `libs/domains/<domain>`.
- Wrappers around platform APIs live in `libs/platform/<platform>/<capability>`.
- Persistence and networking will live in `libs/infrastructure/<capability>`. Create it with its first real project.
- Rust crates live in `libs/rust/<crate>`.
- Repo tooling lives in `tools`.
- Apps compose libraries. They own no reusable business logic.

## Layer purposes

- A domain holds business logic in plain TypeScript. It defines what data and operations exist, not how they reach the outside world. Every app consumes it, so an import of one UI framework inside a domain would couple every consuming app to that framework.
- A platform library wraps an operating system capability for one target, like filesystem access on macOS. The capability has one implementation per platform and the app picks the one matching its target.
- An infrastructure library adapts a system outside the process, such as persistence or networking. It is platform independent so web, CLI, and Mac share one client. Domains define what they need; infrastructure decides how it is reached; apps wire the two together.
- An app composes the three. It owns no reusable logic and no cross-domain orchestration beyond wiring.

## Third-party libraries

- Apps may use any library their `package.json` declares.
- A UI framework binding shared by more than one app lives in `libs/platform/<platform>/<capability>`. React Query caches server state for React rendering, so it goes in the web app itself or a `platform/web` wrapper, never in a domain.
- A client for an external system lives in `libs/infrastructure/<capability>`, for example the HTTP client behind a domain's repository interface.
- A domain takes no third-party runtime dependencies. Its `dependencies` field lists workspace packages only. devDependencies stay unrestricted because tooling is not a runtime coupling. For TypeScript domains, `tools/check-boundaries.mjs` reads the project's `package.json` and rejects anything else. Swift and Rust domains declare dependencies natively, so nothing extra is needed yet.

## Tags

Every project declares tags. TypeScript projects declare them in the `nx` field of `package.json`. Swift and Rust projects declare them in `project.json`.

- `type:app` or `type:domain` or `type:platform` or `type:infrastructure`
- `domain:<name>` for projects inside one business domain
- `platform:<name>` for the platform a project targets
- `lang:<name>` for the implementation language

## Dependency rules

- Apps may depend on domain and platform and infrastructure libraries.
- Domain libraries may depend only on domain libraries.
- A `domain:<name>` project may depend only on projects with the same domain tag.
- Platform libraries may depend on platform and domain libraries.
- Nothing depends on an app.

`tools/check-boundaries.mjs` enforces these rules for every project by reading the Nx graph and project tags. It runs as the `workspace:lint` target. Four layers make the enforcement complete for TypeScript. pnpm strict isolation blocks imports of undeclared packages. An `oxlint` restricted import pattern blocks relative paths that escape a project. The graph checker blocks declared dependencies that break a tag rule. A `package.json` reader rejects third-party runtime dependencies in TypeScript domain projects, because registry packages carry no tags and stay invisible to the graph. Swift and Rust dependencies are declared in `Package.swift` and `Cargo.toml`. Mirror them in `implicitDependencies` inside `project.json` so the Nx graph stays true.

## Tool rules

These principles govern every configurable tool in this repo. Apply them to any tool added later.

- Every check is `error` or `off`. A warning that does not fail the task is noise an agent pays tokens to read and a human learns to ignore.
- One tool owns each failure class. A duplicated diagnostic is paid twice. `oxfmt` owns TypeScript formatting and import order. `oxlint` owns TypeScript semantics and unused code. `tsc` owns types. `swift format` owns Swift formatting. SwiftLint owns Swift semantics. `rustfmt` owns Rust formatting. `clippy` owns Rust semantics. The graph checker owns boundaries.
- Autofix over report. A violation the formatter fixes itself costs zero tokens. Sorting and layout belong to formatters and never to linters.
- A rule earns `error` when the failure it prevents costs more than the ceremony it demands. Rules that force boilerplate get turned off by name in the config so every deviation stays visible and deliberate.
- Prefer tool defaults over custom style. Models are trained on default formatted code. Every custom style choice turns generation into correction.
- Code shape is enforced mechanically. `max-depth` and `max-lines-per-function` and `max-params` keep every function small enough to read in one pass.

## Decisions

- Each language uses its native toolchain. Nx only discovers projects and runs and caches tasks.
- Swift and Rust builds are not Nx cached. Their toolchains own incremental builds. Their tests are Nx cached.
- TypeScript projects link through pnpm workspace packages. The `exports` field keeps each public API small.
- TypeScript 7 owns type checking through each project's `typecheck` target. Its declaration emit is not production ready yet so `tsdown` owns library emit on the Rolldown and Oxc engine.
- `oxlint` with `oxlint-tsgolint` owns linting. Type aware rules run on the TypeScript 7 native engine. Boundary enforcement moved to the graph checker because no oxc tool ships an Nx boundary rule.
- `oxfmt` owns formatting. It replaced Prettier with matching output and the same `printWidth`.
- `minimumReleaseAge: 2880` in `pnpm-workspace.yaml` keeps versions younger than 48 hours out of resolution. Supply chain attacks are usually caught within that window.
- Domain projects allow only `workspace:*` entries in `dependencies`. The checker reads each TypeScript domain `package.json` because the Nx graph cannot see registry packages, and a framework import inside a domain couples every consuming app to one UI.
- `rust-toolchain.toml` makes rustup provide `clippy` and `rustfmt` on any machine.
- SwiftPM in Swift 6.1 has no safe warnings as errors setting. Swift strictness comes from Swift 6 language mode plus upcoming feature flags in each `Package.swift`.
- Swift lint uses `swift format lint --strict` from the bundled toolchain. It is compile free and shares the root `.swift-format` config across apps and libs. `unsafeFlags` and build plugins were rejected. The first breaks package consumption and the second slows every build.
- SwiftLint adds semantic rules on top and comes from Homebrew rather than the repo. Lint calls go through `tools/swiftlint.sh`. The wrapper points SwiftLint at the Command Line Tools SourceKit when no full Xcode is selected.
- `swift format` owns Swift formatting. SwiftLint rules that fight it get disabled in `.swiftlint.yml`. `trailing_comma` was the first.
