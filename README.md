# KAppMaker CLI

> **Full documentation at [cli.kappmaker.com](https://cli.kappmaker.com)**

CLI tool that automates the entire mobile app launch process — from project scaffolding to store-ready builds.

A single `kappmaker create` command can:
- Clone a template repository and set up a new project
- Create a Firebase project, register Android + iOS apps, enable authentication, and download SDK configs
- Generate an AI-powered app logo with automatic background removal
- Create an App Store Connect listing with metadata, categories, age rating, subscriptions, privacy declarations, and review contact info
- Configure an existing Google Play Console app — store listings, subscriptions, one-time in-app products, and the data safety declaration — via a built-in wrapper around the Play Publisher API (no external CLI, no extra dependencies)
- Set up Adapty subscription products, paywalls, and placements for both iOS and Android
- Refactor Gradle package names and application IDs
- Set up the build environment (Android SDK)
- Produce a signed Android release build (AAB) via Fastlane, ready to upload to Google Play

On top of that, standalone commands let you generate marketing screenshots from a text description, translate screenshots to 48+ locales in parallel, generate arbitrary images with AI, remove image backgrounds, enhance image quality, and split grid images — all powered by AI.

By default it uses the [KAppMaker](https://kappmaker.com) boilerplate (Kotlin Multiplatform), but you can bring your own template repository via `--template-repo` or `kappmaker config set templateRepo <your-repo-url>`. Boilerplate-specific steps (Gradle refactor, Fastlane build, CocoaPods) are automatically detected and skipped with a warning when using a custom template.

## Installation

```bash
npm install -g kappmaker
```

Then use it anywhere:

```bash
kappmaker create <AppName>
```

<details>
<summary>Development setup</summary>

```bash
npm install
npx tsx src/index.ts create <AppName>
```

</details>

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

See [all config keys](#config-keys) and [external services setup](#external-services--api-keys) for details.

## Claude Code Skill

If you use [Claude Code](https://claude.ai/code), you can install the `/kappmaker` skill to run any CLI command through natural language — with automatic prerequisite checks, guided setup, and inline error recovery.

**Install:**

```bash
npx skills add KAppMaker/KAppMaker-CLI --skill kappmaker
```

Or via the Claude Code plugin system:

```
/plugin marketplace add KAppMaker/KAppMaker-CLI
/plugin install kappmaker@KAppMaker-CLI
```

**Use:**

```
/kappmaker create MyApp
/kappmaker generate screenshots for my fitness app
/kappmaker set up App Store Connect
```

Claude will check your config, verify API keys are set, and walk you through any missing prerequisites before running the command.

**Context-aware**: when a command needs inputs you didn't pass (app description, app name, brand color, tagline, keywords, etc.), the skill reads your project's `AiGuidelines/` folder first (`app-idea.md`, `prd.md`, `keywords.md`, `brand.md`), then `README.md`, then existing ASO metadata, and fills in what it finds — you're only prompted for things that aren't already written down somewhere in the project.

## Table of Contents

- [Claude Code Skill](#claude-code-skill)
- [Configuration](#configuration)
- [Commands Overview](#commands-overview)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [External Services & API Keys](#external-services--api-keys)
- [Commands](#commands)
  - [`create <app-name>`](#create-app-name)
  - [`clone <app-name>`](#clone-app-name)
  - [`git setup-upstream`](#git-setup-upstream)
  - [`firebase`](#firebase) — Firebase setup steps (login, project, apps, auth, configs)
  - [`create-logo`](#create-logo)
  - [`generate-image`](#generate-image)
  - [`create-appstore-app`](#create-appstore-app)
  - [`appstore-monetization-push`](#appstore-monetization-push) — Push subs + IAPs from config to ASC (standalone)
  - [`gpc`](#gpc) — Google Play Console management
  - [`gpc monetization push`](#gpc-monetization-push) — Push subs + IAPs from config to Play (standalone)
  - [`subscription add`](#subscription-add) — Quick-add a subscription to Play + ASC
  - [`iap add`](#iap-add) — Quick-add a credit-pack IAP to Play + ASC + Adapty
  - [`adapty setup`](#adapty-setup)
  - [Image Tools](#image-tools)
  - [`convert-webp`](#convert-webp-source)
  - [`translate-screenshots`](#translate-screenshots-source-dir)
  - [`generate-screenshots`](#generate-screenshots)
  - [`generate-feature-image`](#generate-feature-image)
  - [`generate-ios-icons`](#generate-ios-icons)
  - [`generate-android-icons`](#generate-android-icons)
  - [ASO Keyword Research (skill-driven)](#aso-keyword-research-skill-driven)
  - [ASO Metadata Localization (skill-driven)](#aso-metadata-localization-skill-driven)
  - [`fastlane configure`](#fastlane-configure)
  - [`publish`](#publish)
  - [`generate-keystore`](#generate-keystore)
  - [`android-release-build`](#android-release-build)
  - [`refactor`](#refactor)
  - [`update-version`](#update-version)
- [Config Reference](#config-reference)
- [Project Structure](#project-structure)

## Commands Overview

| Command | Description |
|---------|-------------|
| [`kappmaker create <app-name>`](#create-app-name) | Full end-to-end app setup (Firebase, logo, App Store Connect, Google Play Console, Adapty, release build) |
| [`kappmaker clone <app-name>`](#clone-app-name) | Clone the template into `<AppName>-All` (step 1 of `create` as a standalone) |
| [`kappmaker git setup-upstream`](#git-setup-upstream) | Rename `origin` to `upstream` (step 10 of `create` as a standalone) |
| [`kappmaker firebase login`](#firebase) | `firebase login` — authenticate the Firebase CLI |
| [`kappmaker firebase project`](#firebase) | Create a Firebase project (idempotent) |
| [`kappmaker firebase apps`](#firebase) | Create Android + iOS apps in a Firebase project (idempotent) |
| [`kappmaker firebase auth-anonymous`](#firebase) | Enable anonymous authentication |
| [`kappmaker firebase configs`](#firebase) | Download `google-services.json` + `GoogleService-Info.plist` |
| [`kappmaker create-logo`](#create-logo) | Generate an app logo with AI (fal.ai) |
| [`kappmaker generate-image`](#generate-image) | Generate an arbitrary image with AI — generic wrapper around fal.ai nano-banana-2 |
| [`kappmaker create-appstore-app`](#create-appstore-app) | Set up an app on App Store Connect (metadata, subscriptions, privacy) |
| [`kappmaker appstore-monetization-push`](#appstore-monetization-push) | Push subscriptions + IAPs from `appstore-config.json` to App Store Connect (monetization step of `create-appstore-app` as a standalone; supports `--subscriptions-only`, `--iap-only`, `--config`) |
| [`kappmaker gpc setup`](#gpc) | Set up an existing app on Google Play Console (listings, subscriptions, IAPs, data safety) |
| [`kappmaker gpc listings push`](#gpc) | Push store listings from the Google Play config file |
| [`kappmaker gpc subscriptions list/push`](#gpc) | List or push subscriptions on Google Play Console |
| [`kappmaker gpc iap list/push`](#gpc) | List or push one-time in-app products on Google Play Console |
| [`kappmaker gpc data-safety push`](#gpc) | Push data safety declaration on Google Play Console |
| [`kappmaker gpc app-check --package <pkg>`](#gpc) | Check if a package exists on Google Play Console |
| [`kappmaker gpc monetization push`](#gpc-monetization-push) | Push subscriptions + IAPs from `googleplay-config.json` to Google Play Console (monetization steps of `gpc setup` as a standalone; supports `--subscriptions-only`, `--iap-only`) |
| [`kappmaker subscription add`](#subscription-add) | Quick-add one new subscription to Google Play + App Store Connect (auto-aligned IDs, full PPP fan-out, auto-creates ASC subscription group if missing) |
| [`kappmaker iap add`](#iap-add) | Quick-add one new credit-pack IAP to Google Play + App Store Connect + Adapty (auto-aligned IDs, full PPP fan-out) |
| [`kappmaker adapty setup`](#adapty-setup) | Set up Adapty products, paywalls, and placements |
| [`kappmaker image-split <image>`](#image-split-source) | Split a grid image into individual tiles |
| [`kappmaker image-remove-bg <image>`](#image-remove-bg-source) | Remove background from an image (fal.ai) |
| [`kappmaker image-enhance <image>`](#image-enhance-source) | Upscale and enhance image quality (fal.ai) |
| [`kappmaker convert-webp <source>`](#convert-webp-source) | Convert images (PNG, JPG, BMP, TIFF, GIF) to WebP |
| [`kappmaker translate-screenshots [dir]`](#translate-screenshots-source-dir) | Translate screenshots to multiple locales (fal.ai) |
| [`kappmaker generate-screenshots`](#generate-screenshots) | Generate marketing screenshots with AI (OpenAI + fal.ai) |
| [`kappmaker generate-feature-image`](#generate-feature-image) | Generate a Google Play feature graphic (1024×500) with AI (OpenAI + fal.ai) |
| [`kappmaker generate-ios-icons`](#generate-ios-icons) | Generate all iOS `AppIcon.appiconset` PNG sizes + `Contents.json` from one logo (sharp, no AI) |
| [`kappmaker generate-android-icons`](#generate-android-icons) | Generate all Android `mipmap-*` launcher icons (5 densities × 3 files) + adaptive icon XML + `colors.xml` entry (sharp, no AI) |
| [ASO Keyword Research](#aso-keyword-research-skill-driven) | _(skill-driven, no binary)_ — Find high-value keywords with popularity + difficulty scores via Astro MCP, cluster by sub-niche, write `AiGuidelines/keywords.md` |
| [ASO Metadata Localization](#aso-metadata-localization-skill-driven) | _(skill-driven, no binary)_ — Write localized `name`/`subtitle`/`keywords`/`description` and `title`/`short/full_description` files for App Store + Google Play |
| [`kappmaker fastlane configure`](#fastlane-configure) | Set up Fastlane in the mobile app directory |
| [`kappmaker publish`](#publish) | Build and upload to Google Play and/or App Store via Fastlane |
| [`kappmaker generate-keystore`](#generate-keystore) | Generate an Android signing keystore for Play Store releases |
| [`kappmaker android-release-build`](#android-release-build) | Build a signed Android release AAB |
| [`kappmaker refactor`](#refactor) | Refactor package names, application ID, bundle ID, and app name |
| [`kappmaker update-version`](#update-version) | Bump Android and iOS version codes and version name |
| [`kappmaker config`](#config) | Manage CLI settings, API keys, and global defaults |

## Features

### Works with any project

These commands are standalone and don't depend on any specific boilerplate:

- **AI logo generation** — Generate logo variations with fal.ai, pick your favorite, auto-remove background
- **AI screenshot generation** — Generate marketing screenshots from a text description (8 style presets)
- **Screenshot translation** — Translate app screenshots to 48+ locales in parallel
- **ASO keyword research** — Skill-driven workflow that discovers high-value sub-niche keywords for a base topic via the [Astro MCP](https://tryastro.app/docs/mcp/) tools (real-time App Store popularity + difficulty scores from competitor analysis and AI suggestions), filters them by configurable thresholds, clusters them by sub-niche, and writes `AiGuidelines/keywords.md`. Falls back to a manual brainstorm when Astro MCP isn't connected. Output feeds directly into the metadata localization workflow below.
- **ASO metadata localization** — Skill-driven workflow that writes per-locale `name`/`subtitle`/`keywords`/`description` (iOS) and `title`/`short_description`/`full_description` (Android) text files with two strategies: US-indexed keyword expansion (English copy with different keywords per locale to multiply indexed surface) or native per-market localization. Char-limits, keyword-field rules, and no-duplicate-word-across-fields are enforced automatically.
- **App Store Connect setup** — Register bundle ID (with Sign in with Apple, In-App Purchases, and Push Notifications capabilities enabled automatically), create app, set metadata, categories, age rating, subscriptions, privacy, and review info — fully automated, no manual App Store Connect steps needed
- **Google Play Console setup** — Push store listings, subscriptions (new monetization API), one-time in-app products, and the data safety declaration via a built-in wrapper around the Play Publisher API — no external CLI, no extra dependencies
- **Adapty subscription setup** — Create products, paywalls, and placements for iOS and Android
- **Version bumping** — Increment Android and iOS version codes and names in one command
- **Image tools** — Split grids, remove backgrounds, enhance quality, convert to WebP

### KAppMaker boilerplate-specific

The `create` command runs the full end-to-end setup. Some steps assume the [KAppMaker](https://kappmaker.com) project structure and will be skipped with a warning if you use a custom template:

- **Package refactor** — Renames package name, app ID, and display name using the TypeScript refactor service (also available standalone via `kappmaker refactor`)
- **Firebase SDK config placement** — Downloads `google-services.json` and `GoogleService-Info.plist` to KAppMaker-specific paths (falls back to `Assets/` for custom templates)
- **Build environment** — Creates `local.properties`; iOS dependencies resolve via Swift Package Manager at build time (CocoaPods runs only if a custom template still has a `Podfile`)
- **Android release build** — Generates keystore and builds signed AAB (also available standalone via `kappmaker android-release-build`)
- **Git remotes** — Renames origin to upstream (designed for the "fork from template" workflow)
- **Screenshot translation default path** — Defaults to `MobileApp/distribution/ios/appstore_metadata/screenshots/en-US` (falls back to parent of source directory)

---

## Prerequisites

- **Node.js** >= 20
- **Git**
- **Firebase CLI** — `npm install -g firebase-tools`
- **Fastlane** — via Bundler in the template repo
- **Android SDK** — installed at `~/Library/Android/sdk` (configurable)
- **asc CLI** (optional, for App Store Connect) — `brew install asc` (requires **≥ 1.4.0** as of KAppMaker 1.7.0 for the bulk CSV subscription-pricing path)
- **Adapty CLI** (optional, for Adapty setup) — `npm install -g adapty`
- **No extra CLI for Google Play Console** — `kappmaker gpc` talks to the Play Publisher API directly via Node's built-in `fetch` and `crypto`; all it needs is the service-account JSON path set in `googleServiceAccountPath`

## External Services & API Keys

The CLI integrates with several external services for AI image generation, app store management, and subscription setup. All keys are stored locally at `~/.config/kappmaker/config.json`.

### fal.ai — AI Image Generation

**Used for:** Logo generation, background removal, image enhancement, screenshot translation, and screenshot generation.

**How to get your key:**
1. Sign up at [fal.ai](https://fal.ai)
2. Go to [Dashboard > Keys](https://fal.ai/dashboard/keys) and create an API key
3. `kappmaker config set falApiKey <your-key>` — or skip this and the CLI will prompt you the first time you run a command that needs it

### ImgBB — Image Hosting

**Used for:** Temporarily hosting reference images when generating or translating screenshots (fal.ai needs a public URL to process images).

**How to get your key:**
1. Sign up at [imgbb.com](https://imgbb.com)
2. Go to [api.imgbb.com](https://api.imgbb.com/) and get your free API key
3. `kappmaker config set imgbbApiKey <your-key>` — or prompted on first use

### OpenAI — Prompt Generation

**Used for:** Generating detailed screenshot specifications from a short app description (uses GPT-4.1). Only needed for the `generate-screenshots` command.

**How to get your key:**
1. Sign up at [platform.openai.com](https://platform.openai.com)
2. Go to [API Keys](https://platform.openai.com/api-keys) and create a new key
3. `kappmaker config set openaiApiKey <your-key>` — or prompted on first use

### App Store Connect CLI (asc) — iOS App Management & Publishing

**Used for:** Creating apps, setting metadata, categories, subscriptions, privacy declarations, and review info on App Store Connect (`create-appstore-app`). The same API key credentials are also used by `publish --platform ios` to build and upload IPAs via Fastlane.

**How to set up:**
1. Install: `brew install asc`
2. Generate an API key at [App Store Connect > Users and Access > Integrations > API](https://appstoreconnect.apple.com/access/integrations/api) (Admin role, download the `.p8` file immediately)
3. Configure:
   ```bash
   kappmaker config set ascKeyId <your-key-id>
   kappmaker config set ascIssuerId <your-issuer-id>
   kappmaker config set ascPrivateKeyPath /path/to/AuthKey.p8
   kappmaker config set appleId your@email.com
   ```
   Or run `kappmaker config appstore-defaults --init` for interactive setup.

> **Note:** `kappmaker publish --platform ios` uses `ascKeyId`, `ascIssuerId`, and `ascPrivateKeyPath` to automatically generate the Fastlane-format publisher JSON — no separate credentials needed.

### Adapty CLI — Subscription Management

**Used for:** Setting up in-app subscription products, paywalls, and placements across iOS and Android via Adapty's backend.

**How to set up:**
1. Install: `npm install -g adapty`
2. Log in: `adapty auth login` (opens browser for authentication)
3. Run: `kappmaker adapty setup`

### Firebase CLI — Backend Setup

**Used for:** Creating Firebase projects, registering Android/iOS apps, downloading SDK config files (`google-services.json`, `GoogleService-Info.plist`), and enabling anonymous authentication.

**How to set up:**
1. Install: `npm install -g firebase-tools`
2. The `create` command handles login and project creation interactively.

### Google Play Publisher — Android Store Uploads + Play Console Management

**Used for:**
- Building and uploading Android AABs to Google Play Store via `kappmaker publish --platform android` (Fastlane)
- Configuring store listings, subscriptions, in-app products, and the data safety declaration via `kappmaker gpc ...` (direct Publisher API call, no external CLI)

Both flows share the same service account JSON key — set it once, use it everywhere.

**How to set up:**

1. Go to [Google Cloud Console](https://console.cloud.google.com) and create a new project (or select existing)
2. Open **APIs & Services > Library**, search for **Google Play Android Developer API**, and enable it
3. Go to **IAM & Admin > Service Accounts**, create a new service account (skip role assignment)
4. Open the service account, go to **Keys**, click **Add key > Create new key > JSON**, and download it
5. Open [Google Play Console](https://play.google.com/console), go to **Settings > Users and permissions**
6. Click **Invite new user** with the service account email (`...@...iam.gserviceaccount.com`) and grant permissions for your app(s)
7. Save the JSON key file and configure:
   ```bash
   kappmaker config set googleServiceAccountPath /path/to/google-service-app-publisher.json
   ```

> **Note:** Google Play does not allow creating new apps via any public API — you must create the app manually once in [Play Console](https://play.google.com/console/u/0/developers) before `kappmaker gpc` can configure it.

### App Store Publisher — iOS Store Uploads

**Used for:** Building and uploading iOS IPAs to App Store Connect, managing App Store metadata and screenshots via `kappmaker publish --platform ios`.

The `publish` command reuses the same App Store Connect API key credentials used by `create-appstore-app` (`ascKeyId`, `ascIssuerId`, `ascPrivateKeyPath`) and automatically generates the Fastlane-format publisher JSON.

**How to set up** (if not already configured for `create-appstore-app`):

1. Open [App Store Connect > Users and Access > Integrations](https://appstoreconnect.apple.com/access/integrations/api)
2. Create an API key with **App Manager** access and download the `.p8` file
3. Note the **Key ID** and **Issuer ID**
4. Configure:
   ```bash
   kappmaker config set ascKeyId <your-key-id>
   kappmaker config set ascIssuerId <your-issuer-id>
   kappmaker config set ascPrivateKeyPath /path/to/AuthKey.p8
   ```

---

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

## `firebase`

Five standalone subcommands matching steps 2–6 of `create`. Run them individually for partial flows (e.g. set up Firebase for an existing project), or together to replicate what `create` does.

```bash
kappmaker firebase login
kappmaker firebase project --app-name MyApp                # derives project-id = myapp-app, display = MyApp
kappmaker firebase project --project-id myapp-prod --display-name MyApp  # explicit
kappmaker firebase apps --project myapp-app --app-name MyApp --package-name com.example.myapp
kappmaker firebase auth-anonymous --project myapp-app
kappmaker firebase configs --project myapp-app --app-name MyApp --package-name com.example.myapp
```

### `firebase login`

Runs `firebase login` (interactive). No args.

### `firebase project`

Creates the Firebase project. Idempotent — if the project already exists it skips creation. Returns success/failure to the orchestrator (controls whether `create` proceeds with steps 4–6).

| Flag | Description | Required |
|------|-------------|----------|
| `--project-id <id>` | Firebase project ID (e.g. `myapp-app`) | Yes, unless `--app-name` is set |
| `--display-name <name>` | Project display name | Defaults to `--project-id` or `--app-name` |
| `--app-name <name>` | PascalCase app name; derives `project-id = <lowercase>-app` and `display-name = <name>` | Yes, unless explicit IDs are passed |

### `firebase apps`

Creates an Android + iOS app under the project. Idempotent — reuses existing apps that match the display name `${appName} (Android App)` / `${appName} (iOS App)`.

| Flag | Description | Required |
|------|-------------|----------|
| `--project <id>` | Firebase project ID | Yes |
| `--app-name <name>` | PascalCase display name (used to label the apps) | Yes |
| `--package-name <pkg>` | Android `applicationId` and iOS bundle ID (e.g. `com.example.myapp`) | Yes |

### `firebase auth-anonymous`

Enables anonymous authentication via the Identity Toolkit Admin API. If Firebase Auth has never been initialized for the project, the command pauses and asks you to click "Get started" in the Firebase Console, then retries automatically.

| Flag | Description | Required |
|------|-------------|----------|
| `--project <id>` | Firebase project ID | Yes |

### `firebase configs`

Downloads `google-services.json` and `GoogleService-Info.plist` for the Android + iOS apps and writes them to the right place. Apps are looked up via `--app-name` (display name match) unless you pass `--android-app-id` / `--ios-app-id` directly.

**Output auto-detection** (when `--android-output` / `--ios-output` aren't given): probes `MobileApp/androidApp/google-services.json`, then `MobileApp/composeApp/google-services.json`, then falls back to `Assets/google-services.json`. Same for iOS — `MobileApp/iosApp/iosApp/GoogleService-Info.plist` if it exists, otherwise `Assets/GoogleService-Info.plist`.

When `--package-name` is provided, the downloaded `google-services.json` is verified against the expected package name and patched in-place if it doesn't match (handles cases where the Firebase app was registered with an older `bundleIdPrefix`).

| Flag | Description | Required |
|------|-------------|----------|
| `--project <id>` | Firebase project ID | Yes |
| `--app-name <name>` | PascalCase display name (used to find the apps if app IDs aren't given) | Yes |
| `--package-name <pkg>` | Verify and fix the Android `google-services.json` package name | No |
| `--android-app-id <id>` | Skip lookup and use this Firebase App ID directly | No |
| `--ios-app-id <id>` | Skip lookup and use this Firebase App ID directly | No |
| `--android-output <path>` | Output path for `google-services.json` | Auto-detect |
| `--ios-output <path>` | Output path for `GoogleService-Info.plist` | Auto-detect |

---

## `create-logo`

Generates an app logo using fal.ai's nano-banana-2 model.

```bash
kappmaker create-logo
kappmaker create-logo --prompt "A minimalist fitness tracker for runners"
kappmaker create-logo --output ./custom/path/logo.png
```

**Flow:**
1. Reads app idea from `--prompt` (or prompts interactively if omitted)
2. Generates a 4x4 grid of 16 logo variations (2K, 1:1)
3. Opens grid in Preview.app for review
4. Pick a logo (1-16) or R to regenerate — optional: `5 --zoom 1.1 --gap 3`
5. Extracts chosen logo at 512x512

**Output:** `Assets/app_logo.png` + `Assets/logo_variations.png`

Requires a fal.ai API key (prompted on first use if not set, or set manually: `kappmaker config set falApiKey <your-key>`)

| Flag | Description | Default |
|------|-------------|---------|
| `--prompt <text>` | App idea / concept (skips the interactive prompt) | — |
| `--output <path>` | Custom output path | `Assets/app_logo.png` |

---

## `generate-image`

Generic AI image generator — a thin wrapper around fal.ai's `nano-banana-2` (text-to-image) and `nano-banana-2/edit` (with reference images). Use this any time you need a one-off image without the logo-grid selection flow.

```bash
kappmaker generate-image --prompt "A minimalist mountain landscape at sunset"
kappmaker generate-image --prompt "Hero banner for a meditation app" --aspect-ratio 16:9 --resolution 4K
kappmaker generate-image --prompt "Product render" --num-images 4 --output Assets/hero
kappmaker generate-image --prompt "Put this logo on a black t-shirt" --reference Assets/app_logo.png
kappmaker generate-image --prompt "Blend these into a single composition" --reference Assets/moodboard
kappmaker generate-image --prompt "Match this product shot" --reference https://example.com/ref.jpg
```

**Reference images (edit mode):** Passing `--reference` switches the endpoint from `nano-banana-2` (text-to-image) to `nano-banana-2/edit` (reference-guided). Each entry can be a **file path**, a **directory** (all png/jpg/jpeg/webp inside are picked up, sorted, non-recursive), or an **HTTP(S) URL**. Max 10 references total. If `imgbbApiKey` is configured, local files are uploaded to imgbb for reliable URLs; otherwise they are sent inline as data URIs (fine for small images, can fail on very large ones).

**Output path behavior:**
- No `--output` → `Assets/generated.png` (single) or `Assets/generated_1.png`, `_2.png`… (multi)
- `--output <dir>` (no extension) → saves into that directory
- `--output <file.png>` → single image uses path verbatim; multi-image appends `_1`, `_2` before extension

Requires a fal.ai API key (prompted on first use if not set).

| Flag | Description | Default |
|------|-------------|---------|
| `--prompt <text>` | Text description of the image (required) | — |
| `--output <path>` | Output file or directory | `Assets/generated.png` |
| `--num-images <n>` | Number of images to generate (1–8) | `1` |
| `--aspect-ratio <ratio>` | `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, `21:9`, `9:21`, `auto` | `1:1` |
| `--resolution <res>` | `1K`, `2K`, `4K` | `2K` |
| `--output-format <fmt>` | `png`, `jpg`, `webp` | `png` |
| `--reference <paths...>` | Reference images — file paths, directories, or HTTP URLs (edit mode, max 10) | — |

---

## `create-appstore-app`

Creates and fully configures an app on App Store Connect using the [asc CLI](https://github.com/rorkai/App-Store-Connect-CLI). Requires asc ≥ 1.4.0.

```bash
kappmaker create-appstore-app
kappmaker create-appstore-app --config ./my-config.json
```

### First-time setup

1. **Generate an API key** at [App Store Connect > Users and Access > Integrations > API](https://appstoreconnect.apple.com/access/integrations/api) — Admin access, download the `.p8` file immediately
2. **Run one-time setup:**
   ```bash
   kappmaker config appstore-defaults --init
   ```

### What it does (13 steps)

1. Validate asc CLI and authentication
2. Load config (from file or interactive prompts)
3. Register Bundle ID + enable capabilities (Sign in with Apple, In-App Purchases, Push Notifications). Name follows Apple convention: `XC com measify myapp` for `com.measify.myapp`
4. Find or create app (fully automated via `asc web apps create` — no manual App Store Connect step needed)
5. Set content rights
6. Create app version (1.0.0)
7. Set categories
8. Set age rating
9. Update localizations
10. Set pricing, availability, and subscriptions
11. Set privacy data usages
12. Set encryption declarations
13. Set review contact details

### Config resolution

Layers are deep-merged (later overrides earlier):

1. **Built-in template** — age rating, privacy, encryption, subscriptions
2. **Global defaults** (`~/.config/kappmaker/appstore-defaults.json`) — review contact, copyright
3. **Local config** (`./Assets/appstore-config.json` or `--config`)
4. **Interactive prompts** — only for fields still empty

### Default subscriptions

| Subscription | Period | Price | Product ID |
|-------------|--------|-------|------------|
| Weekly Premium | `ONE_WEEK` | $6.99 | `{appname}.premium.weekly.v1.699.v1` |
| Yearly Premium | `ONE_YEAR` | $29.99 | `{appname}.premium.yearly.v1.2999.v1` |

Auto-generated naming: group `{appname}.premium.v1`, ref name `{AppName} Premium Weekly v1 (6.99)`.

### Per-territory PPP pricing (1.7.0+ — bulk CSV import)

Subscriptions and IAPs are fanned out to **every ASC territory (~175)** with purchasing-power-parity-adjusted prices in a **single API call per product**. Requires asc CLI **≥ 1.4.0** (`brew upgrade asc`).

- **Subscriptions** (1.7.0+): `asc subscriptions pricing prices import --input <csv>`. KAppMaker writes a temp CSV with `territory,price,price_point_id` rows for all ~175 territories and pipes it in. Replaces the 155-call loop from 1.6.x which hit Apple's rate limits.
- **IAPs**: a single `asc iap pricing schedules create --prices "PP_ID:DATE,…"` call covers all territories (unchanged).

Set `"ppp_enabled": false` on any subscription or IAP to opt out and keep only your explicitly-listed `prices`. User-listed territory prices are always preserved (they win the merge).

**Tier resolution**: Apple's price-point catalog uses globally-stable tier numbers (1..800 — tier N = the same USD-equivalent across every territory). KAppMaker resolves each unique PPP USD target → tier ONCE via USA's catalog (where customerPrice is in USD), then synthesises per-territory price-point IDs locally using Apple's base64 `{s, t, p}` format. Critical fix vs 1.6.x: the old code compared a USD target against local-currency price-points (e.g. ¥, ₩, ₹) and ended up picking the FREE tier — products silently landed at $0 in JPN/IDR/INR/KRW/etc. The new tier-based resolution avoids that entirely.

**Distinct catalogs**: subscriptions use `subscriptionPricePoints` (CLI: `asc subscriptions pricing price-points list`) while IAPs use `appPricePoints` (CLI: `asc pricing price-points`). Their `s` (catalog identifier) fields differ — mixing IDs across catalogs returns `400 The provided entity is invalid`.

**Idempotent re-runs**: when `setup` reports "already been used", KAppMaker now logs `existing — refreshing pricing` and continues into the PPP fan-out so re-runs actually update territory pricing (1.6.x silently skipped).

### App Review screenshots (1.7.1+)

Apple requires a review screenshot on every subscription and IAP — without one, products remain in `MISSING_METADATA` state and per-territory pricing won't "resolve". KAppMaker uploads it automatically when you set `review_screenshot` in the config:

```json
{
  "review_screenshot": "Assets/appstore/review-screenshot.png",
  "subscriptions": {
    "groups": [{
      "subscriptions": [{
        "ref_name": "Premium Weekly",
        "review_screenshot": "Assets/appstore/weekly-review.png"
      }]
    }]
  },
  "in_app_purchases": [{
    "product_id": "credit_pack_10_499_myapp",
    "review_screenshot": "Assets/appstore/iap-review.png"
  }]
}
```

- **Global default**: `review_screenshot` at the top level applies to every sub + IAP.
- **Per-product override**: each subscription / IAP can specify its own path.
- **Idempotent**: re-runs check `view` / `images list` first and skip if a screenshot is already attached. Delete via Apple's UI to force a re-upload.
- **Silent skip on missing file**: if the path doesn't resolve to an existing file, KAppMaker logs and moves on — no error.

Under the hood: `asc subscriptions review screenshots create --file <path>` for subs and `asc iap images create --file <path>` for IAPs.

#### Required size + auto-resize prompt

Apple's recommended size for App Review screenshots is **1290 × 2796 px** (iPhone 6.7" Display, portrait — matches App Store listing screenshot dimensions). Minimum: 640 × 920 px. Format: PNG or JPG.

If the file's dimensions don't match 1290 × 2796, KAppMaker prompts:

```
WARN Review screenshot wrong-size.png is 1920×1080.
-- Apple's App Store recommended size for review screenshots: 1290×2796 (iPhone 6.7" Display, portrait).
  Resize to 1290×2796 keeping aspect ratio? (Y/n)
```

- **Y (default)** — sharp resizes the file with `fit: 'inside'` (preserves aspect ratio, may end up smaller than the target on the constraining dimension; e.g. a 1920 × 1080 input becomes 1290 × 726). Writes to a temp file. Uploads the resized copy.
- **N** — uploads the file as-is. Apple may still accept it (the rule is just `min 640 × 920`) but the aspect ratio won't match typical iPhone screenshots.

Files that are already 1290 × 2796 skip the prompt entirely.

#### Standalone replace commands

Two top-level `appstore-` prefixed commands replace existing screenshots without running the full `create-appstore-app` flow:

```bash
# Replace the review screenshot on EVERY subscription in the config
kappmaker appstore-update-subscription-review-screenshot --file ./Assets/appstore/new-review.png

# Replace the review image on EVERY IAP
kappmaker appstore-update-iap-review-screenshot --file ./Assets/appstore/iap-review.png

# Without --file, the commands use the per-product `review_screenshot` from the config
kappmaker appstore-update-subscription-review-screenshot
kappmaker appstore-update-iap-review-screenshot

# Target a single product
kappmaker appstore-update-iap-review-screenshot \
    --file ./Assets/appstore/credit-pack-30.png \
    --product-id credit_pack_30_999_myapp
```

| Flag | Description |
|---|---|
| `--file <path>` | Single screenshot applied to all matched products. Overrides per-product `review_screenshot` from the config. |
| `--config <path>` | Override default `./Assets/appstore-config.json`. |
| `--product-id <id>` | Target ONE product (matches by `product_id` or `ref_name`). |

These commands **force-replace** existing screenshots (delete + create under the hood — empirically `asc … update` doesn't actually swap the binary). The setup-flow upload in `create-appstore-app` remains idempotent (skips when one is already attached).

### Default in-app purchases (credit packs)

The template also ships three CONSUMABLE in-app purchases shaped as credit packs. Auto-fill triggers on any `in_app_purchases[]` entry with a `credits` numeric field.

| Pack | Credits | Price | Product ID |
|------|---------|-------|------------|
| Basic Credit Pack | 10 | $4.99 | `credit_pack_10_499_{appname}` |
| Pro Credit Pack | 30 | $9.99 | `credit_pack_30_999_{appname}` |
| Ultimate Credit Pack | 80 | $19.99 | `credit_pack_80_1999_{appname}` |

Format: `credit_pack_{credits}_{priceDigits}_{appname}`. The same ID is used on Google Play and Adapty so app code can reference one constant per platform pair.

Created via the same one-shot `asc iap setup` workflow that drives subscription setup. Reruns are idempotent — already-existing product IDs are skipped with an info log.

### Default privacy

| Data Category | Purpose | Protection |
|--------------|---------|------------|
| User ID | App Functionality | Linked to You |
| Device ID | App Functionality | Linked to You |
| Crash Data | Analytics | Not Linked to You |
| Performance Data | Analytics | Not Linked to You |
| Other Diagnostic Data | Analytics | Not Linked to You |
| Other Usage Data | Analytics | Not Linked to You |
| Product Interaction | Analytics | Not Linked to You |

During interactive setup, the CLI asks if the app accesses user content (AI image/video wrapper). If yes, adds Photos or Videos + Other User Content (both App Functionality / Not Linked to You).

| Flag | Description | Default |
|------|-------------|---------|
| `--config <path>` | Path to JSON config file | `./Assets/appstore-config.json` |

---

## `appstore-monetization-push`

Standalone command that re-runs only the subscription + IAP push step from `create-appstore-app`. Useful when you want to sync pricing (including PPP fan-out) without repeating the full 13-step setup — e.g. after adding a new subscription period, adjusting prices, or upgrading to a newer KAppMaker version with PPP fixes.

```bash
# Push everything (subscriptions + IAPs)
kappmaker appstore-monetization-push

# Subscriptions only
kappmaker appstore-monetization-push --subscriptions-only

# IAPs only
kappmaker appstore-monetization-push --iap-only

# Custom config path
kappmaker appstore-monetization-push --config ./path/to/appstore-config.json
```

Reads `Assets/appstore-config.json` (or `--config <path>`). Resolves the ASC app ID from `app.id` or by looking up `app.bundle_id` via `asc`. Calls the same `setupSubscriptions` / `setupInAppPurchases` functions as `create-appstore-app` — fully idempotent: existing products get pricing refreshed with the full PPP regional fan-out.

| Flag | Description | Default |
|------|-------------|---------|
| `--config <path>` | Path to JSON config file | `./Assets/appstore-config.json` |
| `--subscriptions-only` | Push subscription groups only, skip IAPs | — |
| `--iap-only` | Push IAPs only, skip subscription groups | — |

---

## `gpc`

Google Play Console management — a tight wrapper around the official Google Play Android Publisher API. All subcommands authenticate via the service account JSON at `googleServiceAccountPath` (same one used by `publish --platform android`). **No external CLI and no extra npm dependencies** — the JWT flow and HTTPS calls are implemented with Node's built-in `crypto` and `fetch`.

> **Note:** Google Play does not allow creating new apps via any public API. Create the app manually once in [Play Console](https://play.google.com/console/u/0/developers), then use these commands to configure it.

### `gpc setup`

Full end-to-end configuration (11 steps) — the Google Play parallel to `create-appstore-app`.

```bash
kappmaker gpc setup
kappmaker gpc setup --config ./my-config.json
```

**What it does:**

1. Validate service account + obtain access token
2. Load config (`./Assets/googleplay-config.json` or interactive prompts). **Auto-detects Play's actual default language** via a throwaway edit probe and rewrites `config.app.default_language` + the matching listing locale if your config drifted from reality. Also migrates legacy product IDs and legacy data-safety placeholders. Also reads tracks state to verify an APK/AAB is uploaded.
3. Review summary and confirm
4. Verify app exists on Play Console (fails fast with a deep link if not — Google does not allow app creation via the public API)
5. Start a Play Console edit (only if the default-language listing has a title — otherwise steps 5-7 are skipped cleanly)
6. Update app details (default language + contact website/email/phone)
7. Update store listings per locale (title, short/full description, video); commits the edit. Empty listing titles are auto-filled from the app name
8. **Pre-flight build check**, then create subscriptions via the new monetization API (`POST /subscriptions` with `productId` + `regionsVersion.version` as query params, base plans in body in DRAFT state, then `basePlans:activate` each one). **Base plans are available to all ~175 Play regions** — regions without explicit prices get auto-converted pricing from Google. Idempotent — existing product IDs are skipped. **Subscription listings are auto-cloned into Play's default language if missing.** Skipped with a clear message if no build is uploaded to any track (Google rejects monetization writes in that case).
9. Create one-time in-app products via the **new** monetization API (`PATCH /onetimeproducts/{id}?allowMissing=true` + `purchaseOptions:batchUpdateStates` to activate). Idempotent via `GET /oneTimeProducts`. Replaces the legacy `/inappproducts` endpoint that returns 403 on migrated apps.
10. Update the data safety declaration: converts `data_safety` JSON → Google's CSV format using a bundled canonical template + KAppMaker defaults (USER_ID for app functionality + account management; DEVICE_ID for app functionality + advertising + account management; crash/performance/diagnostics/interactions for analytics), then posts it via `POST /dataSafety` with `{ safetyLabels: "<csv>" }`. Respects `data_safety_csv_path` as an escape hatch for pre-exported CSVs.
11. Print a checklist of policy declarations that the Publisher API does NOT expose (content rating / IARC, target audience, ads, health apps, financial features, government apps, news apps, gambling, COVID-19 tracing, app access, advertising ID, families compliance, app pricing tier) with a deep link to Play Console's App content page. All verified against Google's v3 discovery document — none have REST endpoints.

### `gpc listings push`

Push just the store listings section from the config file (useful after editing copy).

```bash
kappmaker gpc listings push
kappmaker gpc listings push --config ./my-config.json
```

Runs a single edit transaction: updates app details → updates every listing locale → commits.

### `gpc subscriptions list`

Read-only — lists existing subscription product IDs on Play Console.

```bash
kappmaker gpc subscriptions list --package com.example.myapp
kappmaker gpc subscriptions list   # uses app.package_name from the config file
```

### `gpc subscriptions push`

Create or reuse subscriptions from the config file. Idempotent — already-existing product IDs are skipped, and base plans are activated even for reused subscriptions.

```bash
kappmaker gpc subscriptions push
```

Uses the **new** monetization API (`applications/{pkg}/subscriptions` + `basePlans:activate`). Auto-generated IDs:

| Field | Format | Example ($6.99 weekly) |
|---|---|---|
| `productId` (subscription) | `{appname}.premium.{period}.v1` | `myapp.premium.weekly.v1` |
| `basePlanId` | `autorenew-{period}-{priceDigits}-v1` | `autorenew-weekly-699-v1` |
| Subscription title | `{AppName} Premium {PeriodLabel}` | `MyApp Premium Weekly` |

These align 1-to-1 with what `adapty setup` writes to `android_product_id` and `android_base_plan_id`, so Adapty links the products automatically without any extra configuration.

### `gpc iap list`

Read-only — lists existing one-time in-app product SKUs on Play Console.

```bash
kappmaker gpc iap list --package com.example.myapp
kappmaker gpc iap list
```

### `gpc iap push`

Create or reuse one-time in-app products from the config file. Idempotent — existing products are PATCHed with fresh PPP regional pricing.

```bash
kappmaker gpc iap push
kappmaker gpc iap push --recreate-stuck   # DELETE + recreate products stuck at regionsVersion 2022/02
```

| Flag | Description |
|---|---|
| `--config <path>` | Override the default config path (`./Assets/googleplay-config.json`) |
| `--recreate-stuck` | DELETE products whose stored regions can't coexist with `regionsVersion=2022/02` (e.g. legacy products with MN) so they recreate fresh. WARNING: Google holds the productId in a soft-delete reservation window for a few minutes to a few hours after deletion — CREATE during that window fails with "Product ID already in use". Use only when you can tolerate downtime, or prefer bumping the product_id in config (e.g. `v1` → `v2`) for zero downtime. |

Uses the **new** monetization API: `PATCH /applications/{pkg}/onetimeproducts/{id}?allowMissing=true` to create/update the product, then `purchaseOptions:batchUpdateStates` with an `activatePurchaseOptionRequest` to activate the default purchase option so it's available to buyers. Replaces the legacy `/inappproducts` endpoint, which Google now rejects with "Please migrate to the new publishing API" on migrated apps.

**Default credit packs** ship in `Assets/googleplay-config.json`. Auto-fill triggers on any `in_app_products[]` entry with a `credits` numeric field — SKU is set to `credit_pack_{credits}_{priceDigits}_{appname}` (matches the ASC and Adapty IDs):

| Pack | Credits | Price | SKU |
|------|---------|-------|-----|
| Basic Credit Pack | 10 | $4.99 | `credit_pack_10_499_{appname}` |
| Pro Credit Pack | 30 | $9.99 | `credit_pack_30_999_{appname}` |
| Ultimate Credit Pack | 80 | $19.99 | `credit_pack_80_1999_{appname}` |

**Global region availability with PPP pricing (1.6.0+):** subscriptions and one-time products are both created with **explicit per-region prices** in every Play-supported region (~175), with purchasing-power-parity multipliers applied — IN gets ~0.35×, AR/PK/EG get 0.30×, US/CA/EU base at 1.00×, CH/NO at 1.10×. The multipliers come from a Steam/Spotify-inspired tier table ([iosdevmax/ppp-pricing](https://github.com/iosdevmax/ppp-pricing), MIT). Prices round to .99 endings.

| Override | Result |
|---|---|
| You list `{ region_code: "DE", price: "5.99", currency_code: "EUR" }` | Used as-is for DE; PPP fills the rest |
| You list only US/USD | PPP fans out from your USD anchor to ~175 regions |
| Set `"ppp_enabled": false` on a base plan or IAP | That entry stays restricted to your listed regions |

**Each region's price is in its native currency** (AE → AED, JP → JPY, IN → INR, etc.) — Google Play rejects mismatched currencies. The CLI calls Google's `convertRegionPrices` endpoint with your USD base price to get fair FX-converted native prices for every billable region, then multiplies by the region's PPP multiplier and charm-rounds (.99 for decimal currencies, X99 / X9 for zero-decimal currencies like JPY / KRW). Sanctioned countries (AF, IR, KP, SY, etc.) are auto-excluded — they don't appear in `convertRegionPrices` output.

**`regionsVersion=2022/02` drift override (1.6.11+):** Google's monetization API requires `regionsVersion.version` and `"2022/02"` is the only documented value. Several regions have drifted since that snapshot was taken — Google's live API returns one currency but `2022/02` expects another. The CLI handles this with an explicit override table:

| Region | Live API | 2022/02 expects | What CLI does |
|---|---|---|---|
| BG | EUR | BGN | Converts EUR → BGN via the 1 EUR = 1.95583 BGN peg |
| HR | EUR | EUR ✓ | No override (Google updated 2022/02 retroactively) |
| CI / CM / SN | XOF / XAF | USD | Uses the USD anchor (PPP multiplier still applied) |
| MN | billable | NOT BILLABLE | Skipped entirely (no currency works) |

Net effect: typical products land with all ~173 billable regions AVAILABLE (only MN drops out). Google's storage layer auto-converts each region's submitted currency to the user-facing display currency (we send BG/BGN → end users see EUR; we send CI/USD → end users see XOF).

**Existing products with regions stuck at `2022/02`:** if Google's old catalog has stored MN (or another `NEVER_BILLABLE` region) on an existing product, that PATCH cannot be completed — Google won't accept MN's currency but also refuses to remove the region. The CLI surfaces these "stuck" products at the end of the run and offers three fix paths:

1. **Recommended** — bump the `product_id` in your config (e.g. `credit_pack_10_499_myapp` → `credit_pack_10_499_myapp_v2`). Fresh product, no legacy baggage, no waiting period.
2. `--recreate-stuck` flag — DELETEs the stuck product(s) and recreates them fresh. WARNING: Google soft-deletes for a few minutes to a few hours; CREATE during that window returns "Product ID already in use". Plan downtime.
3. Manually delete on Play Console UI, wait for the reservation window to clear, then re-run.

**"New countries and regions" set to AVAILABLE (1.6.11+):** both subscriptions (`otherRegionsConfig`) and one-time products (`newRegionsConfig`) are now always set to `availability: AVAILABLE` with USD + EUR anchors when a USD anchor is present. Means any region Google adds to its billable catalog in the future is auto-priced from those anchors — no future-proofing maintenance needed.

**Want simpler pricing without PPP?** Set `"ppp_enabled": false` on a base plan or one-time product to skip the PPP fan-out. The CLI then submits only your user-listed regions in `regional_configs` (typically just US) plus `otherRegionsConfig` (subscriptions) / `newRegionsConfig` (one-time products) with USD + EUR anchors. Google handles the fan-out via its own pricing-template FX algorithm — every billable region gets a price, but without PPP discounting in lower-income markets. Trade-off: smaller payload, less control.

### `gpc data-safety push`

Push only the data safety declaration. Faster than running the full `setup` when you're iterating on the privacy answers.

```bash
kappmaker gpc data-safety push
```

**How it works under the hood:** Google's `POST /applications/{pkg}/dataSafety` does not take structured JSON — it takes a CSV file (the same one Play Console exports from Policy → App content → Data safety → Export to CSV), wrapped in `{ safetyLabels: "<csv>" }`. KAppMaker lets you stay in JSON and converts internally.

**Two ways to configure it in `Assets/googleplay-config.json`:**

1. **Structured JSON (recommended)** — `data_safety.answers` overlay on top of KAppMaker defaults:

   **Account creation:** "My app does not allow users to create an account" (`PSL_ACM_NONE`).

   **Data deletion:** skipped entirely (the question is optional).

   **Data types collected:**

   | Data type | Play Question / Response |
   |---|---|
   | User IDs | `PSL_DATA_TYPES_PERSONAL/PSL_USER_ACCOUNT` |
   | Device ID | `PSL_DATA_TYPES_IDENTIFIERS/PSL_DEVICE_ID` |
   | Crash logs | `PSL_DATA_TYPES_APP_PERFORMANCE/PSL_CRASH_LOGS` |
   | Diagnostics | `PSL_DATA_TYPES_APP_PERFORMANCE/PSL_PERFORMANCE_DIAGNOSTICS` |
   | Other performance | `PSL_DATA_TYPES_APP_PERFORMANCE/PSL_OTHER_PERFORMANCE` |
   | App interactions | `PSL_DATA_TYPES_APP_ACTIVITY/PSL_USER_INTERACTION` |

   **Data handling (same for ALL data types above):**
   - Collected only, **not shared** with third parties
   - **Processed ephemerally** (YES)
   - **Collection is required** — users can't turn it off
   - Purposes: Analytics (+ App functionality for Device ID)

   **Security:** encrypted in transit = YES.

   Example config (just use the default — override if you need to add data types or change handling):
   ```json
   "data_safety": {
     "apply_defaults": true,
     "answers": {}
   }
   ```

   To override a specific answer, add keys to `answers`. Keys are either `QuestionID` (for single-answer rows) or `QuestionID/ResponseID` (for multi-choice rows). Values are `true` / `false` / URL string / `null`:
   ```json
   "data_safety": {
     "apply_defaults": true,
     "answers": {
       "PSL_DATA_TYPES_PERSONAL/PSL_USER_ACCOUNT": true,
       "PSL_DATA_TYPES_LOCATION/PSL_APPROX_LOCATION": true
     }
   }
   ```

   Internally, KAppMaker loads a canonical 783-row template (extracted from the well-maintained [fastlane-plugin-google_data_safety](https://github.com/owenbean400/fastlane-plugin-google_data_safety)), applies defaults + your overrides, emits a filled CSV, and uploads it via `POST /dataSafety`.

2. **Escape hatch: CSV file** — if you already exported a real CSV from Play Console and filled it in:
   ```json
   "data_safety_csv_path": "Assets/data-safety.csv"
   ```
   When this field is set and the file exists, it takes priority over the JSON block and is uploaded verbatim.

**Important:** Review the summary Play Console shows after the push before publishing. Google's conditional question logic may reject some answers — paste the error and I'll adjust the defaults.

### `gpc app-check`

Quick read-only probe to verify that an app exists on Play Console. Useful for CI scripts and before running destructive operations.

```bash
kappmaker gpc app-check --package com.example.myapp
```

Exits 0 if found, 2 if missing (prints the Play Console deep link).

### Config

All `gpc` subcommands except `app-check` load `./Assets/googleplay-config.json` by default. The first run of `kappmaker gpc setup` creates it interactively.

| Flag | Description | Default |
|------|-------------|---------|
| `--config <path>` | Path to JSON config file | `./Assets/googleplay-config.json` |
| `--package <name>` | (list commands) Override the package name from config | — |

**Alias:** `kappmaker create-play-app` is kept as a shortcut for `kappmaker gpc setup` (the entire 11-step flow is also what the top-level `kappmaker create` calls under step 8 when you answer yes to the Google Play Console prompt).

---

## `gpc monetization push`

Standalone command that re-runs only the subscription + IAP push steps from `gpc setup`. Useful when you want to sync pricing (including full PPP fan-out across ~175 regions) without repeating listings, data safety, or the manual-checklist prompt.

```bash
# Push everything (subscriptions + IAPs)
kappmaker gpc monetization push

# Subscriptions only
kappmaker gpc monetization push --subscriptions-only

# IAPs only
kappmaker gpc monetization push --iap-only

# Custom config path
kappmaker gpc monetization push --config ./path/to/googleplay-config.json

# Re-create products stuck due to regionsVersion 2022/02 drift
kappmaker gpc monetization push --recreate-stuck
```

Reads `Assets/googleplay-config.json` (or `--config <path>`). Validates the service account and probes the app state (requires at least one uploaded build — internal testing track is enough). Calls the same `setupSubscriptions` / `setupInAppProducts` functions as `gpc setup` — fully idempotent: existing products are PATCHed with refreshed PPP regional fan-out.

| Flag | Description | Default |
|------|-------------|---------|
| `--config <path>` | Path to JSON config file | `./Assets/googleplay-config.json` |
| `--subscriptions-only` | Push subscriptions only, skip IAPs | — |
| `--iap-only` | Push IAPs only, skip subscriptions | — |
| `--recreate-stuck` | Delete + recreate products stuck due to regionsVersion 2022/02 incompatibility | — |

---

## `subscription add`

Quick-add a single new subscription to Google Play and App Store Connect without editing config files. Auto-generates aligned product IDs across both stores, fans out PPP pricing across ~175 Play regions and ~155 ASC territories, and auto-creates the App Store Connect subscription group if it doesn't exist yet.

```bash
# Minimum invocation — defaults to --platform all (Play + ASC)
kappmaker subscription add --period weekly --price 9.99

# v2 product line alongside an existing v1
kappmaker subscription add --period weekly --price 9.99 --product-version 2

# Single store
kappmaker subscription add --period monthly --price 19.99 --platform android
kappmaker subscription add --period yearly --price 29.99 --platform ios

# Full control — fully spelled out
kappmaker subscription add \
  --period weekly --price 6.99 --product-version 2 \
  --name "Weekly Premium" \
  --description "Full access for one week." \
  --review-screenshot "Assets/appstore/review-screenshot_subscription.jpg" \
  --group "myapp.premium.v2" --group-name "Premium Access" \
  --app-name "MyApp"
```

**What it creates** (for `--period weekly --price 9.99 --product-version 1`):

| Where | Field | Value |
|---|---|---|
| ASC | `product_id` | `myapp.premium.weekly.v1.999.v1` |
| ASC | `ref_name` | `MyApp Premium Weekly v1 (9.99)` |
| ASC | subscription period | `ONE_WEEK` |
| ASC | localization (en-US) | name = `MyApp Premium Weekly`, description = `Full access for one week.` |
| ASC | pricing | $9.99 USD anchor → PPP fan-out across ~155 territories in one `prices import` CSV call |
| ASC | review screenshot | top-level `config.review_screenshot` (or `--review-screenshot`) |
| ASC | subscription group | first group in config, OR `--group <ref>` (auto-created with en-US name if new) |
| Play | `product_id` | `myapp.premium.weekly.v1` |
| Play | base plan | `autorenew-weekly-999-v1`, period `P1W` |
| Play | listing (en-US) | title = `MyApp Premium Weekly`, description = `Full access for one week.` |
| Play | pricing | $9.99 USD anchor → PPP fan-out across ~173 billable regions via `convertRegionPrices` |

**Flags:**

| Flag | Required | Default |
|---|---|---|
| `--period <slug>` | yes | — — one of `weekly` / `monthly` / `twomonths` / `quarterly` / `semiannual` / `yearly` |
| `--price <number>` | yes | — — USD anchor; PPP fans the rest |
| `--platform <target>` | no | `all` (= Play + ASC) — `ios` = ASC only, `android` = Play only |
| `--product-version <n>` | no | `1` — bumps every `v` marker, e.g. `--product-version 2` → `myapp.premium.weekly.v2.999.v2` + `myapp.premium.weekly.v2` + `autorenew-weekly-999-v2` |
| `--name <text>` | no | `"<AppName> Premium <Period>"` — localized display name |
| `--description <text>` | no | period-derived sentence: weekly → `"Full access for one week."`, monthly → `"Full access for one month."`, etc. |
| `--review-screenshot <path>` | no | top-level `config.review_screenshot` from `Assets/appstore-config.json` |
| `--group <ref>` | no | first group in `Assets/appstore-config.json` — if the ref doesn't exist on ASC yet, it's auto-created |
| `--group-name <text>` | no | inherits from matching config group's `localizations[0].name`, else `"Premium Access"` — used when auto-creating a new group |
| `--app-name <name>` | no | read from existing configs |
| `--bundle-id <id>` | no | iOS bundle ID override (e.g. `com.example.myapp`) — use when `Assets/appstore-config.json` doesn't exist yet |
| `--package-name <pkg>` | no | Android package name override — use when `Assets/googleplay-config.json` doesn't exist yet |

**Idempotency:** safe to re-run. Existing products are PATCHed with refreshed PPP regional fan-out (same code path as `gpc subscriptions push` and `create-appstore-app`). Existing ASC subscriptions log `"already exists — refreshing pricing"` and continue.

**Adapty is intentionally NOT included** — Adapty pulls live store prices at runtime via its store integrations, so creating an extra Adapty product entry adds noise without unlocking anything the SDK can't already fetch. Adapty product entries remain managed via `kappmaker adapty setup` for the canonical product set. (For credit packs `iap add` DOES include Adapty, see below.)

**Notes:**
- No `--free-trial` flag yet. For intro offers, edit `Assets/{googleplay,appstore}-config.json` and run `gpc subscriptions push` / `create-appstore-app`.
- Only en-US localization is created. For multi-locale, edit the config files.
- Only first regional price (`US/USD`) is set explicitly. Other regions come from PPP fan-out.

---

## `iap add`

Quick-add a single credit-pack consumable IAP to Google Play, App Store Connect, AND Adapty (Adapty is included here because credit packs use the `credit_pack_access` access level to gate consumable entitlements that have no store-side equivalent). Auto-generates aligned product IDs across all three.

```bash
# Minimum invocation
kappmaker iap add --credits 50 --price 14.99

# v2 product line (appends "_v2" suffix to the ID)
kappmaker iap add --credits 50 --price 14.99 --product-version 2

# Single store
kappmaker iap add --credits 100 --price 24.99 --platform ios

# Full control
kappmaker iap add \
  --credits 10 --price 4.99 --product-version 2 \
  --name "Basic Credit Pack" \
  --description "10 credits to use in the app." \
  --review-screenshot "Assets/appstore/review-screenshot_credits.jpg"
```

**What it creates** (for `--credits 10 --price 4.99 --product-version 1 --name "Basic Credit Pack"`):

| Where | Field | Value |
|---|---|---|
| ASC | `product_id` | `credit_pack_10_499_myapp` (v2+ appends `_v2`) |
| ASC | `type` | `CONSUMABLE` |
| ASC | `ref_name` | `MyApp Basic Credit Pack v1 (4.99)` |
| ASC | localization (en-US) | name = `Basic Credit Pack`, description = `10 credits to use in the app.` |
| ASC | pricing | $4.99 USD anchor → PPP across ~155 territories |
| Play | `sku` | `credit_pack_10_499_myapp` |
| Play | `purchase_type` | `managed` |
| Play | listing (en-US) | title = `Basic Credit Pack`, description = `10 credits to use in the app.` |
| Play | pricing | $4.99 USD anchor → PPP across ~173 billable regions |
| Adapty | `title` | `MyApp Basic Credit Pack v1 (4.99)` |
| Adapty | `period` | `consumable` (routed via Adapty REST API since CLI rejects this period value) |
| Adapty | `ios_product_id` / `android_product_id` | same ID on both — `credit_pack_10_499_myapp` |
| Adapty | access level | `credit_pack_access` (falls back to first level if missing) |

**Flags:**

| Flag | Required | Default |
|---|---|---|
| `--credits <number>` | yes | — |
| `--price <number>` | yes | — — USD anchor; PPP fans the rest |
| `--platform <target>` | no | `all` (= Play + ASC + Adapty) — `ios` = ASC only, `android` = Play only |
| `--product-version <n>` | no | `1` — v1 stays unsuffixed; v2+ appends `_v{n}` to the credit-pack ID |
| `--name <text>` | no | `"<Credits> Credit Pack"` |
| `--description <text>` | no | `"<Credits> credits to use in the app."` |
| `--review-screenshot <path>` | no | top-level `config.review_screenshot` |
| `--app-name <name>` | no | read from existing configs |
| `--bundle-id <id>` | no | iOS bundle ID override — use when no `Assets/appstore-config.json` yet |
| `--package-name <pkg>` | no | Android package name override — use when no `Assets/googleplay-config.json` yet |

**Idempotency:** safe to re-run. Play uses PATCH `?allowMissing=true` (upsert), ASC refreshes pricing on existing IAPs, Adapty pre-lists by title and skips matched.

---

## `adapty setup`

Sets up Adapty subscription products, paywalls, and placements using the [Adapty CLI](https://github.com/adaptyteam/adapty-cli).

```bash
kappmaker adapty setup
kappmaker adapty setup --config ./my-config.json
```

**Prerequisites:** Install (`npm install -g adapty`) and log in (`adapty auth login`).

### What it does (8 steps)

1. Validate CLI and authentication
2. Load config (from file or interactive prompts)
3. Find or create app (iOS + Android)
4. Create "Premium" access level
5. Create products
6. Create paywalls (linking products)
7. Create placements (linking paywalls)

### Default access levels

| sdk_id | Title | Used by |
|---|---|---|
| `Premium` | Premium | Subscriptions (Weekly + Yearly Premium) |
| `credit_pack_access` | Credit Pack Access | All 3 default credit pack products |

Subscriptions and consumable credit packs are routed to **separate access levels** — buying a credit pack does not unlock recurring premium features and vice versa. Each entry in `products[]` has an `access_level_sdk_id` that points to one of the access levels above; the orchestrator creates each access level once and links each product accordingly. Add more access levels in `Assets/adapty-config.json` if you need them.

Existing configs that use the legacy `access_level` (singular) field are auto-migrated to `access_levels` (plural) the next time you run `kappmaker adapty setup`.

### Default products

| Product | Period | Price | Access Level | iOS Product ID | Android Product ID | Android Base Plan ID |
|---------|--------|-------|--------------|----------------|--------------------|-----------------------|
| Weekly Premium | `weekly` | $6.99 | `Premium` | `{appname}.premium.weekly.v1.699.v1` | `{appname}.premium.weekly.v1` | `autorenew-weekly-699-v1` |
| Yearly Premium | `annual` | $29.99 | `Premium` | `{appname}.premium.yearly.v1.2999.v1` | `{appname}.premium.yearly.v1` | `autorenew-yearly-2999-v1` |
| Basic Credit Pack | `consumable` | $4.99 | `credit_pack_access` | `credit_pack_10_499_{appname}` | `credit_pack_10_499_{appname}` | _(none — IAP)_ |
| Pro Credit Pack | `consumable` | $9.99 | `credit_pack_access` | `credit_pack_30_999_{appname}` | `credit_pack_30_999_{appname}` | _(none — IAP)_ |
| Ultimate Credit Pack | `consumable` | $19.99 | `credit_pack_access` | `credit_pack_80_1999_{appname}` | `credit_pack_80_1999_{appname}` | _(none — IAP)_ |

iOS product IDs match the App Store Connect format, and Android IDs match what `kappmaker gpc setup` writes to Google Play Console — so all three systems link automatically without extra configuration. Credit packs (entries with a `credits` numeric field) get the consumable-IAP product ID format on both platforms; subscriptions get the `{appname}.premium.{period}.v1.x.v1` family.

> **Note on the `consumable` period:** the Adapty CLI v0.1.5 hardcodes a period whitelist (`weekly`, `monthly`, `two_months`, `trimonthly`, `semiannual`, `annual`, `lifetime`) that excludes `consumable`. The Adapty REST API does accept it, so KAppMaker creates credit pack products via a direct API call (using the auth token already cached at `~/.config/adapty/config.json`). Subscriptions and lifetime products still go through the CLI as before. If a future Adapty CLI release accepts `consumable`, this will become a no-op.

> **Note on prices in the Adapty dashboard:** the `price` field in `adapty-config.json` is used by KAppMaker to generate product IDs (e.g. `699` digits in `democli5.premium.weekly.v1.699.v1`) and to mirror prices into App Store Connect / Google Play Console — Adapty itself **does not accept developer-set prices** via its API. The `OPTIONS /products/` metadata explicitly says: _"Strips response to plan-specified fields (id, title, vendor_products)"_, and probing with seven different price-field shapes confirms they're all silently dropped. Prices appear in the Adapty dashboard only after you connect store integrations there (one-time, dashboard-only step):
>
> - **App Store Connect** — paste the same `.p8` / Key ID / Issuer ID you already have configured for `kappmaker create-appstore-app`
> - **Google Play** — upload the same service-account JSON used by `kappmaker gpc setup`
>
> Connect both at the Adapty dashboard → Settings → Integrations. The Adapty mobile SDK fetches prices directly from the native store APIs at runtime, so the in-app behaviour is correct even before you connect dashboard integrations — only the dashboard view is affected.

### Default paywalls and placements

| Paywall | Products | Placement | Developer ID |
|---------|----------|-----------|-------------|
| Default Paywall | Weekly + Yearly | Default | `default` |
| Onboarding Paywall | Weekly + Yearly | Onboarding | `onboarding` |
| Credits Paywall | Basic + Pro + Ultimate Credit Pack | Credits | `credits_pack` |

Fetch credit packs in app code with `Adapty.getPaywall("credits_pack")`.

| Flag | Description | Default |
|------|-------------|---------|
| `--config <path>` | Path to JSON config file | `./Assets/adapty-config.json` |

---

## Image Tools

AI-powered image commands. A fal.ai API key is prompted on first use if not already configured.

### `image-split <source>`

Splits a grid image into individual tiles.

```bash
kappmaker image-split grid.png --rows 4 --cols 4 --zoom 1.1 --gap 3
kappmaker image-split grid.png --keep 1,5    # Keep only tiles 1 and 5
```

| Flag | Description | Default |
|------|-------------|---------|
| `--rows <n>` | Number of rows | `4` |
| `--cols <n>` | Number of columns | `4` |
| `--zoom <factor>` | Zoom factor to crop edges | `1.07` |
| `--gap <pixels>` | Gap pixels at each tile edge | `0` |
| `--width <pixels>` | Output tile width | `512` |
| `--height <pixels>` | Output tile height | `512` |
| `--output-dir <path>` | Directory to save tiles | `.` |
| `--keep <indices>` | Comma-separated tile indices to keep | All |

### `image-remove-bg <source>`

Removes background using fal.ai bria model. Outputs PNG with transparency.

```bash
kappmaker image-remove-bg logo.png
kappmaker image-remove-bg photo.jpg --output clean.png
```

| Flag | Description | Default |
|------|-------------|---------|
| `--output <path>` | Custom output path | `<filename>_no_bg.png` |

### `image-enhance <source>`

Upscales and improves image quality using fal.ai nano-banana-2 edit model.

```bash
kappmaker image-enhance logo.png
kappmaker image-enhance photo.jpg --output improved.png
```

| Flag | Description | Default |
|------|-------------|---------|
| `--output <path>` | Custom output path | `<filename>_enhanced.png` |

---

## `convert-webp <source>`

Converts images (PNG, JPG, JPEG, BMP, TIFF, GIF) to WebP format using sharp — similar to Android Studio's built-in PNG-to-WebP converter. No API key needed; runs entirely locally.

```bash
kappmaker convert-webp icon.png                                      # Single file
kappmaker convert-webp app/src/main/res/drawable --recursive         # Entire directory tree
kappmaker convert-webp assets/ --quality 90 --recursive              # Custom quality
kappmaker convert-webp assets/ --recursive --delete-originals        # Remove originals after conversion
kappmaker convert-webp assets/ --output converted/                   # Output to a different directory
```

Shows before/after file sizes and percentage saved for each file, with a total at the end.

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--quality <n>` | WebP quality (0–100) | `75` |
| `--recursive` | Search directories recursively | `false` |
| `--delete-originals` | Delete original files after conversion | `false` |
| `--output <dir>` | Output directory (default: same directory as source) | — |

---

## `translate-screenshots [source-dir]`

Translates app screenshots into multiple locales using fal.ai and saves to Fastlane distribution directories.

```bash
kappmaker translate-screenshots                                        # Uses default: MobileApp/distribution/.../en-US
kappmaker translate-screenshots ./screenshots/en-US                    # Custom source dir
kappmaker translate-screenshots ./screenshots/en-US --locales de-DE ja-JP  # Specific locales
```

**Flow:**
1. Combines source images into a 2x4 grid
2. Submits grid to fal.ai for each locale (all in parallel)
3. Downloads translated grids, splits back into individual screenshots
4. Saves to Fastlane iOS/Android directory structure

**Output auto-detection:** If source is inside a distribution structure, the root is detected automatically. Otherwise defaults to `./MobileApp/distribution`.

| Flag | Description | Default |
|------|-------------|---------|
| `--output <path>` | Distribution directory root | Auto-detected |
| `--locales <codes...>` | Target locale codes (space-separated) or `all` | All 48 locales |
| `--rows <n>` | Grid rows | `2` |
| `--cols <n>` | Grid columns | `4` |
| `--resolution <res>` | AI resolution (`1K`, `2K`, `4K`) | `2K` |
| `--poll-interval <seconds>` | Seconds between status checks | `10` |

<details>
<summary>Supported locales (48 total)</summary>

| Play Store | App Store | | Play Store | App Store |
|------------|-----------|---|------------|-----------|
| `ar` | `ar-SA` | | `lt-LT` | — |
| `bg-BG` | — | | `lv-LV` | — |
| `bn-BD` | — | | `ms` | `ms` |
| `ca` | `ca` | | `nl-NL` | `nl-NL` |
| `cs-CZ` | `cs` | | `no-NO` | `no` |
| `da-DK` | `da` | | `pl-PL` | `pl` |
| `de-DE` | `de-DE` | | `pt-BR` | `pt-BR` |
| `el-GR` | `el` | | `pt-PT` | `pt-PT` |
| `en-AU` | `en-AU` | | `ro` | `ro` |
| `en-GB` | `en-GB` | | `ru-RU` | `ru` |
| `es-ES` | `es-ES` | | `sk` | `sk` |
| `es-419` | `es-MX` | | `sl-SI` | — |
| `et-EE` | — | | `sr` | — |
| `fi-FI` | `fi` | | `sv-SE` | `sv` |
| `fil` | — | | `sw` | — |
| `fr-FR` | `fr-FR` | | `ta-IN` | — |
| `fr-CA` | `fr-CA` | | `te-IN` | — |
| `he-IL` | `he` | | `th` | `th` |
| `hi-IN` | `hi` | | `tr-TR` | `tr` |
| `hr` | `hr` | | `uk` | `uk` |
| `hu-HU` | `hu` | | `vi` | `vi` |
| `id` | `id` | | `zh-CN` | `zh-Hans` |
| `it-IT` | `it` | | `zh-TW` | `zh-Hant` |
| `ja-JP` | `ja` | | | |
| `ko-KR` | `ko` | | | |

Locales marked with **—** are Android-only (no App Store equivalent).

</details>

---

## `generate-screenshots`

Generates marketing screenshots using OpenAI (prompt generation) + fal.ai (image generation).

```bash
kappmaker generate-screenshots --prompt "A fitness tracking app with workout plans"
kappmaker generate-screenshots --prompt "A meditation app" --input ./my-screenshots
kappmaker generate-screenshots --prompt "A recipe app" --style 3 --resolution 4K
```

**Flow:**
1. OpenAI (GPT-4.1) generates a detailed screenshot specification from your description
2. fal.ai generates a grid of 8 screenshots (`nano-banana-2`, or `nano-banana-2/edit` with reference images)
3. Grid is split into individual screenshots

**Output:** `Assets/screenshots/appstore/` + `Assets/screenshots/playstore/` (+ Fastlane dirs if `MobileApp/distribution` exists)

Requires: `falApiKey`, `openaiApiKey`, and `imgbbApiKey` (if using reference images)

| Flag | Description | Default |
|------|-------------|---------|
| `--prompt <text>` | App description (required) | — |
| `--input <dir>` | Reference screenshot directory | Auto-detect `Assets/screenshots` |
| `--style <id>` | Style preset (1-8) | `1` |
| `--output <dir>` | Output base directory | `Assets/screenshots` |
| `--resolution <res>` | AI resolution (`1K`, `2K`, `4K`) | `2K` |

<details>
<summary>Screenshot styles (1-8)</summary>

| Style | Description |
|-------|-------------|
| `1` | Rich multi-device marketing (bold text, shadows & reflections) |
| `2` | Minimal Apple-style (single centered device, clean whitespace) |
| `3` | SaaS conversion-focused (feature bullet callouts) |
| `4` | Bold geometric color blocks (vibrant split backgrounds) |
| `5` | Full-bleed UI, no device frames (edge-to-edge with blur overlay) |
| `6` | Cinematic depth (layered devices, depth-of-field) |
| `7` | Editorial lifestyle (soft neutral backgrounds, serif type) |
| `8` | Floating product reveal (Apple keynote aesthetic) |

</details>

---

## `generate-feature-image`

Generate a **Google Play feature graphic** (1024×500 banner shown at the top of the Play Store listing) using OpenAI (prompt generation) + fal.ai (image generation). Optionally include the app logo and screenshots — fal.ai places them inside realistic phone device frames.

```bash
kappmaker generate-feature-image \
    --prompt "A cute AI mascot generator" \
    --app-name "Masclet" \
    --subtitle "Generate mascots, emotions, and expressions" \
    --primary-color "#E63946"
```

With logo + screenshots:

```bash
kappmaker generate-feature-image \
    --prompt "AI fitness coach with daily workouts" \
    --app-name "FitTrack" \
    --subtitle "Your daily workout partner" \
    --primary-color "#FF3B30" \
    --logo ./Assets/logo.png \
    --reference ./screenshots/home.png ./screenshots/profile.png
```

**Flow:**
1. OpenAI (GPT-4.1) refines the inputs into a detailed banner specification.
2. fal.ai generates one wide image (`nano-banana-2`, or `nano-banana-2/edit` with reference images) at 16:9.
3. `sharp` resizes/crops the result to EXACTLY 1024×500 px (Play Store feature graphic spec) via center cover.

**Output:** Default follows the Fastlane Supply convention so `kappmaker publish --upload-images` picks it up automatically:

```
MobileApp/distribution/android/playstore_metadata/<locale>/images/featureGraphic.png
```

Falls back to `Assets/playstore/featureGraphic.png` outside a KAppMaker project. Override with `--output <path>`.

Requires: `falApiKey`, `openaiApiKey`, and `imgbbApiKey` (recommended when passing `--logo` or `--reference` — falls back to inline base64 data URIs otherwise).

| Flag | Description | Default |
|------|-------------|---------|
| `--prompt <text>` | App concept / description (required) | — |
| `--app-name <name>` | App name rendered on the banner (required) | — |
| `--primary-color <hex>` | Brand color in hex (required, e.g. `#FF3B30`) | — |
| `--subtitle <text>` | Tagline rendered below the app name | — |
| `--logo <path>` | App logo PNG; rendered pixel-faithfully on the brand panel | — |
| `--reference <paths...>` | Screenshot paths to place inside device frames (max 10) | — |
| `--output <path>` | Custom output file path | Fastlane Supply path |
| `--resolution <res>` | AI resolution (`1K`, `2K`, `4K`) | `2K` |
| `--locale <code>` | Play Store locale for the default output path | `en-US` |

**Tips**:
- The logo (image #1) is rendered exactly as-is — the model is instructed not to redraw or recolor it. Pass a clean transparent-background PNG for best results.
- Reference screenshots are placed inside modern phone device frames at a slight angle. Order matters — the first reference becomes the most prominent device on the banner.
- The primary color visibly dominates the brand panel background or accents.
- Only the app name and subtitle appear as text — no AI-generated lorem copy.

---

## `generate-ios-icons`

Generate the full iOS `AppIcon.appiconset` (all 11 PNG sizes Apple needs + `Contents.json`) from a single source logo. **Sharp-only — no AI, no API keys, no network calls.** Same output as appicon.co, but local and instant.

```bash
# Auto-detect logo in Assets/ and write to MobileApp/iosApp/*/Assets.xcassets/AppIcon.appiconset
kappmaker generate-ios-icons

# Explicit source + output
kappmaker generate-ios-icons --source ./Assets/logo.png --output ./path/to/AppIcon.appiconset

# Dark background for transparent logos
kappmaker generate-ios-icons --background "#000000"
```

**Flow:**
1. Resolves source — `--source <path>` if given; otherwise auto-detects in `Assets/` looking for `logo.png`, `logo_no_bg.png`, `app_logo.png`, `app_logo_no_bg.png`, `icon.png` (in that order). Prompts interactively if none found.
2. Center-crops to a square (warns if source is non-square) and flattens alpha onto `--background` color (App Store rejects icons with transparency).
3. Resizes via sharp Lanczos to all 11 pixel sizes: **29, 40, 57, 58, 60, 80, 87, 114, 120, 180, 1024**.
4. Writes `Contents.json` matching appicon.co's schema (12 entries — `120.png` is shared by 40pt@3x and 60pt@2x — covering `iphone` idiom @1x/2x/3x plus the `ios-marketing` 1024).
5. Overwrites existing files silently.

**Output:** Default is auto-detected `MobileApp/iosApp/*/Assets.xcassets/AppIcon.appiconset/` (the KAppMaker convention). Falls back to `Assets/AppIcon.appiconset/` outside a KAppMaker project. Override with `--output <dir>`.

| Flag | Description | Default |
|------|-------------|---------|
| `--source <path>` | Source logo PNG (≥ 1024×1024 recommended) | Auto-detect in `Assets/` |
| `--output <dir>` | Output `AppIcon.appiconset` directory | Auto-detect under `MobileApp/iosApp/` |
| `--background <hex>` | Flatten color for transparent logos | `#FFFFFF` |

**Tips:**
- Chain with `create-logo` — generate the logo first, then run `generate-ios-icons` to mint the full iconset.
- Source should be at least **1024×1024** for crisp icons at all sizes. Smaller sources are upscaled (with a warning) and will look blurry on iPhone 6.7" displays.
- Apple's App Store requires no transparency on the 1024×1024 marketing icon — the default `#FFFFFF` flatten satisfies this regardless of source alpha.

---

## `generate-android-icons`

Generate the full Android launcher icon set — all five mipmap density buckets, both legacy and adaptive variants, plus the adaptive icon XML files and the `ic_launcher_background` color entry in `values/colors.xml` — from a single source logo. **Sharp-only — no AI, no API keys.** Same output as Android Studio's Asset Studio, but local and instant.

```bash
# Auto-detect logo in Assets/ and write to MobileApp/composeApp/src/androidMain/res
kappmaker generate-android-icons

# Explicit source + brand-colored adaptive background
kappmaker generate-android-icons --source ./Assets/logo.png --background "#0F0A0D"

# Tighter foreground (logo fills more of the adaptive canvas)
kappmaker generate-android-icons --foreground-padding 0.1
```

**Flow:**
1. Resolves source — `--source <path>` if given; otherwise auto-detects in `Assets/` looking for `logo.png`, `logo_no_bg.png`, `app_logo.png`, `app_logo_no_bg.png`, `icon.png` (in that order). Prompts interactively if none found.
2. Center-crops to a square (warns if source is non-square or smaller than 432×432).
3. For each of 5 density buckets — `mdpi` / `hdpi` / `xhdpi` / `xxhdpi` / `xxxhdpi`:
   - Writes `ic_launcher.webp` and `ic_launcher_round.webp` at legacy size (**48 / 72 / 96 / 144 / 192 px**).
   - Writes `ic_launcher_foreground.webp` at adaptive size (**108 / 162 / 216 / 324 / 432 px**) with the logo centered in the inner safe zone and transparent surround.
4. Writes `mipmap-anydpi-v26/ic_launcher.xml` and `ic_launcher_round.xml` — adaptive-icon definitions referencing `@color/ic_launcher_background` and `@mipmap/ic_launcher_foreground`.
5. Upserts `<color name="ic_launcher_background">` in `values/colors.xml` — creates the file if missing, replaces the value if present, inserts the entry alongside any other colors otherwise.
6. Overwrites existing files silently.

**Output:** Default is auto-detected `MobileApp/composeApp/src/androidMain/res/` (the KMM template convention). Falls back to `MobileApp/androidApp/src/main/res/` → `app/src/main/res/` → `Assets/android/res/`. Override with `--output <dir>`.

| Flag | Description | Default |
|------|-------------|---------|
| `--source <path>` | Source logo PNG (≥ 432×432 recommended) | Auto-detect in `Assets/` |
| `--output <dir>` | Output Android `res/` directory | Auto-detect under `MobileApp/` |
| `--background <hex>` | Adaptive icon backdrop color (written to `colors.xml`) | `#FFFFFF` |
| `--foreground-padding <ratio>` | Padding each side of the adaptive foreground (`0`–`0.5`) | `0.25` |

**Tips:**
- Chain with `create-logo` then `generate-android-icons` to mint the full Android iconset right after generating the logo.
- The default `--foreground-padding 0.25` matches Android Asset Studio's default; drop to `0.1` if your logo is small and you want it to fill more of the adaptive frame.
- The adaptive `--background` is referenced by the XML — Android renders this color behind the foreground on Android 8+ devices. On legacy launchers, the legacy `ic_launcher.webp` is used as-is.
- `AndroidManifest.xml` should already reference `@mipmap/ic_launcher` and `@mipmap/ic_launcher_round` — this command doesn't touch the manifest.

---

## ASO Keyword Research (skill-driven)

Discover high-value sub-niche keywords for your app — scored by popularity and difficulty, clustered by theme — and save them to `AiGuidelines/keywords.md`. Uses the [Astro MCP](https://tryastro.app/docs/mcp/) tools for real-time App Store data when they're connected; falls back to a manual brainstorm without scores when they aren't.

This is a **skill-driven workflow** — no `kappmaker` binary. Runs through the [Claude Code skill](#claude-code-skill).

### Usage

```
Using kappmaker, research keywords for AI image generator
Using kappmaker, find aso keywords around manga translation
Using kappmaker, keyword research drift coaching competitors="Driftbox, RaceChrono"
Using kappmaker, find sub-niche keywords for photo editor min_popularity=40 max_difficulty=35
```

Short forms (`/kappmaker keyword research <topic>`, `find aso keywords for <topic>`) route to the same workflow.

### Arguments

| Arg | Default | Notes |
|---|---|---|
| `base` (the keyword) | _(required)_ | Can be derived from `AiGuidelines/prd.md`, `AiGuidelines/app-idea.md`, or your existing `en-US` name/subtitle if omitted — the workflow confirms before proceeding. |
| `competitors` | _(auto-discovered)_ | Comma-separated app names or App Store IDs. Auto-discovered via `search_app_store` if not given. |
| `min_popularity` | `30` | Keywords below this go to the "Discarded" list. |
| `max_difficulty` | `45` | Keywords above this go to the "Discarded" list. |
| `target_count` | `30–50` | Approximate pool size after filtering. Relaxes `max_difficulty` by +5 once if the count is too low. |
| `output` | `AiGuidelines/keywords.md` | Prompts before overwriting an existing file. |

### Output

`AiGuidelines/keywords.md` with five sections:

1. **Header** — base keyword, date, filter thresholds, competitor sources.
2. **Recommended primary keywords (top 5)** — the highest-value picks for your iOS `name` / `subtitle` and as front-loaded entries in `keywords.txt`.
3. **Sub-niche clusters** — keyword groups by semantic theme, scored and described. Each cluster maps cleanly to one of the 9 US-indexed locales in Mode 1 of metadata localization.
4. **Discarded** — keywords that hit the filter cutoff, so you can sanity-check the threshold.
5. **Ready-to-paste command** — a one-liner for `localize metadata mode=keyword-expansion` using the top ~10 keywords.

### Workflow (with Astro MCP)

1. `search_app_store` → discover competitor apps ranking for the base keyword.
2. `add_app` / `list_apps` → track competitors in Astro (free-tier quota errors are surfaced but don't abort).
3. `extract_competitors_keywords` / `get_app_keywords` → pull every keyword + popularity + difficulty score from each competitor.
4. `get_keyword_suggestions` → expand the pool with AI variations.
5. Filter by thresholds, dedupe (case-insensitive, singular/plural-aware), cluster by sub-niche.
6. Write `AiGuidelines/keywords.md`.

### Project convention: `AiGuidelines/`

KAppMaker's ASO workflows treat `AiGuidelines/` as the home for AI-facing planning docs (`prd.md`, `app-idea.md`, and the `keywords.md` this workflow writes). When you omit `base=`, the workflow scans `AiGuidelines/*.md` for a product description first, then falls back to your `README.md`, then your `en-US` name + subtitle. Keeping a 1–2 paragraph `AiGuidelines/app-idea.md` (or `prd.md`) means subsequent runs auto-derive their base keyword instead of asking you each time. The folder is created on first write if it doesn't exist.

### Without Astro MCP

If Astro MCP isn't connected, the workflow tells you upfront and offers a manual brainstorm path: 30–50 candidates from category knowledge, clustered the same way, with `?` in the popularity/difficulty columns. The output is still useful for the next step (metadata localization) — you just need to validate the scores on Astro / AppTweak / Sensor Tower before going to production.

To connect Astro MCP, follow the setup guide at [tryastro.app/docs/mcp/](https://tryastro.app/docs/mcp/) and add the MCP server to your Claude Code config.

### Chain into metadata localization

The whole point of keyword research is feeding good keywords into Mode 1 of `localize-metadata`. The output file ends with a ready-to-paste line:

```
Using kappmaker, localize metadata mode=keyword-expansion keywords="ai art generator, text to image ai, prompt to picture, style transfer, ai avatar, ai portrait, ai bedroom designer, ai car designer, ai hairstyle, ai logo maker"
```

Run that next to fan those keywords across the 9 US-indexed locales.

---

## ASO Metadata Localization (skill-driven)

Generates per-locale App Store and Google Play **text** metadata (`name`, `subtitle`, `keywords`, `description` on iOS; `title`, `short_description`, `full_description` on Android) — the text counterpart to `translate-screenshots`. The two together let you ship a fully-localized listing in one session.

This is a **skill-driven workflow** — it has no `kappmaker` binary because it doesn't need one. The [Claude Code skill](#claude-code-skill) (`kappmaker:kappmaker`) reads your base-locale source files, applies the ASO strategy you pick, and writes the localized output files using the Read/Write tools directly. No AI API key required.

### Two modes

```
Using kappmaker, localize metadata mode=keyword-expansion keywords="drift coach, lap timer, ai car tuner, ..."
Using kappmaker, localize metadata mode=market-localization base=en-US locales="de-DE, fr-FR, ja, es-ES"
```

| Mode | Output language | Locales | Use case |
|---|---|---|---|
| `keyword-expansion` | **English** in all 9 folders | Fixed 9 US-indexed locales (`ar-SA`, `fr-FR`, `ko`, `pt-BR`, `ru`, `vi`, `zh-Hans`, `zh-Hant`, `es-MX`) | Multiply unique indexed keyword surface in the US App Store. The US store indexes those 9 locales alongside `en-US` — by writing different keywords into each, you ~9× the searchable terms. |
| `market-localization` | **Native** per locale | Whatever locales you pass in `locales=` | Adapt copy to local search behavior and culture. Not literal translation. |

### Output layout

| Platform | Path |
|---|---|
| iOS | `MobileApp/distribution/ios/appstore_metadata/texts/<iosLocale>/{name,subtitle,keywords,description}.txt` |
| Android | `MobileApp/distribution/android/playstore_metadata/<playLocale>/{title,short_description,full_description}.txt` |

The iOS layout uses a literal `texts/` subfolder (KAppMaker convention — bridge to Fastlane `deliver` with a sync step in your release pipeline if needed).

### Enforced ASO rules

Every generated file passes these checks before being written to disk:

- **iOS field limits**: `name` ≤ 30, `subtitle` ≤ 30, `keywords` ≤ 100 (comma-separated, **no spaces after commas**), `description` ≤ 4000
- **Android field limits**: `title` ≤ 30, `short_description` ≤ 80, `full_description` ≤ 4000
- **No word overlap** across `name` / `subtitle` / `keywords` within a single iOS locale (Apple wastes the slot if you repeat a name/subtitle word in keywords)
- **No brand name or filler** (`app`, `best`, `free`, etc.) in iOS keywords
- **Front-loaded primary keyword** in `name` / `title` (position-weighted ranking)
- **Native-feel test** in Mode 2 — no machine-translated phrasing

### Behavior

- **Base-locale bootstrap**: if `en-US` (or whatever `base=` you pass) doesn't exist yet, the workflow asks for a 1–2 sentence app description and writes the base locale first. Never fails because the base is missing.
- **Mode 1 overwrite**: always overwrites the 9 indexed locales without prompting (only `en-US` is protected).
- **Mode 2 overwrite**: prompts once ("Found existing metadata in N locale(s) ... Overwrite ALL? \[y/N]") if any target locale already has files. `N` skips those locales and continues with the rest.
- **Summary table**: prints per-field character counts for every locale at the end, flagging any cell at ≥ 95% of cap.

### Supported locales

Mode 1 uses a fixed set of 9. Mode 2 accepts ~30 locale codes covering both platforms — the workflow holds the iOS↔Play mapping (e.g. iOS `ko` ↔ Play `ko-KR`, iOS `zh-Hans` ↔ Play `zh-CN`). See [the skill file](.claude/skills/kappmaker/SKILL.md#localize-aso-metadata--per-locale-name--subtitle--keywords--description) for the full table.

### Pair with screenshot translation

`translate-screenshots` (image side) + ASO metadata localization (text side) together produce a fully-localized App Store and Play Store listing. Typical sequence:

```
kappmaker translate-screenshots --locales de-DE ja
# then, in a Claude Code session:
Using kappmaker, localize metadata mode=market-localization locales="de-DE, ja"
```

---

## `fastlane configure`

Sets up Fastlane in the mobile app directory. Creates `Gemfile`, `fastlane/Fastfile`, and runs `bundle install`.

```bash
kappmaker fastlane configure
```

Run from the project root (containing `MobileApp/`) or inside `MobileApp/` directly.

**What it creates:**
- `Gemfile` — Ruby gem dependencies (fastlane)
- `fastlane/Fastfile` — Build and upload lanes for Android (Play Store) and iOS (App Store)

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
- **Android:** Google Play service account JSON — see [Google Play Publisher setup](#google-play-publisher--android-store-uploads)
- **iOS:** App Store Connect API key — see [App Store Publisher setup](#app-store-publisher--ios-store-uploads). The CLI generates the Fastlane-format publisher JSON automatically from your `ascKeyId`/`ascIssuerId`/`ascPrivateKeyPath` config.

| Flag | Description | Default |
|------|-------------|---------|
| `--platform <name>` | Platform to publish: `android`, `ios` (repeatable) | Both |
| `--track <name>` | Android Play Store track (internal/alpha/beta/production) | `production` |
| `--upload-metadata` | Upload metadata (title, description) | `false` |
| `--upload-screenshots` | Upload screenshots | `false` |
| `--upload-images` | Upload images — icon, feature graphic (Android only) | `false` |
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
- `keystore.jks` — the signing keystore
- `keystore.properties` — password, alias, and store file path

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

## `refactor`

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

Bumps Android and iOS version codes and optionally sets a new version name. Run from the project root (containing `MobileApp/`) or from inside `MobileApp/` directly.

```bash
kappmaker update-version              # Increment patch: 1.2.3 → 1.2.4, versionCode +1
kappmaker update-version -v 2.0.0     # Set explicit version name, versionCode +1
```

**What it updates:**

| Platform | File | Fields |
|----------|------|--------|
| Android | `androidApp/build.gradle.kts` (AGP 9+) or legacy `composeApp/build.gradle.kts` | `versionCode`, `versionName` |
| iOS | `iosApp/iosApp.xcodeproj/project.pbxproj` | `CURRENT_PROJECT_VERSION`, `MARKETING_VERSION` |
| iOS | `iosApp/iosApp/Info.plist` | `CFBundleVersion`, `CFBundleShortVersionString` |

If a platform's files are missing, that platform is skipped with a warning.

| Flag | Description | Default |
|------|-------------|---------|
| `-v, --version <name>` | Set explicit version name (e.g., `2.0.0`) | Auto-increment patch |

---

## Config Reference

Configuration is stored at `~/.config/kappmaker/config.json`.

```bash
kappmaker config init                                    # Interactive setup
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

## Credits & Attribution

The per-region PPP pricing tier table (`src/data/ppp-tiers.ts`, `src/data/ppp-tiers.upstream.json`) is derived from **[iosdevmax/ppp-pricing](https://github.com/iosdevmax/ppp-pricing)** by [@iosdevmax](https://github.com/iosdevmax) (MIT License).

The methodology is intentionally Steam/Spotify/RevenueCat-inspired rather than raw World Bank PPP data — raw PPP under-prices markets prone to VPN arbitrage and misses high-cost-of-living "rich tourist" markets. KAppMaker uses the upstream tiers as-is and extends coverage to all Play-supported regions and ASC territories via geographic/economic-proximity neighbour lookups (see `FALLBACK_NEIGHBOUR` in `src/data/ppp-tiers.ts`).

If you're shipping global pricing for an app, **please ⭐ the upstream repo** — it's the source of the curated tier values that make this work.

Full third-party attribution is in [NOTICE.md](NOTICE.md).

---

## Project Structure

```
src/
  index.ts                  # Entry point
  cli.ts                    # Command registration (Commander.js)
  commands/
    create.ts               # Full app setup (13-step orchestrator: Firebase + logo + refactor + build + ASC + GPC + Adapty)
    clone.ts                # `kappmaker clone <AppName>` — step 1 of create as a standalone (also called by create.ts)
    git.ts                  # `kappmaker git setup-upstream` — step 10 of create as a standalone (also called by create.ts)
    firebase.ts             # `kappmaker firebase` subcommands: login, project, apps, auth-anonymous, configs (steps 2-6 as standalones)
    create-logo.ts          # AI logo generation (accepts --prompt or interactive)
    generate-image.ts       # Generic AI image generator (fal.ai nano-banana-2)
    create-appstore-app.ts  # App Store Connect setup (13-step orchestrator)
    appstore-monetization-push.ts  # Push subscriptions + IAPs from appstore config to ASC (step 10 of create-appstore-app as standalone)
    create-play-app.ts      # Google Play Console setup (11-step orchestrator, aliased by `gpc setup`)
    gpc.ts                  # kappmaker gpc subcommands (setup, listings, subscriptions, iap, data-safety, app-check)
    adapty-setup.ts         # Adapty setup (8-step orchestrator)
    split.ts                # Grid image splitter
    remove-bg.ts            # Background removal
    enhance.ts              # Image quality enhancement
    convert-webp.ts         # PNG/JPG/BMP/TIFF/GIF to WebP conversion
    translate-screenshots.ts # Screenshot translation
    generate-screenshots.ts # AI screenshot generation
    fastlane-configure.ts   # Set up Fastlane (Gemfile + Fastfile + bundle install)
    publish.ts              # Build and upload to Play Store / App Store
    generate-keystore.ts    # Generate Android signing keystore
    android-release-build.ts # Build signed Android release AAB
    refactor.ts             # Package/app name refactoring
    update-version.ts       # Bump Android + iOS version codes and version name
    config.ts               # Config management
  services/
    firebase.service.ts     # Firebase CLI wrapper + anonymous auth
    fal.service.ts          # fal.ai API (generation, translation, screenshots)
    openai.service.ts       # OpenAI API (prompt generation)
    asc.service.ts          # App Store Connect CLI wrapper
    asc-monetization.service.ts  # ASC pricing, subscriptions, IAP
    gpc.service.ts          # Google Play Publisher API wrapper (JWT auth, edits, listings, data safety) — no external CLI
    gpc-monetization.service.ts  # Play new monetization API (subscriptions + base plans + onetimeproducts, NOT legacy inappproducts)
    gpc-data-safety.service.ts   # JSON → CSV converter for Play Data Safety form (uses bundled canonical template)
    adapty.service.ts       # Adapty CLI wrapper
    git.service.ts          # Git operations
    fastlane-setup.service.ts # Fastlane scaffolding (Gemfile + Fastfile)
    publish.service.ts      # Android/iOS publishing via Fastlane
    keystore.service.ts     # Android keystore generation
    gradle.service.ts       # Gradle build helpers (local.properties, clean & build)
    ios.service.ts          # CocoaPods setup
    fastlane.service.ts     # Android release build (keystore + gradle) + AAB finder
    logo.service.ts         # Logo prompt builder + image extraction
    screenshot.service.ts   # Screenshot grid operations + Fastlane output
    screenshot-styles.ts    # Screenshot style prompts (8 styles)
    refactor.service.ts     # Package/app name refactoring logic
    version.service.ts      # Android + iOS version reading/writing
  utils/
    logger.ts               # Chalk-based logging
    exec.ts                 # Command execution (execa + ora)
    validator.ts            # Dependency and input validation
    config.ts               # User config management
    prompt.ts               # Interactive prompts
  templates/
    appstore-config.json    # Default App Store Connect config
    googleplay-config.json  # Default Google Play Console config
    data-safety-template.json  # Canonical Play Data Safety form schema (783 rows, 217 Q IDs)
    adapty-config.json      # Default Adapty config
  types/
    index.ts                # Shared interfaces
    appstore.ts             # App Store Connect types
    googleplay.ts           # Google Play Console types
    adapty.ts               # Adapty types
```
