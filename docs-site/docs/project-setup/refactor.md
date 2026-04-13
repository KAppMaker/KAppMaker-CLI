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

1. Renames Kotlin package names in all source sets (commonMain, androidMain, iosMain, etc.)
2. Moves package directories to match the new package structure
3. Updates Gradle build files, Firebase configs, iOS project files, and GitHub workflows
4. Updates the app display name in manifests, settings, and platform-specific files

## Skip-Package-Rename Mode

Only updates `applicationId` / bundle ID, Firebase configs, iOS files, GitHub workflows, and app name — keeps Kotlin package directories intact.

Useful for creating multiple apps from one codebase without merge conflicts.
