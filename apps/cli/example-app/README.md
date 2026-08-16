# CLI Example App

Minimal command line application in TypeScript. It composes domain libraries and owns no reusable logic.

- Build with `pnpm nx run cli-example-app:build`
- Run with `pnpm nx run cli-example-app:start -- your query`
- Typecheck with `pnpm nx run cli-example-app:typecheck`
- Test with `pnpm nx run cli-example-app:test`
- Lint with `pnpm nx run cli-example-app:lint`

Lint runs `oxlint` with type aware rules from the root `.oxlintrc.json`.
