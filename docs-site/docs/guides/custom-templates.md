---
sidebar_position: 2
title: Custom Templates
---

# Custom Templates

The CLI defaults to the [KAppMaker](https://kappmaker.com) boilerplate but supports custom templates via `--template-repo` or a permanent config setting.

## Setup

```bash
# Per-command:
kappmaker create MyApp --template-repo git@github.com:you/your-template.git

# Or set permanently:
kappmaker config set templateRepo git@github.com:you/your-template.git
```

## What Works with Any Template

These commands are standalone and don't depend on any specific boilerplate:

- **AI logo generation** — Generate logo variations with fal.ai
- **AI screenshot generation** — Generate marketing screenshots from a text description (8 style presets)
- **Screenshot translation** — Translate app screenshots to 48+ locales in parallel
- **App Store Connect setup** — Register bundle ID, create app, set metadata, categories, subscriptions, privacy
- **Google Play Console setup** — Push store listings, subscriptions, in-app products, data safety declaration
- **Adapty subscription setup** — Create products, paywalls, and placements
- **Version bumping** — Increment Android and iOS version codes
- **Image tools** — Split grids, remove backgrounds, enhance quality

## KAppMaker Boilerplate-Specific

Some steps in the `create` command assume the KAppMaker project structure and will be **skipped with a warning** when using a custom template:

- **Package refactor** — Renames package name, app ID, and display name using the TypeScript refactor service
- **Firebase SDK config placement** — Downloads configs to KAppMaker-specific paths (falls back to `Assets/`)
- **Build environment** — Creates `local.properties` and runs CocoaPods in the `MobileApp/` directory
- **Android release build** — Generates keystore and builds signed AAB
- **Git remotes** — Renames origin to upstream (designed for the "fork from template" workflow)
- **Screenshot translation default path** — Defaults to `MobileApp/distribution/ios/appstore_metadata/screenshots/en-US`

## Graceful Degradation

Steps 10–13 of the `create` command detect the boilerplate structure and skip gracefully:

- **Step 10 (Package refactor)** — uses TypeScript refactor service (no Gradle dependency)
- **Step 11 (Build env)** — checks for `gradlew` before `local.properties`, checks for `Podfile` before CocoaPods
- **Step 12 (Git remotes)** — always runs (works with any template)
- **Step 13 (Fastlane build)** — checks for `Fastfile` before attempting the build
- **Step 6 (Firebase configs)** — falls back to `Assets/` if KAppMaker directories don't exist
