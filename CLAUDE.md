# CLAUDE.md

## Project Overview

KAppMaker CLI — a TypeScript/Node.js CLI tool that automates mobile app bootstrapping for the KAppMaker platform. It wraps Firebase CLI, Gradle, Fastlane, CocoaPods, Git, fal.ai, App Store Connect CLI (asc), and Adapty CLI into a single workflow.

## Tech Stack

- **TypeScript** with ESM (`"type": "module"` in package.json)
- **Commander.js** for CLI structure
- **execa** for subprocess execution
- **chalk** for colored output
- **ora** for spinners
- **fs-extra** for file operations
- **sharp** for image processing (logo extraction, grid splitting)

## Key Conventions

- All imports use `.js` extensions (required by NodeNext module resolution)
- Each CLI command lives in its own file under `src/commands/`
- Each external tool (firebase, git, gradle, fal.ai, etc.) has its own service under `src/services/`
- No file should exceed ~150 lines
- Use `async/await` everywhere
- Use `run()` from `src/utils/exec.ts` for commands with spinner output
- Use `runStreaming()` for interactive commands (e.g., `firebase login`)
- Graceful degradation — steps that fail or detect missing dependencies warn and skip instead of aborting the entire flow

## Commands

```bash
npm run dev          # Run with tsx (no build needed)
npm run build        # Compile TypeScript to dist/
npx tsx src/index.ts create <AppName>              # Full end-to-end app setup (13 steps)
npx tsx src/index.ts create-logo                   # Logo generation
npx tsx src/index.ts image-split <image> [opts]    # Split grid image (--keep 1,3 to filter)
npx tsx src/index.ts image-remove-bg <image>       # Remove background
npx tsx src/index.ts image-enhance <image>         # Enhance quality
npx tsx src/index.ts translate-screenshots          # Translate screenshots (default: en-US source)
npx tsx src/index.ts translate-screenshots <dir> --locales de-DE ja-JP  # Specific locales
npx tsx src/index.ts generate-screenshots --prompt "A fitness app..."   # Generate marketing screenshots
npx tsx src/index.ts create-appstore-app           # App Store Connect setup
npx tsx src/index.ts adapty setup                  # Adapty products/paywall/placements setup
npx tsx src/index.ts publish --platform android                            # Publish Android to Play Store
npx tsx src/index.ts publish --platform ios                                # Publish iOS to App Store
npx tsx src/index.ts publish                                               # Publish to both stores
npx tsx src/index.ts generate-keystore --organization "MyCompany"          # Generate Android signing keystore
npx tsx src/index.ts android-release-build                                # Build signed Android AAB
npx tsx src/index.ts refactor --app-id com.example.myapp --app-name MyApp  # Full package refactor
npx tsx src/index.ts refactor --app-id com.example.myapp --app-name MyApp --skip-package-rename  # IDs only
npx tsx src/index.ts update-version                # Bump patch version + versionCode on both platforms
npx tsx src/index.ts update-version -v 2.0.0       # Set explicit version name
```

## Custom Template Support

The CLI defaults to the [KAppMaker](https://kappmaker.com) boilerplate but supports custom templates via `--template-repo` or `kappmaker config set templateRepo <url>`.

Steps 1–9 of the `create` command are universal (or optional). Steps 10–13 detect the boilerplate structure and skip gracefully with warnings when the expected files are not found:

- **Step 10 (Package refactor)** — uses TypeScript refactor service (no longer depends on Gradle task)
- **Step 11 (Build env)** — checks for `gradlew` before `local.properties`, checks for `Podfile` before CocoaPods
- **Step 12 (Git remotes)** — always runs (works with any template)
- **Step 13 (Fastlane build)** — checks for `Fastfile` before attempting the build
- **Step 6 (Firebase configs)** — falls back to `Assets/` if KAppMaker directories don't exist
- **translate-screenshots** — falls back to parent of source dir if `MobileApp/distribution` doesn't exist

## Create Command Flow (13 steps)

The `create` command is the main orchestrator that runs everything end-to-end:

1. Clone template repository
2. Firebase login
3. Create Firebase project — if creation fails, warns and skips steps 4–6
4. Create Firebase apps (Android + iOS)
5. Enable anonymous authentication (Identity Toolkit REST API)
6. Download Firebase SDK configs (KAppMaker paths or `Assets/` fallback)
7. Logo generation (optional — asks user, then auto-removes background)
8. App Store Connect setup (optional — calls `createAppStoreApp`)
9. Adapty setup (optional — calls `adaptySetup`)
10. Package refactor — renames packages, IDs, and app name (TypeScript, no Gradle dependency)
11. Build environment — skipped with warning if `gradlew`/`Podfile` not found
12. Git remotes (template as upstream)
13. Android release build — generates keystore if needed, builds AAB (skipped if `gradlew` not found)

## Project Structure

```
src/
  index.ts                  # Entry point (shebang)
  cli.ts                    # Commander.js program setup
  commands/
    create.ts               # Full app setup (13-step orchestrator: Firebase + logo + ASC + Adapty + build)
    create-logo.ts          # Logo generation (fal.ai + sharp)
    create-appstore-app.ts  # App Store Connect setup (13-step orchestrator via asc CLI)
    adapty-setup.ts         # Adapty setup (8-step orchestrator via adapty CLI)
    split.ts                # image-split — grid image splitter
    remove-bg.ts            # image-remove-bg — background removal (fal.ai bria)
    enhance.ts              # image-enhance — upscale quality (fal.ai nano-banana-2/edit)
    translate-screenshots.ts  # Screenshot translation to multiple locales (fal.ai)
    generate-screenshots.ts   # AI screenshot generation (OpenAI + fal.ai)
    publish.ts              # Build and upload to Google Play / App Store via Fastlane
    generate-keystore.ts    # Generate Android signing keystore
    android-release-build.ts # Build signed Android release AAB
    refactor.ts             # Package name, application ID, bundle ID, and app name refactoring
    update-version.ts       # Bump Android + iOS version codes and version name
    config.ts               # Config management (list, set, get, init)
  services/
    firebase.service.ts     # Firebase CLI wrapper (project + app creation + anonymous auth via REST)
    fal.service.ts          # fal.ai HTTP API (submit, poll, fetch, download, translate, screenshot generation)
    openai.service.ts       # OpenAI API (prompt generation for screenshots)
    screenshot-styles.ts    # Screenshot style prompts (8 styles) for generate-screenshots
    git.service.ts          # Git clone + remote setup
    publish.service.ts      # Android/iOS publishing via Fastlane (Play Store + App Store)
    keystore.service.ts     # Android keystore generation (keytool + properties)
    gradle.service.ts       # Gradle build helpers (local.properties, clean & build)
    ios.service.ts          # CocoaPods install
    fastlane.service.ts     # Android release build (keystore + gradle) + AAB path finder
    logo.service.ts         # Prompt builder + sharp image extraction/splitting
    asc.service.ts          # App Store Connect CLI wrapper (app, version, categories, metadata)
    asc-monetization.service.ts  # ASC pricing, subscriptions, in-app purchases
    adapty.service.ts       # Adapty CLI wrapper (apps, access levels, products, paywalls, placements)
    refactor.service.ts     # Package/app name refactoring (Kotlin sources, Gradle, iOS, Firebase, workflows)
    screenshot.service.ts   # Screenshot grid combine/split, locale mapping, Fastlane output
    version.service.ts      # Android + iOS version reading/writing (build.gradle.kts, pbxproj, Info.plist)
  utils/
    logger.ts               # chalk-based step/success/error logging
    exec.ts                 # execa wrapper with spinner and streaming modes
    validator.ts            # CLI dependency checks + app name validation
    config.ts               # User config loader/saver (~/.config/kappmaker/config.json)
    prompt.ts               # Interactive prompts (confirm, input)
  templates/
    appstore-config.json    # Default App Store Connect config template
    adapty-config.json      # Default Adapty config template
  types/
    index.ts                # Shared interfaces
    appstore.ts             # App Store Connect config interfaces
    adapty.ts               # Adapty config interfaces
```

## Adding a New Command

1. Create `src/commands/<name>.ts` with an exported async function
2. Register the command in `src/cli.ts` using Commander.js
3. Create any needed services in `src/services/`

## Adding a New Service

1. Create `src/services/<tool>.service.ts`
2. Import `run` or `runStreaming` from `src/utils/exec.js`
3. Export individual functions (not a class)

## Configuration

User config file: `~/.config/kappmaker/config.json` (managed via `src/utils/config.ts`)

| Key | Default | Used by |
|-----|---------|---------|
| `templateRepo` | `git@github.com:KAppMaker/KAppMaker-MobileAppAndWeb.git` | `create.ts` → template clone |
| `bundleIdPrefix` | `""` (empty = `com.<appname>`) | `create.ts` → package/bundle ID |
| `androidSdkPath` | `~/Library/Android/sdk` | `gradle.service.ts` → `local.properties` |
| `organization` | `""` (empty = app name) | `fastlane.service.ts` → keystore signing |
| `falApiKey` | `""` | `fal.service.ts` → logo generation, background removal, enhancement, screenshot translation/generation |
| `imgbbApiKey` | `""` | `fal.service.ts` → image upload for screenshot translation and generation (free at api.imgbb.com) |
| `openaiApiKey` | `""` | `openai.service.ts` → screenshot generation prompt (GPT-4.1) |
| `ascAuthName` | `"KAppMaker"` | `asc.service.ts` → credential name stored in keychain for auto-login |
| `ascKeyId` | `""` | `asc.service.ts` → App Store Connect API authentication |
| `ascIssuerId` | `""` | `asc.service.ts` → App Store Connect API authentication |
| `ascPrivateKeyPath` | `""` | `asc.service.ts` → path to `.p8` key (copied to config dir) |
| `appleId` | `""` | `asc.service.ts` → Apple ID for privacy setup (asc web privacy) |
| `googleServiceAccountPath` | `~/credentials/google-service-app-publisher.json` | `publish.service.ts` → Google Play API authentication |

### Subscription Product ID Alignment

Both `create-appstore-app` and `adapty setup` auto-generate iOS product IDs in the same format: `{appname}.premium.{period}.v1.{price}.v1` (e.g., `myapp.premium.weekly.v1.699.v1`). Adapty products include a `price` field so the IDs match across both systems.

### Privacy Interactive Prompts

During interactive config setup (when no config file exists), `create-appstore-app` asks whether the app accesses user content (e.g., AI image/video wrapper). If yes, `PHOTOS_OR_VIDEOS` and `OTHER_USER_CONTENT` entries are added to privacy data usages (both as `APP_FUNCTIONALITY` / `DATA_NOT_LINKED_TO_YOU`).

### App Store Global Defaults

Stored at `~/.config/kappmaker/appstore-defaults.json`. Used by `create-appstore-app` as a base layer — shared fields like review contact, privacy, age rating, encryption, and subscriptions are loaded from here.

Config resolution: built-in template → global defaults → local `./Assets/appstore-config.json` → interactive prompts.

### Adapty Global Defaults

Stored at `~/.config/kappmaker/adapty-defaults.json`. Used by `adapty setup` as a base layer — shared fields like access level, paywalls, placements, and product structure.

Config resolution: built-in template → global defaults → local `./Assets/adapty-config.json` → interactive prompts.

### Default Inputs

- `translate-screenshots` defaults to `MobileApp/distribution/ios/appstore_metadata/screenshots/en-US` when no source dir is provided. Output defaults to `MobileApp/distribution` if it exists, otherwise falls back to the parent of the source directory.

## Defaults

- Template repo: `git@github.com:KAppMaker/KAppMaker-MobileAppAndWeb.git`
- Package pattern: `com.measify.<appname>` (when `bundleIdPrefix` is set to `com.measify`)
- After cloning, origin is renamed to upstream (user adds their own origin later)
