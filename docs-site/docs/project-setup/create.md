---
sidebar_position: 1
title: Full App Setup
---

# Full App Setup

Full end-to-end app bootstrapping. Creates a new KAppMaker app from the template and optionally sets up everything needed to publish.

**Command:** `kappmaker create <app-name>`

```bash
kappmaker create Remimi
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--template-repo <url>` | Template repository URL | KAppMaker template |
| `--organization <org>` | Organization for Fastlane signing | App name (configurable) |

## What it Does (13 Steps)

| Step | Action | Details |
|------|--------|---------|
| 1 | Clone template | Clones into `<AppName>-All/` (prompts to overwrite if exists) |
| 2 | Firebase login | Opens browser for authentication |
| 3 | Create Firebase project | `<appname>-app` (skips if exists) |
| 4 | Create Firebase apps | Android + iOS apps (reuses existing if found) |
| 5 | Enable anonymous auth | If brand-new project, prompts user to click "Get started" in Firebase Console, then enables via API |
| 6 | Download SDK configs | `google-services.json` + `GoogleService-Info.plist` (verifies package match, falls back to `Assets/`) |
| 7 | Logo generation | *Optional* — AI logo + automatic background removal |
| 8 | Package refactor | Renames packages, IDs, app name across all modules |
| 9 | Build environment | `local.properties`, generates signing keystore if missing (iOS deps resolve via SwiftPM) |
| 10 | Git remotes | Renames origin to upstream |
| | *Pre-store reminder* | *Prompts user to create Google Play Console app; ASC is created automatically* |
| 11 | App Store Connect | *Optional* — full app setup (metadata, subs, privacy); app created automatically via `asc web apps create` |
| 12 | Google Play Console | *Optional* — Fastlane builds + uploads AAB to internal track, then runs full gpc setup |
| 13 | Adapty setup | *Optional* — products, paywalls, placements (links to ASC + Play products created in 11-12) |

## Step Details

### Step 3 — Firebase Project

If Firebase project creation fails, steps 4-6 are skipped with a warning.

### Step 5 — Anonymous Auth

Uses the Identity Toolkit REST API. If the project is brand-new, the user is prompted to click "Get started" in the Firebase Console, then the CLI retries automatically.

### Step 6 — SDK Configs

Downloads `google-services.json` and `GoogleService-Info.plist` to KAppMaker-specific paths. Falls back to `Assets/` for custom templates. Verifies that the package name in `google-services.json` matches the config.

### Step 7 — Logo Generation

Optional — asks the user first. Generates a logo grid via fal.ai, lets the user pick a variation, then auto-removes the background. See [AI Logo Generation](/ai-image-tools/create-logo) for details.

### Steps 11-13 — Store Setup

Each is optional and prompted. They call the same logic as the standalone commands:
- Step 11: [App Store Connect Setup](/store-publishing/create-appstore-app)
- Step 12: [Google Play Console Setup](/store-publishing/google-play-console) (builds + uploads AAB first)
- Step 13: [Subscription Management (Adapty)](/store-publishing/adapty-setup)

## Running Steps Individually

Every step of `create` is also exposed as a standalone command, so you can run partial flows without going through the full 13-step wizard. Use these when you only need a subset (e.g. "just clone and refactor", or "set up Firebase for an existing project").

| Step | Standalone command |
|------|--------------------|
| 1 | [`kappmaker clone <AppName>`](/project-setup/clone) |
| 2 | `kappmaker firebase login` ([Firebase Setup](/project-setup/firebase)) |
| 3 | `kappmaker firebase project --app-name <Name>` |
| 4 | `kappmaker firebase apps --project <id> --app-name <Name> --package-name <pkg>` |
| 5 | `kappmaker firebase auth-anonymous --project <id>` |
| 6 | `kappmaker firebase configs --project <id> --app-name <Name> --package-name <pkg>` |
| 7 | [`kappmaker create-logo`](/ai-image-tools/create-logo) |
| 8 | [`kappmaker refactor`](/project-setup/refactor) |
| 9 | [`kappmaker generate-keystore`](/build-signing/generate-keystore) |
| 10 | [`kappmaker git setup-upstream`](/project-setup/git-setup-upstream) |
| 11 | [`kappmaker create-appstore-app`](/store-publishing/create-appstore-app) |
| 12 | [`kappmaker gpc setup`](/store-publishing/google-play-console) |
| 13 | [`kappmaker adapty setup`](/store-publishing/adapty-setup) |

### Minimal flow (clone + refactor only)

```bash
kappmaker clone MyApp
cd MyApp-All/MobileApp
kappmaker refactor --app-id com.example.myapp --app-name MyApp
```
