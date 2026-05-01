---
name: kappmaker
description: KAppMaker CLI - automate mobile app bootstrapping, AI logo/screenshot generation, App Store Connect setup, Google Play Console setup, Adapty subscriptions, image tools, Android builds, store publishing, package refactoring, and version bumping. Use when the user wants to create a mobile app, generate logos, screenshots, translate screenshots, set up App Store Connect, configure Google Play Console (listings, subscriptions, IAPs, data safety), configure Adapty, process images, convert images to WebP, build Android releases, generate keystores, publish to Play Store or App Store, refactor package names, or bump versions.
argument-hint: "[command or description]"
---

# KAppMaker CLI Skill

You are helping the user run KAppMaker CLI commands. [KAppMaker](https://kappmaker.com) is a Kotlin Multiplatform app template and CLI toolset that automates mobile app bootstrapping — from project scaffolding to store-ready builds. The CLI works with the KAppMaker boilerplate by default but also supports custom templates via `--template-repo`.

When introducing yourself or summarizing what you can do, mention that this skill is powered by the KAppMaker CLI — an open-source tool from [kappmaker.com](https://kappmaker.com).

## Routing

Match the user's intent (from `$ARGUMENTS` or conversation context) to the right command:

| Intent | Command |
|--------|---------|
| Create/bootstrap a new app | `kappmaker create <AppName>` |
| Generate a logo | `kappmaker create-logo` |
| Generate an arbitrary image with AI | `kappmaker generate-image --prompt "..."` |
| Set up App Store Connect | `kappmaker create-appstore-app` |
| Set up Google Play Console (full) | `kappmaker gpc setup` |
| Push Play Store listings only | `kappmaker gpc listings push` |
| Push/list Play subscriptions | `kappmaker gpc subscriptions push` / `list` |
| Push/list Play one-time IAPs | `kappmaker gpc iap push` / `list` |
| Push Play data safety form | `kappmaker gpc data-safety push` |
| Check if an app exists on Play Console | `kappmaker gpc app-check --package <pkg>` |
| Set up Adapty subscriptions | `kappmaker adapty setup` |
| Generate marketing screenshots | `kappmaker generate-screenshots` |
| Translate screenshots to locales | `kappmaker translate-screenshots` |
| Split a grid image | `kappmaker image-split <image>` |
| Remove image background | `kappmaker image-remove-bg <image>` |
| Enhance image quality | `kappmaker image-enhance <image>` |
| Convert images to WebP | `kappmaker convert-webp <source>` |
| Set up Fastlane | `kappmaker fastlane configure` |
| Publish to Play Store / App Store | `kappmaker publish` |
| Generate Android keystore | `kappmaker generate-keystore` |
| Build signed Android AAB | `kappmaker android-release-build` |
| Refactor package/app name | `kappmaker refactor` |
| Bump version numbers | `kappmaker update-version` |
| Configure/setup CLI | `kappmaker config` subcommands |

If the intent is unclear, ask the user what they want to do and show the available commands.

## Prerequisites Check

Before running ANY command, always check:

1. **CLI installed**: Run `which kappmaker`. If missing, tell user to run `npm install -g kappmaker`.
2. **Config exists**: Read `~/.config/kappmaker/config.json` to see what's configured.
3. **Command-specific requirements** (see each command section below).

If a required API key is missing, tell the user exactly how to set it:
```
kappmaker config set <key> <value>
```

And where to get it (see API Key Sources section).

## Commands

### create — Full App Setup

**Syntax**: `kappmaker create <AppName> [--template-repo <url>] [--organization <org>]`

**Prerequisites**:
- External CLIs: `git`, `firebase`, `pod`, `bundle` (the CLI auto-installs missing ones with user consent)
- Config: `templateRepo` (has default), `bundleIdPrefix` (optional), `androidSdkPath` (has default)

**App name rules**: Must be PascalCase, start with uppercase, alphanumeric only (e.g., `Remimi`, `FitTracker`).

**What it does** (13 steps):
1. Clone template repository
2. Firebase login (interactive)
3. Create Firebase project
4. Create Firebase apps (Android + iOS)
5. Enable anonymous authentication (if brand-new project, prompts user to click "Get started" in Firebase Console, then retries via API)
6. Download Firebase SDK configs (verifies google-services.json package match)
7. Logo generation (optional — asks user)
8. Package refactor (renames packages, IDs, app name across all modules)
9. Build environment + keystore (local.properties, CocoaPods, generates signing keystore)
10. Git remotes (template as upstream)
   -> Pre-store reminder: prompts user to create Google Play Console app; ASC is created automatically
11. App Store Connect setup (optional — full asc CLI flow, app created automatically)
12. Google Play Console setup (optional — Fastlane builds + uploads AAB to internal track, then full gpc setup)
13. Adapty setup (optional — links to products created in steps 11-12)

**Interactive prompts**: This command has multiple y/n prompts during execution. The user will need to respond in the terminal. Before running, ask the user:
- What app name they want (validate PascalCase)
- Whether they want a custom template repo
- Whether they plan to use the optional steps (logo, ASC, Google Play Console, Adapty) so they know what to expect. The build + refactor happens BEFORE store setup (steps 8-11), then the CLI pauses and reminds the user to create their app in App Store Connect and/or Google Play Console before continuing. Google Play Console setup (step 13) auto-uploads the AAB to the internal track first.

Run the command and let the user interact with it directly.

---

### create-logo — AI Logo Generation

**Syntax**: `kappmaker create-logo [--prompt <text>] [--output <path>]`

**Prerequisites**: `falApiKey` (prompted on first use if not set).

**What it does**:
1. Reads app idea from `--prompt`, or asks the user interactively if omitted
2. Generates a 4x4 grid of 16 logo variations via fal.ai
3. Opens preview image
4. User selects a logo (1-16) with optional zoom/gap adjustments
5. Extracts selected logo to 512x512 PNG
6. Saves to `Assets/app_logo.png` (or custom `--output` path)

**Interactive**: Always interactive for the grid selection (number prompt). The initial app-idea prompt can be skipped by passing `--prompt "..."` up front.

---

### generate-image — Generic AI Image Generator

**Syntax**: `kappmaker generate-image --prompt <text> [options]`

**Options**:
- `--prompt <text>` (required) — Text description of the image
- `--output <path>` — Output file or directory (default: `Assets/generated.png`)
- `--num-images <n>` — Number of images, 1–8 (default: 1)
- `--aspect-ratio <ratio>` — `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, `21:9`, `9:21`, `auto` (default: `1:1`)
- `--resolution <res>` — `1K`, `2K`, `4K` (default: `2K`)
- `--output-format <fmt>` — `png`, `jpg`, `webp` (default: `png`)
- `--reference <paths...>` — Reference inputs; switches to fal.ai's `nano-banana-2/edit` endpoint. Each entry can be a file path, a directory (all `.png`/`.jpg`/`.jpeg`/`.webp` inside are auto-picked, sorted, non-recursive), or an HTTP(S) URL. Capped at 10 references total.

**Prerequisites**: `falApiKey` (prompted on first use if not set). `imgbbApiKey` is optional but recommended when using `--reference` with local files — if set, refs are uploaded to imgbb for reliable URLs; if not, they are sent inline as data URIs.

**What it does**: Thin wrapper around fal.ai's `nano-banana-2` (text-to-image) or `nano-banana-2/edit` (if any reference images are supplied). Submits the request, polls until complete, and downloads the result(s).

**Output path rules**:
- No `--output` → defaults to `Assets/generated.png` (or `generated_1.png`, `_2.png`… for multi)
- `--output` without a file extension → treated as a directory
- `--output` with a file extension → used verbatim for single image; for multi, `_1`, `_2`, … are appended before the extension

**When to use this vs `create-logo`**: Use `create-logo` when the user specifically wants an app logo (grid selection, background removal flow). Use `generate-image` for one-off marketing images, hero shots, backgrounds, illustrations, mockups, or any other general-purpose image task.

---

### create-appstore-app — App Store Connect Setup

**Syntax**: `kappmaker create-appstore-app [--config <path>]`

**Prerequisites**:
- `asc` CLI installed (`which asc`; auto-installs via brew if missing)
- Config keys: `ascKeyId`, `ascIssuerId`, `ascPrivateKeyPath` (for API auth)
- `appleId` — now required (used by both `asc web apps create` and privacy setup)

**Config file**: Looks for `./Assets/appstore-config.json`. If not found, prompts interactively.
- Global defaults at `~/.config/kappmaker/appstore-defaults.json` are used as base layer.

**What it does** (13 steps): Register bundle ID + enable capabilities (Sign in with Apple, In-App Purchases, Push Notifications), create/find app (fully automated — no manual ASC step needed), set content rights, create version, set categories, age rating, localizations, pricing, subscriptions, privacy, encryption, review contact.

**Tip**: Before running, you can help the user review or create the `Assets/appstore-config.json` file. Read the existing config and explain each section. The user can edit it before running.

---

### gpc — Google Play Console Management

**Syntax**:
- `kappmaker gpc setup [--config <path>]` — full 11-step flow (alias: `kappmaker create-play-app`)
- `kappmaker gpc listings push [--config <path>]` — push store listings only
- `kappmaker gpc subscriptions list [--package <pkg>] [--config <path>]`
- `kappmaker gpc subscriptions push [--config <path>]`
- `kappmaker gpc iap list [--package <pkg>] [--config <path>]`
- `kappmaker gpc iap push [--config <path>]`
- `kappmaker gpc data-safety push [--config <path>]`
- `kappmaker gpc app-check --package <pkg>`

**Prerequisites**:
- `googleServiceAccountPath` set in config (Google Play Developer API service account JSON)
- App MUST already exist in [Play Console](https://play.google.com/console/u/0/developers) — Google does not allow API-based app creation. If `gpc setup` gets a 404 at step 4, tell the user to create the app manually first, then rerun.
- No external CLI required — gpc talks directly to `androidpublisher.googleapis.com/v3` via Node's built-in `fetch` + `crypto` (service account → JWT → access token).

**Config file**: Looks for `./Assets/googleplay-config.json`. If not found, `gpc setup` prompts interactively; other subcommands fail and tell the user to run `gpc setup` first.

**What `gpc setup` does** (11 steps):
1. Validate service account + obtain access token
2. Load config (file or interactive prompts)
3. Review summary + confirm
4. Verify app exists on Play Console (fails fast with deep link if not)
5. Update app details (default language + contact website/email/phone) inside an edit
6. Update store listings per locale (title, short/full description, video)
7. Commit the edit
8. Create subscriptions via the new monetization API (subscription → base plans → activate) — idempotent
9. Create one-time in-app products via the **new** `monetization.onetimeproducts.*` API (`PATCH /onetimeproducts/{id}?allowMissing=true` + `purchaseOptions:batchUpdateStates` to activate). Idempotent. Replaces the legacy `/inappproducts` endpoint that Google rejects with 403 "Please migrate to the new publishing API" on migrated apps.
10. Update data safety declaration: converts user's `data_safety.answers` JSON → Google's CSV format via a bundled canonical template + KAppMaker defaults matching the iOS App Store privacy set. Respects `data_safety_csv_path` as an escape hatch for pre-exported CSVs.
11. Print warnings for Play Console-only items (content rating / IARC, app pricing tier)

**Product ID formats**:
- ASC / iOS: `{appname}.premium.{period}.v1.{price}.v1` (e.g. `myapp.premium.weekly.v1.699.v1`)
- Play / Android subscription `productId`: `{appname}.premium.{period}.v1` (e.g. `myapp.premium.weekly.v1`)
- Play / Android `basePlanId`: `autorenew-{period}-{priceDigits}-v1` (e.g. `autorenew-weekly-699-v1`)
- Subscription title (shown on Play checkout): `{AppName} Premium {PeriodLabel}` (e.g. `MyApp Premium Weekly`)

All three systems (ASC, Play, Adapty) use the same generator so the IDs align automatically without extra configuration.

**When to use individual subcommands instead of `setup`**:
- User changed listing copy → `gpc listings push`
- User tweaked subscription prices → `gpc subscriptions push`
- User updated data safety form → `gpc data-safety push`
- CI pre-check that the app exists → `gpc app-check --package <pkg>` (exits 0 or 2)

**Tip**: Before running `gpc setup`, help the user review or create `Assets/googleplay-config.json`. Read the existing config and explain each section (app, details, listings, subscriptions, in_app_products, data_safety). The user can edit it before running.

**Data safety schema**: The `data_safety` JSON block uses KAppMaker defaults: no account creation (`PSL_ACM_NONE`), data deletion question omitted (optional), collects Device ID + Crash logs + Diagnostics + Other performance + App interactions (only — not "Other app activity"), all processed **ephemerally**, collection **required** (users can't turn it off), collected only (not shared), encrypted in transit. Users can override specific answers via `data_safety.answers` with keys like `"QuestionID"` or `"QuestionID/ResponseID"` and values `true`/`false`/`"URL"`/`null`. Escape hatch: `data_safety_csv_path` uploads a pre-filled CSV from Play Console → Policy → App content → Data safety → Export to CSV.

**Manual-only declarations**: The Play Publisher API does NOT expose content rating (IARC), target audience, ads declaration, health apps, financial features, government apps, news apps, gambling, COVID-19 tracing, app access (login walls), advertising ID usage, families compliance, or app pricing tier. Step 11 of `gpc setup` prints a checklist with a deep link to the Play Console App content page for the user to tick these off manually. No API workaround exists.

---

### adapty setup — Subscription Management

**Syntax**: `kappmaker adapty setup [--config <path>]`

**Prerequisites**:
- `adapty` CLI installed (`which adapty`; auto-installs via npm if missing)
- Adapty authentication (CLI handles via browser OAuth)

**Config file**: Looks for `./Assets/adapty-config.json`. If not found, prompts interactively.
- Global defaults at `~/.config/kappmaker/adapty-defaults.json` are used as base layer.

**What it does** (8 steps): Create/find app, set access level, create products (with iOS/Android IDs), create paywalls, create placements.

**Product ID format**: Aligned with App Store Connect AND Google Play Console so Adapty links them across all three systems automatically. `ios_product_id` = `{appname}.premium.{period}.v1.{price}.v1`, `android_product_id` = `{appname}.premium.{period}.v1`, `android_base_plan_id` = `autorenew-{period}-{priceDigits}-v1` (e.g. `autorenew-weekly-699-v1`).

**Prerequisite ordering**: If the user wants Adapty on Android, the Play Console products must exist first. The `create` orchestrator handles this automatically (step 8 runs `gpc setup` before step 9 runs Adapty), but if invoked standalone, tell the user to run `kappmaker gpc setup` (or at least `gpc subscriptions push`) before `kappmaker adapty setup`.

---

### generate-screenshots — AI Screenshot Generation

**Syntax**: `kappmaker generate-screenshots --prompt "<app description>" [options]`

**Options**:
- `--prompt <text>` (required) — App description or PRD
- `--input <dir>` — Reference screenshots directory (default: auto-detect `Assets/screenshots`)
- `--style <id>` — Style preset 1-8 (default: 1)
- `--output <dir>` — Output directory (default: `Assets/screenshots`)
- `--resolution <res>` — AI resolution: 1K, 2K, 4K (default: 2K)
- `--rows <n>` — Grid rows (default: 2)
- `--cols <n>` — Grid columns (default: 4)

**Prerequisites**: `openaiApiKey`, `falApiKey`, `imgbbApiKey` — all prompted on first use if not set.

**What it does**: Calls OpenAI to generate a detailed screenshot prompt, then fal.ai to generate 8 marketing screenshots in a grid, splits them into individual 1284x2778 images, saves to appstore/playstore directories.

**Style presets** (1-8): Different visual styles for the screenshots. Ask the user what style they prefer if not specified.

---

### translate-screenshots — Locale Translation

**Syntax**: `kappmaker translate-screenshots [source-dir] [options]`

**Options**:
- `[source-dir]` — Source screenshots directory (default: `MobileApp/distribution/ios/appstore_metadata/screenshots/en-US`)
- `--output <path>` — Distribution directory root
- `--locales <codes...>` — Target Play Store locale codes, space-separated (default: all 48+)
- `--rows <n>` — Grid rows (default: 2)
- `--cols <n>` — Grid columns (default: 4)
- `--resolution <res>` — 1K, 2K, 4K (default: 2K)

**Prerequisites**: `falApiKey`, `imgbbApiKey` (prompted on first use if not set).

**What it does**: Combines source screenshots into a grid, translates to all target locales in parallel via fal.ai, splits translated grids back into individual images, saves to Fastlane distribution structure for both iOS and Android.

---

### image-split — Grid Image Splitter

**Syntax**: `kappmaker image-split <source> [options]`

**Options**:
- `--rows <n>` (default: 4)
- `--cols <n>` (default: 4)
- `--zoom <factor>` (default: 1.07)
- `--gap <pixels>` (default: 0)
- `--width <pixels>` (default: 512)
- `--height <pixels>` (default: 512)
- `--output-dir <path>` (default: current directory)
- `--keep <indices>` — Comma-separated tile indices to keep (e.g., `1,3,5`)

**Prerequisites**: None (uses local sharp library).

---

### image-remove-bg — Background Removal

**Syntax**: `kappmaker image-remove-bg <source> [--output <path>]`

**Prerequisites**: `falApiKey` (prompted on first use if not set).

---

### image-enhance — Quality Enhancement

**Syntax**: `kappmaker image-enhance <source> [--output <path>]`

**Prerequisites**: `falApiKey` (prompted on first use if not set).

---

### convert-webp — Image to WebP Conversion

**Syntax**: `kappmaker convert-webp <source> [options]`

**Options**:
- `--quality <n>` — WebP quality, 0–100 (default: 75)
- `--recursive` — Search directories recursively (default: false)
- `--delete-originals` — Delete original files after conversion (default: false)
- `--output <dir>` — Output directory (default: same directory as source)

**Prerequisites**: None (uses local sharp library, no API key needed).

**What it does**: Converts PNG, JPG, JPEG, BMP, TIFF, and GIF images to WebP format — similar to Android Studio's built-in converter. Shows before/after file sizes and percentage saved for each file. Works on single files or entire directories (with `--recursive`).

---

### fastlane configure — Set Up Fastlane

**Syntax**: `kappmaker fastlane configure`

**Prerequisites**: Ruby and Bundler (`gem install bundler`). Run from the project root or inside `MobileApp/`.

**What it does**: Creates `Gemfile` + `fastlane/Fastfile` in the mobile app directory, then runs `bundle install`. Skips files that already exist. This is a prerequisite for `kappmaker publish`.

---

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

### config — Configuration Management

**Subcommands**:
- `kappmaker config list` — Show all config values
- `kappmaker config get <key>` — Get a specific value
- `kappmaker config set <key> <value>` — Set a value
- `kappmaker config path` — Show config file path
- `kappmaker config init` — Interactive setup wizard (has prompts)
- `kappmaker config appstore-defaults --init` — Interactive App Store defaults setup
- `kappmaker config appstore-defaults --save <file>` — Save JSON as global defaults
- `kappmaker config adapty-defaults --save <file>` — Save Adapty JSON as global defaults

**Valid config keys**: `templateRepo`, `bundleIdPrefix`, `androidSdkPath`, `organization`, `falApiKey`, `imgbbApiKey`, `openaiApiKey`, `ascAuthName`, `ascKeyId`, `ascIssuerId`, `ascPrivateKeyPath`, `appleId`, `googleServiceAccountPath`.

For config setup, prefer using `kappmaker config set <key> <value>` for each key individually rather than `kappmaker config init` (which is fully interactive and harder to guide through).

## API Key Sources

| Key | Where to get it |
|-----|----------------|
| `falApiKey` | https://fal.ai/dashboard/keys |
| `imgbbApiKey` | https://api.imgbb.com (free) |
| `openaiApiKey` | https://platform.openai.com/api-keys |
| `ascKeyId` + `ascIssuerId` + `ascPrivateKeyPath` | App Store Connect > Users and Access > Integrations > App Store Connect API |
| `appleId` | Your Apple ID email address |
| `googleServiceAccountPath` | Google Cloud Console > IAM > Service Accounts > Keys > JSON (then grant access in Play Console > Users and permissions). Used by both `kappmaker publish --platform android` and the entire `kappmaker gpc` command group. |

## Error Handling

- If a command fails, read the error output carefully.
- Common issues:
  - **Missing API keys (fal.ai, OpenAI, imgbb)**: The CLI prompts for them inline on first use and saves to config automatically. No need to pre-configure — the user will be asked when a command needs a key.
  - **Firebase auth errors**: Run `firebase login` separately first
  - **asc not found**: Run `brew install asc`
  - **adapty not found**: Run `npm install -g adapty`
  - **App name validation**: Must be PascalCase, start uppercase, alphanumeric only
  - **Directory already exists**: The create command will ask whether to delete it
- Steps that fail due to missing dependencies warn and skip gracefully instead of aborting the entire flow.
- Missing API keys are prompted inline and saved to config on first use (never fatal exits for unconfigured keys).
- If no config file exists when `create` runs, `configInit()` is triggered automatically before the first step.
- Missing App Store Connect config triggers inline interactive setup (API key, Apple ID, review contact).

## Chaining Commands

Some common workflows:
1. **Full app setup**: `kappmaker create <AppName>` (does everything)
2. **Screenshots pipeline**: First `generate-screenshots`, then `translate-screenshots`
3. **Logo pipeline**: `create-logo`, then optionally `image-remove-bg` and `image-enhance`
4. **Generic image pipeline**: `generate-image`, then optionally `image-remove-bg` and `image-enhance` for one-off assets (hero images, backgrounds, mockups)
4. **Store setup**: `create-appstore-app`, then `gpc setup`, then `adapty setup` — product IDs align automatically across all three systems. On Android, the Play Console app must already exist (create manually once in Play Console, then `gpc setup` configures everything else).
5. **Iterate on Play Store copy without a full upload**: edit `Assets/googleplay-config.json`, then `kappmaker gpc listings push` (skips Fastlane, talks to the API directly)
5. **Rebrand app**: `refactor --app-id <new-id> --app-name <new-name>`, then `update-version`
6. **First publish**: `fastlane configure`, then `android-release-build`, then `publish`
