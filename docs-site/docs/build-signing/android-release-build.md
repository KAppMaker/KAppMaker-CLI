---
sidebar_position: 11
title: Android Release Build
---

# Android Release Build

Build a signed Android release AAB. Automatically generates a keystore if one doesn't exist yet.

**Command:** `kappmaker android-release-build`

```bash
kappmaker android-release-build
kappmaker android-release-build --organization "MyCompany"
kappmaker android-release-build --output ./my-output
```

Run from the project root (containing `MobileApp/`) or inside `MobileApp/` directly. Requires `gradlew` in the mobile app directory.

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--organization <name>` | Organization for keystore generation | From config |
| `--first-name <name>` | Developer name for keystore generation | Empty |
| `--output <dir>` | Output directory for AAB | `distribution/android` |

## What it Does

1. Generates keystore if `distribution/android/keystore/keystore.properties` doesn't exist
2. Runs `./gradlew :androidApp:bundleRelease` (falls back to `:composeApp:bundleRelease` for legacy pre-AGP-9 layouts)
3. Copies the AAB to the output directory

**Output:** `distribution/android/app-release.aab` (or custom `--output` path)
