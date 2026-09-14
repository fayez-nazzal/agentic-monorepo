# Mac Example App

Native macOS app built with Swift and SwiftUI. It combines platform libraries and contains no reusable logic.

- Build with `pnpm nx run mac-example-app:build`
- Run with `pnpm nx run mac-example-app:run`
- Lint with `pnpm nx run mac-example-app:lint`
- Format with `pnpm nx run mac-example-app:format`

The app uses Swift 6 language mode and the strict upcoming features enabled in `Package.swift`. Lint runs `swift format lint --strict` and SwiftLint `--strict` without compiling.
