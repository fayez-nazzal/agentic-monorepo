# Search Index

Provides in-memory indexing and matching for search entries. This Rust crate is built with Cargo. No app uses it yet; it shows how a Rust project fits into the workspace.

- Build with `pnpm nx run search-index:build`
- Test with `pnpm nx run search-index:test`
- Lint with `pnpm nx run search-index:lint`

Lint treats every `clippy` warning as an error and checks `rustfmt`. `Cargo.toml` forbids `unsafe_code`.
