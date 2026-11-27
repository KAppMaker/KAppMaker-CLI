# Create, clone, refactor, version and config

Moved here from the README. Index: [docs/commands](README.md).

## `create <app-name>`

Full end-to-end app bootstrapping. Creates a new KAppMaker app from the template and optionally sets up everything needed to publish.

```bash
kappmaker create Remimi
```

**What it does (13 steps):**

| Step | Action | Details |
|------|--------|---------|
| 1 | Clone template | Clones into `<AppName>-All/` (prompts to overwrite if exists) |
| 2 | Firebase login | Opens browser for authentication |
| 3 | Create Firebase project | `<appname>-app` (skips if exists) |
| 4 | Create Firebase apps | Android + iOS apps (reuses existing if found) |
| 5 | Enable anonymous auth | If brand-new project, prompts user to click "Get started" in Firebase Console, then enables via API |
| 6 | Download SDK configs | `google-services.json` + `GoogleService-Info.plist` (verifies package match, falls back to `Assets/`) |
| 7 | Logo generation | *Optional* — AI logo + automatic background removal |
| 8 | Package refactor | Renames packages, IDs, app name across all modules (shared, androidApp, desktopApp, webApp, designsystem, libs; also walks legacy `composeApp/` for pre-rename projects) |
| 9 | Build environment | `local.properties`, generates signing keystore if missing (iOS deps resolve via SwiftPM) |
| 10 | Git remotes | Renames origin to upstream |
| | *Pre-store reminder* | *Prompts user to create Google Play Console app; App Store Connect is created automatically* |
| 11 | App Store Connect | *Optional* — full app setup (metadata, subs, privacy); app created automatically via `asc web apps create` |
| 12 | Google Play Console | *Optional* — Fastlane builds + uploads AAB to internal track, then runs full gpc setup |
| 13 | Adapty setup | *Optional* — products, paywalls, placements (links to ASC + Play products created in 11-12) |

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `--template-repo <url>` | Template repository URL | KAppMaker template |
| `--organization <org>` | Organization for Fastlane signing | App name (configurable) |

---

## `clone <app-name>`

Clones the template repository into `<AppName>-All`. This is step 1 of `create` exposed as a standalone command — useful when you only want to scaffold a project and apply your own changes (e.g. clone + refactor without Firebase, ASC, etc.).

```bash
kappmaker clone Remimi
kappmaker clone Remimi --template-repo git@github.com:my-org/my-template.git
kappmaker clone Remimi --target-dir ./projects/Remimi
```

**What it does:**
1. Validates the app name (PascalCase)
2. If no config exists at `~/.config/kappmaker/config.json`, runs `kappmaker config init` first
3. If the target directory already exists, prompts to delete and start fresh
4. Runs `git clone <templateRepo> <targetDir>`

**Minimal flow** — clone + refactor without anything else:

```bash
kappmaker clone MyApp
cd MyApp-All/MobileApp
kappmaker refactor --app-id com.example.myapp --app-name MyApp
```

| Flag | Description | Default |
|------|-------------|---------|
| `--template-repo <url>` | Git URL of the template repository | `templateRepo` from config |
| `--target-dir <path>` | Target directory for the clone | `<AppName>-All` |

---

## `git setup-upstream`

Renames the `origin` remote to `upstream`. Step 10 of `create` as a standalone command — designed for the "fork from template" workflow where the template repo becomes upstream and you add your own origin later.

```bash
kappmaker git setup-upstream                    # Run from inside the cloned repo
kappmaker git setup-upstream ./MyApp-All        # Or pass the path explicitly
```

Exits non-zero if the path is not a git repository.

| Argument | Description | Default |
|----------|-------------|---------|
| `[path]` | Path to the repo root | Current directory |

---

## `refactor`

> **2.2.0:** an app name with spaces (`--app-name "Lab Rat"`) keeps its spaces as the display name, while `rootProject.name`, Xcode `PRODUCT_NAME` and the iOS publish workflow's `app_name` get the Gradle-safe `LabRat`.

Refactors package names, application ID, bundle ID, and app name across the entire project. Implemented in TypeScript — no Gradle build system required.

```bash
kappmaker refactor --app-id com.example.myapp --app-name MyApp
kappmaker refactor --app-id com.example.myapp --app-name MyApp --skip-package-rename
```

Run from the project root (containing `MobileApp/`) or from inside `MobileApp/` directly.

**Full refactor (default):**
1. Renames Kotlin package names in all source sets (commonMain, androidMain, iosMain, etc.)
2. Moves package directories to match the new package structure
3. Updates Gradle build files, Firebase configs, iOS project files, and GitHub workflows
4. Updates the app display name in manifests, settings, and platform-specific files

**Skip-package-rename mode (`--skip-package-rename`):**
Only updates `applicationId` / bundle ID, Firebase configs, iOS files, GitHub workflows, and app name — keeps Kotlin package directories intact. Useful for creating multiple apps from one codebase without merge conflicts.

| Flag | Description | Required |
|------|-------------|----------|
| `--app-id <id>` | New applicationId / bundleId (e.g., `com.example.myapp`) | Yes |
| `--app-name <name>` | New display name (e.g., `MyApp`) | Yes |
| `--old-app-id <id>` | Current applicationId to replace (default: `com.measify.kappmaker`) | No |
| `--old-app-name <name>` | Current app name to replace (default: `KAppMakerAllModules`) | No |
| `--skip-package-rename` | Keep Kotlin package dirs, only update IDs and app name | No |

---

## `update-version`

Bumps the Android versionCode and the iOS build number; the version name changes only with `--version-name`. Run from the project root (containing `MobileApp/`) or from inside `MobileApp/` directly.

```bash
kappmaker update-version                         # Build number only: versionCode +1, iOS build +1, name unchanged
kappmaker update-version --version-name 2.0.0    # Also set the version name on both platforms
```

Since 2.2.0 a plain bump never changes the version name (it used to turn 1.0.0 into 1.0.1, and iOS
1.0 into 1.1). `-v` / `--version` still work as the old spelling of `--version-name`.

**What it updates:**

| Platform | File | Fields |
|----------|------|--------|
| Android | `androidApp/build.gradle.kts` (AGP 9+) or legacy `composeApp/build.gradle.kts` | `versionCode`, `versionName` |
| iOS | `iosApp/iosApp.xcodeproj/project.pbxproj` | `CURRENT_PROJECT_VERSION`, `MARKETING_VERSION` |
| iOS | `iosApp/iosApp/Info.plist` | `CFBundleVersion`, `CFBundleShortVersionString` |

If a platform's files are missing, that platform is skipped with a warning.

| Flag | Description | Default |
|------|-------------|---------|
| `--version-name <name>` | Also set the version name (e.g., `2.0.0`); `-v, --version` is an alias | Name unchanged |

---

## Configuration

Run interactive setup to configure API keys and preferences:

```bash
kappmaker config init
```

Or set keys individually:

```bash
kappmaker config set falApiKey <your-key>       # For AI features (logo, screenshots) — or prompted on first use
kappmaker config set imgbbApiKey <your-key>      # For screenshot translation/generation — or prompted on first use
kappmaker config set openaiApiKey <your-key>     # For generate-screenshots — or prompted on first use
kappmaker config set templateRepo <your-repo>    # Use your own template (default: KAppMaker)
```

See [all config keys](#config-keys) and [external services setup](overview.md#external-services--api-keys) for details.

## Config Reference

Configuration is stored at `~/.config/kappmaker/config.json`.

```bash
kappmaker config init                                    # Interactive setup
kappmaker config init --yes --bundle-prefix com.example   # No questions (installers, agents, servers); flags/env/defaults
kappmaker config list                                    # Show all values
kappmaker config set <key> <value>                       # Set a value
kappmaker config get <key>                               # Get a value
kappmaker config path                                    # Show config file path
kappmaker config appstore-defaults                       # View App Store defaults
kappmaker config appstore-defaults --init                # Set up API key + review contact (backfills credit-pack IAPs from template)
kappmaker config appstore-defaults --save ./config.json  # Save as global defaults
kappmaker config adapty-defaults                         # View Adapty defaults
kappmaker config adapty-defaults --init                  # Initialize from template (subs + 3 credit packs + Credits Paywall + credits_pack placement)
kappmaker config adapty-defaults --save ./config.json    # Save as global defaults
```

### Config keys

| Key | Description | Default |
|-----|-------------|---------|
| `templateRepo` | Template repository Git URL | KAppMaker template |
| `bundleIdPrefix` | Bundle/package ID prefix (e.g., `com.measify`) | `com.<appname>` |
| `androidSdkPath` | Android SDK location | `~/Library/Android/sdk` |
| `organization` | Organization for Fastlane signing | App name |
| `falApiKey` | fal.ai API key | — |
| `imgbbApiKey` | imgbb API key ([api.imgbb.com](https://api.imgbb.com/)) | — |
| `openaiApiKey` | OpenAI API key | — |
| `openaiModel` | OpenAI model for the `--prompt` spec-authoring path (also `KAPPMAKER_OPENAI_MODEL`); gpt-4.1 shuts down 2027-01-14 | `gpt-4.1` |
| `ascAuthName` | ASC keychain credential name | `KAppMaker` |
| `ascKeyId` | App Store Connect API Key ID | — |
| `ascIssuerId` | App Store Connect Issuer ID | — |
| `ascPrivateKeyPath` | Path to `.p8` private key | — |
| `appleId` | Apple ID email (for app creation & privacy setup) | — |
| `googleServiceAccountPath` | Google Play service account JSON — used by both Fastlane publish and `kappmaker gpc` | `~/credentials/google-service-app-publisher.json` |

### Global defaults

| File | Used by | Manage with |
|------|---------|-------------|
| `~/.config/kappmaker/appstore-defaults.json` | `create-appstore-app` | `config appstore-defaults --init` (interactive) or `--save <file>` |
| `~/.config/kappmaker/adapty-defaults.json` | `adapty setup` | `config adapty-defaults --init` (template-based) or `--save <file>` |

Global defaults are merged as a base layer so shared settings (review contact, privacy, subscriptions, credit-pack IAPs, paywalls, placements, etc.) don't need to be re-entered per app.

**Re-init backfills missing entries.** Re-running `--init` against an existing defaults file (e.g. one saved before the credit-pack templates landed) auto-adds any missing arrays from the built-in template — credit-pack IAPs for App Store, products / paywalls / placements for Adapty. Empty arrays in your saved defaults no longer wipe out the template content during a `create-appstore-app` or `adapty setup` run either; the CLI preserves template entries when globals have an empty array.

---
