# CLI Example App

Small TypeScript command-line app. It combines domain libraries and contains no reusable logic.

- Build with `pnpm nx run cli-example-app:build`
- Run with `pnpm nx run cli-example-app:start -- your query`
- Typecheck with `pnpm nx run cli-example-app:typecheck`
- Test with `pnpm nx run cli-example-app:test`
- Lint with `pnpm nx run cli-example-app:lint`

Lint uses `oxlint` with the type-aware rules in the root `.oxlintrc.json`.
