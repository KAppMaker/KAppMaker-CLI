---
sidebar_position: 12
title: Package & App Name Refactoring
---

# Package & App Name Refactoring

Refactor package names, application ID, bundle ID, and app name across the entire project. Implemented in TypeScript — no Gradle build system required.

**Command:** `kappmaker refactor`

```bash
kappmaker refactor --app-id com.example.myapp --app-name MyApp
kappmaker refactor --app-id com.example.myapp --app-name MyApp --skip-package-rename
```

Run from the project root (containing `MobileApp/`) or from inside `MobileApp/` directly.

## Options

| Flag | Description | Required |
|------|-------------|----------|
| `--app-id <id>` | New applicationId / bundleId (e.g., `com.example.myapp`) | Yes |
| `--app-name <name>` | New display name (e.g., `MyApp`) | Yes |
| `--old-app-id <id>` | Current applicationId to replace | No (default: `com.measify.kappmaker`) |
| `--old-app-name <name>` | Current app name to replace | No (default: `KAppMakerAllModules`) |
| `--skip-package-rename` | Keep Kotlin package dirs, only update IDs and app name | No |

## Full Refactor (default)

1. Renames Kotlin package names in all source sets (`commonMain`, `androidMain`, `iosMain`, `jvmMain`, `webMain`, `wasmJsMain`, `nonMobileMain`, `mobileMain`, `nonWebMain`, `jsMain`) plus the test source sets (`commonTest`, `androidHostTest` for Roborazzi screenshot tests, `jvmTest` for Compose UI tests) and standalone entry-point modules' `src/main/kotlin` (post-AGP-9 Path C layout).
2. Moves package directories to match the new package structure across every Gradle module: `shared` (the KMP library), `androidApp`, `desktopApp`, `webApp`, `designsystem`, and the `libs/auth/*`, `libs/subscription/*` libraries. Pre-rename projects with `composeApp/` are walked too so the same command works on either layout.
3. Renames Roborazzi snapshot PNGs whose filenames embed the FQCN (e.g. `com.example.myapp.designsystem.components.ButtonKt_AppButtonPreviews.png`), so `verifyRoborazziAndroidHostTest` finds the right golden files after a package rename.
4. Updates Gradle build files, Firebase configs (`androidApp/google-services.json` on AGP 9, `composeApp/google-services.json` on legacy projects), iOS project files, and GitHub workflows (looked up at the repo root, one level above `MobileApp/`).
5. Updates the app display name in manifests (`androidApp/src/main/AndroidManifest.xml`), the web entry HTML (`webApp/src/webMain/resources/index.html`), the desktop entry (`desktopApp/src/main/kotlin/<pkg>/Main.kt`), the JVM and web `AppUtilImpl.{jvm,web}.kt`, settings, and platform-specific files.

## Skip-Package-Rename Mode

Only updates `applicationId` / bundle ID, Firebase configs, iOS files, GitHub workflows, and app name — keeps Kotlin package directories intact.

Useful for creating multiple apps from one codebase without merge conflicts.
