---
sidebar_position: 13
title: Version Bumping
---

# Version Bumping

Bump the Android versionCode and the iOS build number. The version name changes only with `--version-name`.

**Command:** `kappmaker update-version` Run from the project root (containing `MobileApp/`) or from inside `MobileApp/` directly.

```bash
kappmaker update-version                         # Build number only: versionCode +1, iOS build +1, name unchanged
kappmaker update-version --version-name 2.0.0    # Also set the version name on both platforms
```

Since 2.2.0 a plain bump never changes the version name (it used to turn 1.0.0 into 1.0.1, and iOS
1.0 into 1.1). `-v` / `--version` still work as the old spelling of `--version-name`.

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--version-name <name>` | Also set the version name (e.g., `2.0.0`); `-v, --version` is an alias | Name unchanged |

## What it Updates

| Platform | File | Fields |
|----------|------|--------|
| Android | `androidApp/build.gradle.kts` (AGP 9+) or legacy `composeApp/build.gradle.kts` | `versionCode`, `versionName` |
| iOS | `iosApp/iosApp.xcodeproj/project.pbxproj` | `CURRENT_PROJECT_VERSION`, `MARKETING_VERSION` |
| iOS | `iosApp/iosApp/Info.plist` | `CFBundleVersion`, `CFBundleShortVersionString` |

If a platform's files are missing, that platform is skipped with a warning.
