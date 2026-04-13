---
sidebar_position: 13
title: Version Bumping
---

# Version Bumping

Bump Android and iOS version codes and optionally set a new version name.

**Command:** `kappmaker update-version` Run from the project root (containing `MobileApp/`) or from inside `MobileApp/` directly.

```bash
kappmaker update-version              # Increment patch: 1.2.3 → 1.2.4, versionCode +1
kappmaker update-version -v 2.0.0     # Set explicit version name, versionCode +1
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `-v, --version <name>` | Set explicit version name (e.g., `2.0.0`) | Auto-increment patch |

## What it Updates

| Platform | File | Fields |
|----------|------|--------|
| Android | `composeApp/build.gradle.kts` | `versionCode`, `versionName` |
| iOS | `iosApp/iosApp.xcodeproj/project.pbxproj` | `CURRENT_PROJECT_VERSION`, `MARKETING_VERSION` |
| iOS | `iosApp/iosApp/Info.plist` | `CFBundleVersion`, `CFBundleShortVersionString` |

If a platform's files are missing, that platform is skipped with a warning.
