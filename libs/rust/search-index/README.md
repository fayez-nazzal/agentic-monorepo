# Search Index

Owns in memory indexing and matching of entries for the search domain. Rust crate built with Cargo. No app consumes it yet. It exists to show how Rust projects plug into the workspace.

- Build with `pnpm nx run search-index:build`
- Test with `pnpm nx run search-index:test`
- Lint with `pnpm nx run search-index:lint`

Lint denies every `clippy` warning and checks `rustfmt`. `Cargo.toml` forbids `unsafe_code`.
