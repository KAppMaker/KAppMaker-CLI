---
name: kappmaker-version
description: Bump the version of a KAppMaker app. Use when the user asks to bump, raise or set the version or build number.
---

# KAppMaker: Version

## Before running any command

1. **Prerequisites**: `kappmaker --version` (install: `npm i -g kappmaker`). If a credential is
   missing the CLI says so; re-run `kappmaker config init`.
2. **Read `AiGuidelines/` first**: the PRD, positioning and UI spec already answer most questions.


### update-version: Version Bumping

**Syntax**: `kappmaker update-version [--version-name <x.y.z>]`

**Options**:
- (none): build-only bump: Android `versionCode` +1 and iOS build number +1. The version name
  does NOT change (CLI 2.2.0+; older versions also bumped the name, 1.0.0 → 1.0.1 and iOS 1.0 → 1.1).
- `--version-name <name>`: also set the version name on both platforms (e.g., `2.0.0`). `-v` /
  `--version` is the old spelling and still works.

Use the plain bump for a re-upload of the same release (the store rejects a build number it has
seen). Pass `--version-name` only when the user asked for a new version number.

**Prerequisites**: None. Run from the project root (containing `MobileApp/`) or inside `MobileApp/`.

**What it updates**:
- Android: `versionCode` (+1), and `versionName` only with `--version-name`, in `androidApp/build.gradle.kts`
- iOS: `CURRENT_PROJECT_VERSION` (+1), and `MARKETING_VERSION` only with `--version-name`, in `project.pbxproj` + `Info.plist`

If a platform's files are missing, that platform is skipped with a warning.

---

## Where this sits in the flow

- **Before this:** a finished change worth releasing. Every release after the first starts here
  the stores reject an upload whose versionCode/build number they have already seen.
- **After this:** **kappmaker-publish**: bump, then ship.
