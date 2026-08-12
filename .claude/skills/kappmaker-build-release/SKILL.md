---
name: kappmaker-build-release
description: Build, sign and ship a KAppMaker app — signed Android AAB builds, keystore generation, publishing to the Play Store and App Store, package/app-name refactoring, and version bumps. Use when the user asks to build a release, create a keystore, publish or upload to the stores, rename the package, or bump the version.
---

# KAppMaker — Build Release

## Before running any command

1. **Prerequisites** — `kappmaker --version` (install: `npm i -g kappmaker`). If a credential is
   missing the CLI says so; re-run `kappmaker config init` to add it.
2. **Read the project's own docs first** — `AiGuidelines/` holds the PRD, user flow and UI spec for
   this app. Never invent product decisions the docs already answer.
3. **In-project work has its own playbook** — check `<project>/.claude/skills/README.md` before
   hand-rolling anything.


### publish — Build & Upload to Stores

**Syntax**: `kappmaker publish [options]`

**Options**:
- `--platform <name>` — Platform to publish: `android`, `ios` (repeatable, default: both)
- `--track <name>` — Android Play Store track: internal/alpha/beta/production (default: `production`)
- `--upload-metadata` — Upload metadata texts (default: false)
- `--upload-screenshots` — Upload screenshots (default: false)
- `--upload-images` — Upload images — icon, feature graphic, Android only (default: false)
- `--submit-for-review` — Submit for review after upload (default: true)

**Prerequisites**:
- Fastlane via Bundler (`Gemfile` + `fastlane/Fastfile` in mobileDir)
- **Android**: `googleServiceAccountPath` set in config (Google Play service account JSON)
- **iOS**: `ascKeyId`, `ascIssuerId`, `ascPrivateKeyPath` set in config (CLI generates Fastlane publisher JSON automatically)

Run from the project root or inside `MobileApp/`.

**What it does**: Builds and uploads via Fastlane's `playstore_release` (Android) and `appstore_release` (iOS) lanes. With no `--platform`, publishes to both stores sequentially.

---

### generate-keystore — Android Signing Keystore

**Syntax**: `kappmaker generate-keystore [options]`

**Options**:
- `--first-name <name>` — Developer name for keystore (required if no `--organization`)
- `--organization <name>` — Organization name for keystore (required if no `--first-name`)
- `--output <dir>` — Output directory (default: `distribution/android/keystore` inside mobileDir)

**Prerequisites**: `keytool` (comes with JDK). Run from the project root or inside `MobileApp/`.

**What it does**: Generates `keystore.jks` and `keystore.properties` with a secure random password. At least one of `--first-name` or `--organization` must be provided.

---

### android-release-build — Signed Android AAB

**Syntax**: `kappmaker android-release-build [options]`

**Options**:
- `--organization <name>` — Organization for keystore if it needs generating (default: from config)
- `--first-name <name>` — Developer name for keystore if it needs generating
- `--output <dir>` — Output directory for AAB (default: `distribution/android` inside mobileDir)

**Prerequisites**: `gradlew` in the mobile app directory, JDK. Run from the project root or inside `MobileApp/`.

**What it does**:
1. Generates keystore if `distribution/android/keystore/keystore.properties` doesn't exist
2. Builds AAB via `./gradlew :androidApp:bundleRelease`
3. Copies AAB to output directory
4. Logs path to the built AAB

---

### refactor — Package & App Name Refactoring

**Syntax**: `kappmaker refactor --app-id <id> --app-name <name> [options]`

**Options**:
- `--app-id <id>` (required) — New applicationId / bundleId (e.g., `com.example.myapp`)
- `--app-name <name>` (required) — New display name (e.g., `MyApp`)
- `--old-app-id <id>` — Current applicationId to replace (default: `com.measify.kappmaker`)
- `--old-app-name <name>` — Current app name to replace (default: `KAppMakerAllModules`)
- `--skip-package-rename` — Only update IDs and app name, keep Kotlin package directories intact

**Prerequisites**: None. Run from the project root (containing `MobileApp/`) or inside `MobileApp/`.

**What it does**:
- **Full refactor** (default): Renames Kotlin packages in all source sets, moves directories, updates Gradle files, Firebase configs, iOS project files, GitHub workflows, and app display name.
- **Skip-package-rename mode**: Only updates applicationId/bundleId, Firebase configs, iOS files, workflows, and app name — keeps Kotlin package dirs intact. Useful for creating multiple apps from one codebase.

**Re-refactoring**: To refactor a project that was already refactored, pass `--old-app-id` and `--old-app-name` with the current values:
```
kappmaker refactor --app-id com.new.app --app-name NewApp --old-app-id com.previous.app --old-app-name PreviousApp
```

---

### update-version — Version Bumping

**Syntax**: `kappmaker update-version [-v <version>]`

**Options**:
- `-v, --version <name>` — Set explicit version name (e.g., `2.0.0`). If omitted, auto-increments patch (e.g., `1.2.3` → `1.2.4`).

**Prerequisites**: None. Run from the project root (containing `MobileApp/`) or inside `MobileApp/`.

**What it updates**:
- Android: `versionCode` (+1) and `versionName` in `androidApp/build.gradle.kts`
- iOS: `CURRENT_PROJECT_VERSION` (+1) and `MARKETING_VERSION` in `project.pbxproj` + `Info.plist`

If a platform's files are missing, that platform is skipped with a warning.

---
