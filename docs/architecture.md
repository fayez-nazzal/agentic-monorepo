# Architecture

## Placement

- Business logic for a domain lives in `libs/domains/<domain>`.
- Wrappers around platform APIs live in `libs/platform/<platform>/<capability>`.
- Persistence and networking will live in `libs/infrastructure/<capability>`. Create it with its first real project.
- Rust crates live in `libs/rust/<crate>`. Binding crates live beside their core at `libs/rust/<crate>-<ecosystem>`, such as `search-index-node`.
- Repo tooling lives in `tools`.
- Apps compose libraries. They own no reusable business logic.

## Tags

Every project declares tags. TypeScript projects declare them in the `nx` field of `package.json`. Swift and Rust projects declare them in `project.json`.

- `type:app` or `type:domain` or `type:platform` or `type:infrastructure` or `type:rust` or `type:binding`
- `domain:<name>` for projects inside one business domain
- `platform:<name>` for the platform a project targets
- `lang:<name>` for the implementation language
- `binding:<ecosystem>` for projects that expose a Rust crate to one language, `node` or `swift`

## Dependency rules

- Apps may depend on domain and platform and infrastructure and binding libraries.
- Domain libraries may depend only on domain and binding libraries.
- A `domain:<name>` project may depend only on projects with the same domain tag.
- Platform libraries may depend on platform and domain libraries.
- Binding projects may depend only on Rust crates.
- A binding is consumed within its own ecosystem. TypeScript consumes `binding:node`. Swift consumes `binding:swift`.
- A Rust crate without a binding tag stays free of FFI dependencies such as napi or uniffi.
- A dependency between two projects that each declare exactly one language may not cross languages.
- Nothing depends on an app.

`tools/check-boundaries.mjs` enforces these rules for every project by reading the Nx graph and project tags. It runs as the `workspace:lint` target. Three layers make the enforcement complete for TypeScript. pnpm strict isolation blocks imports of undeclared packages. An `oxlint` restricted import pattern blocks relative paths that escape a project. The graph checker blocks declared dependencies that break a tag rule. It also gates binding consumption by ecosystem, rejects edges that cross languages, and scans the `Cargo.toml` of pure Rust cores so they stay free of FFI crates. Swift and Rust dependencies are declared in `Package.swift` and `Cargo.toml`. Mirror them in `implicitDependencies` inside `project.json` so the Nx graph stays true.

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
- `rust-toolchain.toml` makes rustup provide `clippy` and `rustfmt` on any machine.
- SwiftPM in Swift 6.1 has no safe warnings as errors setting. Swift strictness comes from Swift 6 language mode plus upcoming feature flags in each `Package.swift`.
- Swift lint uses `swift format lint --strict` from the bundled toolchain. It is compile free and shares the root `.swift-format` config across apps and libs. `unsafeFlags` and build plugins were rejected. The first breaks package consumption and the second slows every build.
- SwiftLint adds semantic rules on top and comes from Homebrew rather than the repo. Lint calls go through `tools/swiftlint.sh`. The wrapper points SwiftLint at the Command Line Tools SourceKit when no full Xcode is selected.
- `swift format` owns Swift formatting. SwiftLint rules that fight it get disabled in `.swiftlint.yml`. `trailing_comma` was the first.
- Logic shared across languages lives once in a pure Rust core crate. Each language reaches it through a thin binding crate: napi-rs emits a Node addon for TypeScript, and UniFFI generates Swift for Apple platforms. The core owns the logic. Bindings own only marshaling.
- Binding crates relax `unsafe_code = "forbid"` per crate because `#[napi]` and UniFFI macros expand to unsafe glue. Cores keep it strict.
- Boundaries between languages stay chunky. Batch inputs into one call and return whole vectors. Never expose per-item getters over FFI. Every crossing copies and converts strings, so the cost grows with crossings rather than with operations.
- A node binding publishes an internal npm package that its domain library re-exports behind the `exports` field. Apps never import bindings directly. SwiftPM packaging for UniFFI output lands with the first binding a Swift app consumes.
