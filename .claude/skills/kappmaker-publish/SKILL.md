---
name: kappmaker-publish
description: Build, sign and ship a KAppMaker app to the stores — signed Android AAB, keystore generation, and uploading to Google Play and the App Store. Use when the user asks to build a release, create a keystore, ship, upload or publish the app.
---

# KAppMaker — Publish

## Before running any command

1. **Prerequisites** — `kappmaker --version` (install: `npm i -g kappmaker`). If a credential is
   missing the CLI says so; re-run `kappmaker config init`.
2. **Read `AiGuidelines/` first** — the PRD, user flow and UI spec already answer most product
   questions. Do not invent decisions they cover.

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
