# Mac Filesystem

Provides macOS filesystem locations for apps. This Swift package is used by macOS apps through SwiftPM.

- Build with `pnpm nx run mac-filesystem:build`
- Test with `pnpm nx run mac-filesystem:test`
- Lint with `pnpm nx run mac-filesystem:lint`
- Format with `pnpm nx run mac-filesystem:format`

The package uses Swift 6 language mode and the strict upcoming features enabled in `Package.swift`. Lint runs `swift format lint --strict` and SwiftLint `--strict` without compiling.
