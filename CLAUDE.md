# CLAUDE.md

## Project Overview

KAppMaker CLI — a TypeScript/Node.js CLI tool that automates mobile app bootstrapping for the KAppMaker platform. It wraps Firebase CLI, Gradle, Fastlane, CocoaPods, Git, fal.ai, App Store Connect CLI (asc), and Adapty CLI into a single workflow. Google Play Console management is built-in (not wrapping any external CLI) — `gpc.service.ts` talks directly to `androidpublisher.googleapis.com/v3` via Node's built-in `fetch` + `crypto` (service-account JWT flow).

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
- Missing API keys (fal.ai, OpenAI, imgbb) are prompted inline and saved to config on first use — no fatal exits for missing keys
- Missing App Store Connect config (API key, Apple ID) triggers inline interactive setup via `configAppStoreDefaults`
- If no `~/.config/kappmaker/config.json` exists when `create` runs, `configInit()` is called automatically before the first step

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
npx tsx src/index.ts gpc setup                     # Google Play Console setup (full 11-step flow)
npx tsx src/index.ts create-play-app               # Alias for `gpc setup`
npx tsx src/index.ts gpc app-check --package <pkg> # Verify app exists on Play Console
npx tsx src/index.ts gpc listings push             # Push store listings from config
npx tsx src/index.ts gpc subscriptions list [--package <pkg>]  # List existing subscriptions
npx tsx src/index.ts gpc subscriptions push        # Create/reuse subscriptions from config
npx tsx src/index.ts gpc iap list [--package <pkg>]            # List existing in-app products
npx tsx src/index.ts gpc iap push                  # Create/reuse IAPs from config
npx tsx src/index.ts gpc data-safety push          # Push data safety declaration from config
npx tsx src/index.ts adapty setup                  # Adapty products/paywall/placements setup
npx tsx src/index.ts fastlane configure                                    # Set up Fastlane (Gemfile + Fastfile + bundle install)
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
3. Create Firebase project — if creation fails, warns and skips steps 4-6
4. Create Firebase apps (Android + iOS)
5. Enable anonymous authentication (Identity Toolkit REST API; if brand-new project, prompts user to click "Get started" in Firebase Console, then retries)
6. Download Firebase SDK configs (KAppMaker paths or `Assets/` fallback; verifies google-services.json package matches config)
7. Logo generation (optional — asks user, then auto-removes background)
8. Package refactor — renames packages, IDs, and app name across all modules (composeApp, designsystem, libs)
9. Build environment + keystore — local.properties, CocoaPods, generates signing keystore if missing
10. Git remotes (template as upstream)
    ↕ Pre-store reminder: prompts user to create Google Play Console app; ASC is created automatically
11. App Store Connect setup (optional — calls `createAppStoreApp`; app is created automatically via `asc web apps create`)
12. Google Play Console setup (optional) — Fastlane builds + uploads AAB to internal track first (so billing is enabled for subscriptions), then calls `createPlayApp`
13. Adapty setup (optional — calls `adaptySetup`)

## Project Structure

```
src/
  index.ts                  # Entry point (shebang)
  cli.ts                    # Commander.js program setup
  commands/
    create.ts               # Full app setup (13-step orchestrator: Firebase + logo + refactor + build + ASC + GPC + Adapty)
    create-logo.ts          # Logo generation (fal.ai + sharp)
    create-appstore-app.ts  # App Store Connect setup (13-step orchestrator via asc CLI)
    create-play-app.ts      # Google Play Console setup (11-step orchestrator via direct Publisher API)
    gpc.ts                  # kappmaker gpc subcommands: setup, app-check, listings, subscriptions, iap, data-safety
    adapty-setup.ts         # Adapty setup (8-step orchestrator via adapty CLI)
    split.ts                # image-split — grid image splitter
    remove-bg.ts            # image-remove-bg — background removal (fal.ai bria)
    enhance.ts              # image-enhance — upscale quality (fal.ai nano-banana-2/edit)
    translate-screenshots.ts  # Screenshot translation to multiple locales (fal.ai)
    generate-screenshots.ts   # AI screenshot generation (OpenAI + fal.ai)
    fastlane-configure.ts   # Set up Fastlane (Gemfile + Fastfile + bundle install)
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
    fastlane-setup.service.ts # Fastlane scaffolding (Gemfile + Fastfile + bundle install)
    publish.service.ts      # Android/iOS publishing via Fastlane (Play Store + App Store)
    keystore.service.ts     # Android keystore generation (keytool + properties)
    gradle.service.ts       # Gradle build helpers (local.properties, clean & build)
    ios.service.ts          # CocoaPods install
    fastlane.service.ts     # Android release build (keystore + gradle) + AAB path finder
    logo.service.ts         # Prompt builder + sharp image extraction/splitting
    asc.service.ts          # App Store Connect CLI wrapper (bundle ID + capabilities, app creation, version, categories, metadata)
    asc-monetization.service.ts  # ASC pricing, subscriptions, in-app purchases
    gpc.service.ts          # Google Play Publisher API wrapper (service-account JWT auth, edits, listings, data safety, app state probe) — no external CLI
    gpc-monetization.service.ts  # Play new monetization API (subscriptions + base plans + one-time products via oneTimeProducts, NOT legacy inappproducts)
    gpc-data-safety.service.ts   # JSON→CSV converter for Data Safety form, using bundled canonical template
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
    googleplay-config.json  # Default Google Play Console config template
    data-safety-template.json  # Canonical Play Data Safety form schema (783 rows, 217 Q IDs)
    adapty-config.json      # Default Adapty config template
  types/
    index.ts                # Shared interfaces
    appstore.ts             # App Store Connect config interfaces
    googleplay.ts           # Google Play Console config interfaces
    adapty.ts               # Adapty config interfaces
```

## Adding a New Command

1. Create `src/commands/<name>.ts` with an exported async function
2. Register the command in `src/cli.ts` using Commander.js
3. Create any needed services in `src/services/`

## Adding a New Service

1. Create `src/services/<tool>.service.ts`
2. For services that wrap an external CLI: import `run` or `runStreaming` from `src/utils/exec.js` and shell out with typed arguments.
3. For services that talk to an HTTP API directly (see `gpc.service.ts`): use Node's built-in `fetch` + `node:crypto` (for JWT signing if needed). Add a local `apiRequest<T>()` helper that reuses an `ora` spinner for UX parity with `run()` in `exec.ts`. Do not add new npm dependencies without a concrete reason.
4. Export individual functions (not a class).

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
| `googleServiceAccountPath` | `~/credentials/google-service-app-publisher.json` | `publish.service.ts` → Fastlane upload; `gpc.service.ts` → Play Publisher API auth (JWT → access token) |

### Subscription Product ID Alignment

Subscription IDs are auto-generated by `create-appstore-app`, `create-play-app` (`gpc setup`), and `adapty setup` so they all link automatically:

| Platform | Field | Format | Example ($6.99 weekly) |
|---|---|---|---|
| App Store Connect | `productId` | `{appname}.premium.{period}.v1.{price}.v1` | `myapp.premium.weekly.v1.699.v1` |
| Google Play | `productId` (subscription) | `{appname}.premium.{period}.v1` | `myapp.premium.weekly.v1` |
| Google Play | `basePlanId` | `autorenew-{period}-{priceDigits}-v1` | `autorenew-weekly-699-v1` |
| Adapty | `ios_product_id` | matches ASC `productId` | `myapp.premium.weekly.v1.699.v1` |
| Adapty | `android_product_id` | matches Play `productId` | `myapp.premium.weekly.v1` |
| Adapty | `android_base_plan_id` | matches Play `basePlanId` | `autorenew-weekly-699-v1` |

The subscription name (shown on Play's checkout sheet) is auto-filled as `{AppName} Premium {PeriodLabel}` (e.g. `Mangit Premium Weekly`).

**`priceDigits`** is the price with the decimal removed (e.g. `6.99` → `699`, `29.99` → `2999`). `{period}` is one of `weekly`, `monthly`, `twomonths`, `quarterly`, `semiannual`, `yearly` — derived from the App Store subscription period or the Google Play `billing_period` (ISO 8601: `P1W`, `P1M`, `P2M`, `P3M`, `P6M`, `P1Y`).

### Privacy Interactive Prompts

During interactive config setup (when no config file exists), `create-appstore-app` asks whether the app accesses user content (e.g., AI image/video wrapper). If yes, `PHOTOS_OR_VIDEOS` and `OTHER_USER_CONTENT` entries are added to privacy data usages (both as `APP_FUNCTIONALITY` / `DATA_NOT_LINKED_TO_YOU`).

### App Store Global Defaults

Stored at `~/.config/kappmaker/appstore-defaults.json`. Used by `create-appstore-app` as a base layer — shared fields like review contact, privacy, age rating, encryption, and subscriptions are loaded from here.

Config resolution: built-in template → global defaults → local `./Assets/appstore-config.json` → interactive prompts.

### Adapty Global Defaults

Stored at `~/.config/kappmaker/adapty-defaults.json`. Used by `adapty setup` as a base layer — shared fields like access level, paywalls, placements, and product structure.

Config resolution: built-in template → global defaults → local `./Assets/adapty-config.json` → interactive prompts.

### Google Play Console management (`kappmaker gpc`)

Talks directly to `androidpublisher.googleapis.com/v3` via a built-in service-account JWT → access-token flow (no external CLI, no new npm deps — uses Node's `crypto` and `fetch`). Auth shares `googleServiceAccountPath` with `publish --platform android`.

**Command tree:**

```
kappmaker gpc
├── setup                  # Full 11-step orchestrator (create-play-app is an alias)
├── app-check              # GET /subscriptions probe (migration-safe) — 0 if found, 2 if missing
├── listings
│   └── push               # Start edit → updateDetails → updateListing per locale → commit
├── subscriptions
│   ├── list               # GET /applications/{pkg}/subscriptions
│   └── push               # Idempotent create + base plan activate (new monetization API)
├── iap
│   ├── list               # GET /applications/{pkg}/oneTimeProducts (new monetization API)
│   └── push               # Idempotent create via PATCH /onetimeproducts/{id}?allowMissing=true + activate purchase option
└── data-safety
    └── push               # POST /applications/{pkg}/dataSafety (pass-through body)
```

**Setup flow (11 steps):**

1. Validate `googleServiceAccountPath` and obtain an access token
2. Load config (`./Assets/googleplay-config.json` or interactive prompts)
3. Review summary and confirm
4. Verify app exists on Play Console (fails fast with a deep link if not — Google does not allow app creation via the public API)
5. Update app details (default language + contact website/email/phone) inside an edit
6. Update store listings per locale (title, short/full description, video)
7. Commit the edit
8. Create subscriptions via the new monetization API (`subscriptions` → base plans → activate)
9. Create one-time in-app products via the new monetization API (`monetization.onetimeproducts.*`) with an activated `default` purchase option
10. Update data safety declaration. Converts user-facing JSON (`data_safety.answers`) to Google's CSV format via `buildDataSafetyCsv()`, using a bundled canonical template at `src/templates/data-safety-template.json` (extracted from the [fastlane-plugin-google_data_safety](https://github.com/owenbean400/fastlane-plugin-google_data_safety) canonical helper). KAppMaker's default answers mirror the iOS App Store privacy set (USER_ID/DEVICE_ID collected for app functionality, CRASH_DATA/PERFORMANCE_DATA/DIAGNOSTICS/USER_INTERACTION collected for analytics). Escape hatch: `data_safety_csv_path` → path to a Play-Console-exported CSV, uploaded verbatim.
    - **Account creation:** `PSL_ACM_NONE` (no account creation)
    - **Data deletion:** omitted (optional question)
    - **App activity:** only App interactions (`PSL_USER_INTERACTION`), NOT "Other app activity"
    - **Data handling for ALL types:** ephemeral=YES, user control=REQUIRED (can't turn off), collected only (not shared)
    - **Encrypted in transit:** YES
11. Print a full checklist of manual-only Play Console declarations that the Publisher API does NOT expose: content rating (IARC), target audience, ads, health apps, financial features, government apps, news apps, gambling, COVID-19 tracing, app access, advertising ID usage, families policy, and app pricing tier. Verified against the v3 discovery document — none of these have REST endpoints.

**Idempotency:** `subscriptions push` and `iap push` call `listSubscriptions`/`listInAppProducts` first and skip already-existing product IDs / SKUs. Safe to rerun.

**Individual push commands** reuse the same config file (`Assets/googleplay-config.json`) and operate on just one section — useful when iterating on listings copy or subscription prices without rerunning the full flow. All require the config to already exist (run `gpc setup` first or create it manually).

**`gpc app-check`** is a side-effect-free probe (GET, no edit created) — exits 0 if the app exists and 2 if it doesn't.

### Default Inputs

- `translate-screenshots` defaults to `MobileApp/distribution/ios/appstore_metadata/screenshots/en-US` when no source dir is provided. Output defaults to `MobileApp/distribution` if it exists, otherwise falls back to the parent of the source directory.

## Defaults

- Template repo: `git@github.com:KAppMaker/KAppMaker-MobileAppAndWeb.git`
- Package pattern: `com.measify.<appname>` (when `bundleIdPrefix` is set to `com.measify`)
- After cloning, origin is renamed to upstream (user adds their own origin later)
