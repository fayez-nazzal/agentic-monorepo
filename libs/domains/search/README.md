# Search Domain

Owns search queries and result ranking. This is pure TypeScript with no platform or UI dependencies. Its public API is `src/index.ts`.

- Build with `pnpm nx run @domains/search:build`
- Typecheck with `pnpm nx run @domains/search:typecheck`
- Test with `pnpm nx run @domains/search:test`
- Lint with `pnpm nx run @domains/search:lint`

Lint uses `oxlint` with the type-aware rules in the root `.oxlintrc.json`.
