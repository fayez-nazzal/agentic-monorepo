# Mac Filesystem

Owns macOS filesystem locations for apps. Swift package consumed by macOS apps through SwiftPM.

- Build with `pnpm nx run mac-filesystem:build`
- Test with `pnpm nx run mac-filesystem:test`
- Lint with `pnpm nx run mac-filesystem:lint`
- Format with `pnpm nx run mac-filesystem:format`

Builds in Swift 6 language mode with strict upcoming features enabled in `Package.swift`. Lint runs `swift format lint --strict` and SwiftLint `--strict` without compiling.
