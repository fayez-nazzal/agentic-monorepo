# Architecture

## Placement

- Business logic for a domain lives in `libs/domains/<domain>`.
- Wrappers around platform APIs live in `libs/platform/<platform>/<capability>`.
- Persistence and networking live in `libs/infrastructure/<capability>`.
- Pure Rust cores live in `libs/rust/<crate>`. Binding crates live beside their core at `libs/rust/<crate>-<ecosystem>`.
- Repo tooling lives in `tools`.
- Apps compose libraries. They own no reusable business logic.

## Layer purposes

- A domain holds business logic in plain TypeScript. It defines data and operations, not outside-world access.
- A platform library wraps one operating-system capability for one target.
- An infrastructure library adapts persistence or networking and may be shared across platforms.
- An app composes domain, platform, infrastructure, and binding libraries. It owns no reusable logic.

## Tags

Every project declares tags. TypeScript projects declare them in the `nx` field of `package.json`. Swift and Rust projects declare them in `project.json`.

- Exactly one recognized type tag is required: `type:app`, `type:domain`, `type:platform`, `type:infrastructure`, `type:rust`, or `type:binding`.
- `domain:<name>` marks business ownership. Rust cores retain their domain tag and may depend only on Rust cores in the same domain.
- `platform:<name>` marks the platform a project targets.
- `lang:<name>` marks the implementation language.

## Dependency rules

- Apps may depend on domain, platform, infrastructure, and binding libraries.
- Domain libraries may depend only on domain libraries and bindings in their own domain.
- Infrastructure libraries may depend on infrastructure, platform, and domain libraries.
- Rust cores may depend only on same-domain Rust cores.
- Bindings are Rust projects and may depend only on Rust cores.
- A `domain:<name>` project may depend only on projects with the same domain tag.
- Nothing depends on an app.

`tools/check-boundaries.mjs` enforces these rules for every project by reading the Nx graph and project tags. It uses a per-run temporary graph directory and removes it in `finally`, so concurrent checks do not share `.nx/boundaries-graph.json`. It also checks binding ecosystem/language compatibility, scans every Cargo dependency table for FFI crates, and checks TypeScript domain runtime manifests. TypeScript domain `dependencies`, `optionalDependencies`, and `peerDependencies` must use any `workspace:` protocol; `devDependencies` and bundled-dependency metadata are out of scope.

### Concept registry

A `type:domain` project declares the business concepts it owns in the `nx` field of its `package.json` as `"concepts": ["name", ...]`. `tools/check-boundaries.mjs` reads these manifests directly and enforces three rules:

- Only `type:domain` projects may declare concepts.
- A concept-declaring project must carry a `domain:<name>` tag.
- One owner per `(domain, concept)`: two projects may not declare the same pair. The same concept name under different domains is a different concept.

`node tools/check-boundaries.mjs --preflight <plan.json>` evaluates a proposed change before any code is written. The plan lists `add-domain`, `add-app`, `add-concept`, and `transfer-concept` entries. Add entries use `project`, `tags`, and `concepts`; a transfer uses `project`, `owner`, `domain`, and `concept`. Every entry is checked against the current registry and the legal entries before it. The mode writes nothing, prints one `LEGAL` or `BLOCKED` verdict per entry, and exits 0 only when every entry is legal.

`pnpm preflight:tui` opens an interactive planner over the same rules. It loads an existing plan or starts a fresh `plan.json`, edits the ordered change list, validates to get the identical `LEGAL`/`BLOCKED` verdicts, and writes only the plan file, only on the explicit `save` command. Project manifests are never touched. Every rule decision is delegated to `tools/check-boundaries.mjs`; the planner owns no rules of its own. Every transfer prompt names the target project, current owner, domain, and concept. `node tools/preflight-tui.mjs --smoke` runs its non-interactive self-check, which CI runs after `architecture:acceptance`.

### Concept ownership transfer

`transfer-concept` models the human-reviewed move that a duplicate `add-concept` claim previously described but could not express. Its `project` is the new owner; `owner` is the current owner; `domain` is the bare domain name; and `concept` is the registry claim to move. The owner and target must exist in the current or earlier simulated state, be distinct single-domain `type:domain` projects tagged `domain:<domain>`, the owner must currently own `(domain, concept)`, and the target must not already declare `concept`.

The checker blocks missing or ambiguous projects, tags, claims, and duplicate targets with a named rule and minimal legal change. Malformed transfer fields fail plan parsing. A legal transfer updates only the simulated pre-flight registry by removing the claim from `owner` and adding it to `project`; blocked entries do not update simulated state. The checker never edits manifests: after a legal verdict, a human-reviewed manifest change is still required. The CLI and TUI use the same parser, evaluator, and verdict renderer.

### Dependency-edge pre-flight

`add-dependency` models one proposed project dependency before a manifest changes. Its plan entry is `{ "action": "add-dependency", "source": "<project>", "target": "<project>" }`. Both projects must exist in the current or earlier simulated state, be distinct, and satisfy the same type, domain, ecosystem, and language dependency rules that the graph checker enforces. A blocked edge names `dependency-edge-not-allowed` and the target project, and requires changing the source or target tags so the edge is permitted. Legal entries do not write manifests or dependency declarations; they only advance ordered pre-flight evaluation. The CLI and TUI render the same verdict, and the TUI prompts for source and target before explicit save.

## Architecture pre-flight procedure

Agents must run pre-flight before writing a new domain or app manifest, adding concepts, changing concept ownership, or adding a dependency edge. Create an ordered `plan.json` containing `add-domain`, `add-app`, `add-concept`, `transfer-concept`, or `add-dependency` entries, then run:

```sh
node tools/check-boundaries.mjs --preflight plan.json
```

The CLI prints one `LEGAL` or `BLOCKED` verdict per entry and exits `0` only when every entry is legal. A `BLOCKED` result is a stop: do not write the proposed files. `add-concept` targets an existing project; an unknown target is not treated as a new project. `transfer-concept` targets an existing domain project and requires its named owner to hold the claim. Use `pnpm preflight:tui` when editing a plan interactively; validation is read-only, and the TUI writes only the plan after an explicit `save`.

For a blocked ownership claim, keep the existing owner and either choose a distinct concept or use a legal `transfer-concept` entry followed by a human-reviewed manifest change. Same-name concepts in different `domain:<name>` projects are separate legal claims because ownership is keyed by `(domain, concept)`.

The creator's review and `--dry-run` validate destination and selected template files, not inferred concept ownership. Generated workspaces include the checker, acceptance script, and TUI; their CI runs `pnpm architecture:acceptance` and the deterministic TUI smoke check. Agents still run the explicit pre-flight above at the architecture planning boundary.

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
- `rust-toolchain.toml` pins Rust to `1.97.1` and provides `clippy` and `rustfmt`.
- `minimumReleaseAge: 2880` in `pnpm-workspace.yaml` keeps versions younger than 48 hours out of resolution. Supply chain attacks are usually caught within that window.
- SwiftPM in Swift 6.1 has no safe warnings as errors setting. Swift strictness comes from Swift 6 language mode plus upcoming feature flags in each `Package.swift`.
- Swift lint uses `swift format lint --strict` from the bundled toolchain. It is compile free and shares the root `.swift-format` config across apps and libs. `unsafeFlags` and build plugins were rejected. The first breaks package consumption and the second slows every build.
- Shared logic across languages lives in a pure Rust core. Each language reaches it through a thin binding crate tagged `type:binding`, `lang:rust`, and exactly one of `binding:node` or `binding:swift`.
- Runtime targets `dev`, `serve`, `preview`, `start`, and `run` are gated on builds through root `targetDefaults`, so a development server never starts against unbuilt workspace dependencies.
- Node bindings use `lang:ts` consumers; Swift bindings use `lang:swift` consumers. Bindings are the only language-crossing edge.
- Pure Rust cores must remain FFI-free across normal, build, dev, and target-specific dependency tables. FFI crates such as `napi*` and `uniffi*` belong in bindings.
- Bundled-dependency metadata is intentionally out of scope; this checker enforces declared manifest dependencies only.
- SwiftLint adds semantic rules on top and comes from Homebrew rather than the repo. Lint calls go through `tools/swiftlint.sh`. The wrapper points SwiftLint at the Command Line Tools SourceKit when no full Xcode is selected.
- `swift format` owns Swift formatting. SwiftLint rules that fight it get disabled in `.swiftlint.yml`. `trailing_comma` was the first.
