# Mac Example App

Native macOS application in Swift and SwiftUI. It composes platform libraries and owns no reusable logic.

- Build with `pnpm nx run mac-example-app:build`
- Run with `pnpm nx run mac-example-app:run`
- Lint with `pnpm nx run mac-example-app:lint`
- Format with `pnpm nx run mac-example-app:format`

Builds in Swift 6 language mode with strict upcoming features enabled in `Package.swift`. Lint runs `swift format lint --strict` and SwiftLint `--strict` without compiling.
