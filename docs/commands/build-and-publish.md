# Build, sign and publish

Moved here from the README. Index: [docs/commands](README.md).

## `fastlane configure`

Sets up Fastlane in the mobile app directory. Creates `Gemfile`, `fastlane/Fastfile`, and runs `bundle install`.

```bash
kappmaker fastlane configure
```

Run from the project root (containing `MobileApp/`) or inside `MobileApp/` directly.

**What it creates:**
- `Gemfile`: Ruby gem dependencies (fastlane)
- `fastlane/Fastfile`: Build and upload lanes for Android (Play Store) and iOS (App Store)

If files already exist, they are skipped (not overwritten).

**Prerequisite for:** `kappmaker publish`

---

## `publish`

Builds and uploads your app to Google Play and/or App Store using Fastlane.

```bash
kappmaker publish                                          # Both platforms
kappmaker publish --platform android                       # Android only
kappmaker publish --platform ios                           # iOS only
kappmaker publish --platform android --platform ios        # Both explicitly
kappmaker publish --platform android --track internal      # Android internal track
kappmaker publish --upload-metadata --upload-screenshots   # With metadata
```

Run from the project root (containing `MobileApp/`) or inside `MobileApp/` directly. Requires Fastlane via Bundler (`Gemfile` + `fastlane/Fastfile`).

**Prerequisites:**
- **Android:** Google Play service account JSON; see [Google Play Publisher setup](overview.md#google-play-publisher--android-store-uploads--play-console-management)
- **iOS:** App Store Connect API key; see [App Store Publisher setup](overview.md#app-store-publisher--ios-store-uploads). The CLI generates the Fastlane-format publisher JSON automatically from your `ascKeyId`/`ascIssuerId`/`ascPrivateKeyPath` config.

| Flag | Description | Default |
|------|-------------|---------|
| `--platform <name>` | Platform to publish: `android`, `ios` (repeatable) | Both |
| `--track <name>` | Android Play Store track (internal/alpha/beta/production) | `production` |
| `--upload-metadata` | Upload metadata (title, description) | `false` |
| `--upload-screenshots` | Upload screenshots | `false` |
| `--upload-images` | Upload images: icon, feature graphic (Android only) | `false` |
| `--submit-for-review` | Submit for review after upload | `true` |

---

## `generate-keystore`

Generates an Android signing keystore for Play Store releases. Creates `keystore.jks` and `keystore.properties` with a secure random password.

```bash
kappmaker generate-keystore --organization "MyCompany"
kappmaker generate-keystore --first-name "John Doe" --organization "MyCompany"
kappmaker generate-keystore --output ./custom-keystore-dir
```

Run from the project root (containing `MobileApp/`) or inside `MobileApp/` directly.

**Output** (default: `distribution/android/keystore/` inside MobileApp):
- `keystore.jks`: the signing keystore
- `keystore.properties`: password, alias, and store file path

At least one of `--first-name` or `--organization` is required.

| Flag | Description | Required |
|------|-------------|----------|
| `--first-name <name>` | Developer name for keystore | One of these |
| `--organization <name>` | Organization name for keystore | is required |
| `--output <dir>` | Output directory for keystore files | No |

---

## `android-release-build`

Builds a signed Android release AAB. Automatically generates a keystore if one doesn't exist yet.

```bash
kappmaker android-release-build
kappmaker android-release-build --organization "MyCompany"
kappmaker android-release-build --output ./my-output
```

Run from the project root (containing `MobileApp/`) or inside `MobileApp/` directly. Requires `gradlew` in the mobile app directory.

**What it does:**
1. Generates keystore if `distribution/android/keystore/keystore.properties` doesn't exist
2. Runs `./gradlew :androidApp:bundleRelease` (falls back to `:composeApp:bundleRelease` for legacy pre-AGP-9 layouts)
3. Copies the AAB to the output directory

**Output:** `distribution/android/app-release.aab` (or custom `--output` path)

| Flag | Description | Default |
|------|-------------|---------|
| `--organization <name>` | Organization for keystore generation | From config |
| `--first-name <name>` | Developer name for keystore generation | Empty |
| `--output <dir>` | Output directory for AAB | `distribution/android` |

---
