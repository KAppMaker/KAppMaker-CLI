# What the CLI does, commands overview, prerequisites and API keys

Moved here from the README. Index: [docs/commands](README.md).

## What the CLI does

The CLI behind [App Army](https://kappmaker.com) from KAppMaker: it automates the whole mobile app launch, from the first project
to store-ready builds, and every command is one an agent can run unattended. It works on its own too:
`npm install -g kappmaker`. The CLI sends nothing about you or your machine anywhere: no telemetry, no analytics, no
update checks. The only network calls it makes are to the services you configure for the command you run.

A single `kappmaker create` command can:
- Clone a template repository and set up a new project
- Create a Firebase project, register Android + iOS apps, enable authentication, and download SDK configs
- Generate an AI-powered app logo with automatic background removal
- Create an App Store Connect listing with metadata, categories, age rating, subscriptions, privacy declarations, and review contact info
- Configure an existing Google Play Console app (store listings, subscriptions, one-time in-app products, and the data safety declaration) via a built-in wrapper around the Play Publisher API (no external CLI, no extra dependencies)
- Set up Adapty subscription products, paywalls, and placements for both iOS and Android
- Refactor Gradle package names and application IDs
- Set up the build environment (Android SDK)
- Produce a signed Android release build (AAB) via Fastlane, ready to upload to Google Play

On top of that, standalone commands let you generate marketing screenshots from a text description, translate screenshots to 48+ locales in parallel, generate arbitrary images with AI, remove image backgrounds, enhance image quality, and split grid images, all with AI.

By default it uses the [KAppMaker](https://kappmaker.com) boilerplate (Kotlin Multiplatform), but you can bring your own template repository via `--template-repo` or `kappmaker config set templateRepo <your-repo-url>`. Boilerplate-specific steps (Gradle refactor, Fastlane build, CocoaPods) are automatically detected and skipped with a warning when using a custom template.

## Commands Overview

| Command | Description |
|---------|-------------|
| `doctor` | Check the external tools the CLI uses: versions + exact install lines (macOS/Linux) |
| `army <cmd>` / `army install` | Run the App Army kit (`kappmaker-army`), or download, verify and run its installer |
| [`kappmaker create <app-name>`](create-and-config.md#create-app-name) | Full end-to-end app setup (Firebase, logo, App Store Connect, Google Play Console, Adapty, release build) |
| [`kappmaker clone <app-name>`](create-and-config.md#clone-app-name) | Clone the template into `<AppName>-All` (step 1 of `create` as a standalone) |
| [`kappmaker git setup-upstream`](create-and-config.md#git-setup-upstream) | Rename `origin` to `upstream` (step 10 of `create` as a standalone) |
| [`kappmaker firebase login`](stores.md#firebase) | `firebase login`: authenticate the Firebase CLI |
| [`kappmaker firebase project`](stores.md#firebase) | Create a Firebase project (idempotent) |
| [`kappmaker firebase apps`](stores.md#firebase) | Create Android + iOS apps in a Firebase project (idempotent) |
| [`kappmaker firebase auth-anonymous`](stores.md#firebase) | Enable anonymous authentication |
| [`kappmaker firebase configs`](stores.md#firebase) | Download `google-services.json` + `GoogleService-Info.plist` |
| [`kappmaker create-logo`](images-and-aso.md#create-logo) | Generate an app logo with AI (fal.ai) |
| [`kappmaker generate-image`](images-and-aso.md#generate-image) | Generate an arbitrary image with AI: generic wrapper around fal.ai nano-banana-2 |
| [`kappmaker create-appstore-app`](stores.md#create-appstore-app) | Set up an app on App Store Connect (metadata, subscriptions, privacy) |
| [`kappmaker appstore-monetization-push`](stores.md#appstore-monetization-push) | Push subscriptions + IAPs from `appstore-config.json` to App Store Connect (monetization step of `create-appstore-app` as a standalone; supports `--subscriptions-only`, `--iap-only`, `--config`) |
| [`kappmaker gpc setup`](stores.md#gpc) | Set up an existing app on Google Play Console (listings, subscriptions, IAPs, data safety) |
| [`kappmaker gpc listings push`](stores.md#gpc) | Push store listings from the Google Play config file |
| [`kappmaker gpc subscriptions list/push`](stores.md#gpc) | List or push subscriptions on Google Play Console |
| [`kappmaker gpc iap list/push`](stores.md#gpc) | List or push one-time in-app products on Google Play Console |
| [`kappmaker gpc data-safety push`](stores.md#gpc) | Push data safety declaration on Google Play Console |
| [`kappmaker gpc app-check --package <pkg>`](stores.md#gpc) | Check if a package exists on Google Play Console |
| [`kappmaker gpc monetization push`](stores.md#gpc-monetization-push) | Push subscriptions + IAPs from `googleplay-config.json` to Google Play Console (monetization steps of `gpc setup` as a standalone; supports `--subscriptions-only`, `--iap-only`) |
| [`kappmaker subscription add`](stores.md#subscription-add) | Quick-add one new subscription to Google Play + App Store Connect (auto-aligned IDs, full PPP fan-out, auto-creates ASC subscription group if missing) |
| [`kappmaker iap add`](stores.md#iap-add) | Quick-add one new credit-pack IAP to Google Play + App Store Connect + Adapty (auto-aligned IDs, full PPP fan-out) |
| [`kappmaker adapty setup`](stores.md#adapty-setup) | Set up Adapty products, paywalls, and placements |
| [`kappmaker image-split <image>`](images-and-aso.md#image-split-source) | Split a grid image into individual tiles |
| [`kappmaker image-remove-bg <image>`](images-and-aso.md#image-remove-bg-source) | Remove background from an image (fal.ai) |
| [`kappmaker image-enhance <image>`](images-and-aso.md#image-enhance-source) | Upscale and enhance image quality (fal.ai) |
| [`kappmaker convert-webp <source>`](images-and-aso.md#convert-webp-source) | Convert images (PNG, JPG, BMP, TIFF, GIF) to WebP |
| [`kappmaker translate-screenshots [dir]`](images-and-aso.md#translate-screenshots-source-dir) | Translate screenshots to multiple locales (fal.ai) |
| [`kappmaker generate-screenshots`](images-and-aso.md#generate-screenshots) | Generate marketing screenshots with AI (OpenAI + fal.ai) |
| [`kappmaker generate-feature-image`](images-and-aso.md#generate-feature-image) | Generate a Google Play feature graphic (1024×500) with AI (OpenAI + fal.ai) |
| [`kappmaker generate-ios-icons`](images-and-aso.md#generate-ios-icons) | Generate all iOS `AppIcon.appiconset` PNG sizes + `Contents.json` from one logo (sharp, no AI) |
| [`kappmaker generate-android-icons`](images-and-aso.md#generate-android-icons) | Generate all Android `mipmap-*` launcher icons (5 densities × 3 files) + adaptive icon XML + `colors.xml` entry (sharp, no AI) |
| [ASO Keyword Research](images-and-aso.md#aso-keyword-research-skill-driven) | _(skill-driven, no binary)_: Find high-value keywords with popularity + difficulty scores via Astro MCP, cluster by sub-niche, write `AiGuidelines/keywords.md` |
| [ASO Metadata Localization](images-and-aso.md#aso-metadata-localization-skill-driven) | _(skill-driven, no binary)_: Write localized `name`/`subtitle`/`keywords`/`description` and `title`/`short/full_description` files for App Store + Google Play |
| [`kappmaker fastlane configure`](build-and-publish.md#fastlane-configure) | Set up Fastlane in the mobile app directory |
| [`kappmaker publish`](build-and-publish.md#publish) | Build and upload to Google Play and/or App Store via Fastlane |
| [`kappmaker generate-keystore`](build-and-publish.md#generate-keystore) | Generate an Android signing keystore for Play Store releases |
| [`kappmaker android-release-build`](build-and-publish.md#android-release-build) | Build a signed Android release AAB |
| [`kappmaker refactor`](create-and-config.md#refactor) | Refactor package names, application ID, bundle ID, and app name |
| [`kappmaker update-version`](create-and-config.md#update-version) | Bump Android and iOS build numbers (`--version-name` to set the name) |
| [`kappmaker config`](create-and-config.md#config-reference) | Manage CLI settings, API keys, and global defaults |

## Features

### Works with any project

These commands are standalone and don't depend on any specific boilerplate:

- **AI logo generation**: Generate logo variations with fal.ai, pick your favorite, auto-remove background
- **AI screenshot generation**: Generate marketing screenshots from a text description (8 style presets)
- **Screenshot translation**: Translate app screenshots to 48+ locales in parallel
- **ASO keyword research**: Skill-driven workflow that discovers high-value sub-niche keywords for a base topic via the [Astro MCP](https://tryastro.app/docs/mcp/) tools (real-time App Store popularity + difficulty scores from competitor analysis and AI suggestions), filters them by configurable thresholds, clusters them by sub-niche, and writes `AiGuidelines/keywords.md`. Falls back to a manual brainstorm when Astro MCP isn't connected. Output feeds directly into the metadata localization workflow below.
- **ASO metadata localization**: Skill-driven workflow that writes per-locale `name`/`subtitle`/`keywords`/`description` (iOS) and `title`/`short_description`/`full_description` (Android) text files with two strategies: US-indexed keyword expansion (English copy with different keywords per locale to multiply indexed surface) or native per-market localization. Char-limits, keyword-field rules, and no-duplicate-word-across-fields are enforced automatically.
- **App Store Connect setup**: Register bundle ID (with Sign in with Apple, In-App Purchases, and Push Notifications capabilities enabled automatically), create app, set metadata, categories, age rating, subscriptions, privacy, and review info; fully automated, no manual App Store Connect steps needed
- **Google Play Console setup**: Push store listings, subscriptions (new monetization API), one-time in-app products, and the data safety declaration via a built-in wrapper around the Play Publisher API; no external CLI, no extra dependencies
- **Adapty subscription setup**: Create products, paywalls, and placements for iOS and Android
- **Version bumping**: Increment Android and iOS version codes and names in one command
- **Image tools**: Split grids, remove backgrounds, enhance quality, convert to WebP

### KAppMaker boilerplate-specific

The `create` command runs the full end-to-end setup. Some steps assume the [KAppMaker](https://kappmaker.com) project structure and will be skipped with a warning if you use a custom template:

- **Package refactor**: Renames package name, app ID, and display name using the TypeScript refactor service (also available standalone via `kappmaker refactor`)
- **Firebase SDK config placement**: Downloads `google-services.json` and `GoogleService-Info.plist` to KAppMaker-specific paths (falls back to `Assets/` for custom templates)
- **Build environment**: Creates `local.properties`; iOS dependencies resolve via Swift Package Manager at build time (CocoaPods runs only if a custom template still has a `Podfile`)
- **Android release build**: Generates keystore and builds signed AAB (also available standalone via `kappmaker android-release-build`)
- **Git remotes**: Renames origin to upstream (designed for the "fork from template" workflow)
- **Screenshot translation default path**: Defaults to `MobileApp/distribution/ios/appstore_metadata/screenshots/en-US` (falls back to parent of source directory)

---

## Prerequisites

- **Node.js** >= 22.12: macOS: `brew install node@22`; Linux: `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs`
- **Git**: macOS: `xcode-select --install`; Linux: `sudo apt-get install -y git`
- **Firebase CLI**: `npm install -g firebase-tools`
- **Fastlane**: via Bundler in the template repo (Ruby 3 + `gem install bundler`; Linux: `sudo apt-get install -y ruby-full build-essential`)
- **JDK 17+** (Gradle, keytool): macOS: `brew install --cask temurin@17`; Linux: `sudo apt-get install -y openjdk-17-jdk`
- **Android SDK**: `ANDROID_HOME`, else `~/Library/Android/sdk` (macOS) or `~/Android/Sdk` (Linux); configurable via `androidSdkPath`
- **asc CLI** (optional, for App Store Connect): **≥ 5.9.0**: `brew install asc` (macOS/Linux) or `curl -fsSL https://asccli.sh/install | bash`
- **Adapty CLI** (optional, for Adapty setup): `npm install -g adapty`
- **GitHub CLI** (optional, for `ios-ci`): macOS: `brew install gh`; Linux: `sudo apt-get install -y gh`
- **No extra CLI for Google Play Console**: `kappmaker gpc` talks to the Play Publisher API directly

Run **`kappmaker doctor`** to see which of these are installed, at what version, and the exact install line for anything missing on your platform.

## External Services & API Keys

The CLI integrates with several external services for AI image generation, app store management, and subscription setup. All keys are stored locally at `~/.config/kappmaker/config.json`.

### fal.ai: AI Image Generation

**Used for:** Logo generation, background removal, image enhancement, screenshot translation, and screenshot generation.

**How to get your key:**
1. Sign up at [fal.ai](https://fal.ai)
2. Go to [Dashboard > Keys](https://fal.ai/dashboard/keys) and create an API key
3. `kappmaker config set falApiKey <your-key>`: or skip this and the CLI will prompt you the first time you run a command that needs it

### ImgBB: Image Hosting

**Used for:** Temporarily hosting reference images when generating or translating screenshots (fal.ai needs a public URL to process images).

**How to get your key:**
1. Sign up at [imgbb.com](https://imgbb.com)
2. Go to [api.imgbb.com](https://api.imgbb.com/) and get your free API key
3. `kappmaker config set imgbbApiKey <your-key>`: or prompted on first use

### OpenAI: Prompt Generation

**Used for:** Generating detailed screenshot specifications from a short app description (uses GPT-4.1). Only needed for the `generate-screenshots` command.

**How to get your key:**
1. Sign up at [platform.openai.com](https://platform.openai.com)
2. Go to [API Keys](https://platform.openai.com/api-keys) and create a new key
3. `kappmaker config set openaiApiKey <your-key>`: or prompted on first use

### App Store Connect CLI (asc): iOS App Management & Publishing

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

> **Note:** `kappmaker publish --platform ios` uses `ascKeyId`, `ascIssuerId`, and `ascPrivateKeyPath` to automatically generate the Fastlane-format publisher JSON; no separate credentials needed.

### Adapty CLI: Subscription Management

**Used for:** Setting up in-app subscription products, paywalls, and placements across iOS and Android via Adapty's backend.

**How to set up:**
1. Install: `npm install -g adapty`
2. Log in: `adapty auth login` (opens browser for authentication)
3. Run: `kappmaker adapty setup`

### Firebase CLI: Backend Setup

**Used for:** Creating Firebase projects, registering Android/iOS apps, downloading SDK config files (`google-services.json`, `GoogleService-Info.plist`), and enabling anonymous authentication.

**How to set up:**
1. Install: `npm install -g firebase-tools`
2. The `create` command handles login and project creation interactively.

### Google Play Publisher: Android Store Uploads + Play Console Management

**Used for:**
- Building and uploading Android AABs to Google Play Store via `kappmaker publish --platform android` (Fastlane)
- Configuring store listings, subscriptions, in-app products, and the data safety declaration via `kappmaker gpc ...` (direct Publisher API call, no external CLI)

Both flows share the same service account JSON key: set it once, use it everywhere.

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

> **Note:** Google Play does not allow creating new apps via any public API; you must create the app manually once in [Play Console](https://play.google.com/console/u/0/developers) before `kappmaker gpc` can configure it.

### App Store Publisher: iOS Store Uploads

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
