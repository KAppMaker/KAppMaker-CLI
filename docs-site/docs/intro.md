---
slug: /
sidebar_position: 1
title: Getting Started
---

# KAppMaker CLI

CLI tool that automates the entire mobile app launch process — from project scaffolding to store-ready builds.

A single `kappmaker create` command can:

- Clone a template repository and set up a new project
- Create a Firebase project, register Android + iOS apps, enable authentication, and download SDK configs
- Generate an AI-powered app logo with automatic background removal
- Create an App Store Connect listing with metadata, categories, age rating, subscriptions, privacy declarations, and review contact info
- Configure an existing Google Play Console app — store listings, subscriptions, one-time in-app products, and the data safety declaration
- Set up Adapty subscription products, paywalls, and placements for both iOS and Android
- Refactor Gradle package names and application IDs
- Set up the build environment (Android SDK, CocoaPods)
- Produce a signed Android release build (AAB) via Fastlane, ready to upload to Google Play

Standalone commands let you generate marketing screenshots from a text description, translate screenshots to 48+ locales in parallel, remove image backgrounds, enhance image quality, and split grid images — all powered by AI.

## Installation

```bash
npm install -g kappmaker
```

Then use it anywhere:

```bash
kappmaker create <AppName>
```

### Development setup

```bash
npm install
npx tsx src/index.ts create <AppName>
```

## Quick Start

1. **Install** the CLI globally:
   ```bash
   npm install -g kappmaker
   ```

2. **Configure** API keys and preferences:
   ```bash
   kappmaker config init
   ```

3. **Create** your app:
   ```bash
   kappmaker create MyApp
   ```

This runs the full 13-step setup: Firebase project, AI logo, App Store Connect, Google Play Console, Adapty subscriptions, and a signed release build.

## Custom Templates

By default KAppMaker uses the [KAppMaker boilerplate](https://kappmaker.com) (Kotlin Multiplatform), but you can bring your own template:

```bash
kappmaker create MyApp --template-repo git@github.com:you/your-template.git
# or set it permanently:
kappmaker config set templateRepo git@github.com:you/your-template.git
```

See the [Custom Templates guide](/guides/custom-templates) for details on what works out of the box with any template.

## Prerequisites

- **Node.js** >= 20
- **Git**
- **Firebase CLI** — `npm install -g firebase-tools`
- **CocoaPods** — `sudo gem install cocoapods`
- **Fastlane** — via Bundler in the template repo
- **Android SDK** — installed at `~/Library/Android/sdk` (configurable)
- **asc CLI** (optional, for App Store Connect) — `brew install asc`
- **Adapty CLI** (optional, for Adapty setup) — `npm install -g adapty`
- **No extra CLI for Google Play Console** — `kappmaker gpc` talks to the Play Publisher API directly

## Commands Overview

| Command | Description |
|---------|-------------|
| [`create`](/project-setup/create) | Full end-to-end app setup (Firebase, logo, ASC, GPC, Adapty, release build) |
| [`create-logo`](/ai-image-tools/create-logo) | Generate an app logo with AI |
| [`create-appstore-app`](/store-publishing/create-appstore-app) | Set up an app on App Store Connect |
| [`gpc setup`](/store-publishing/google-play-console) | Set up an app on Google Play Console |
| [`adapty setup`](/store-publishing/adapty-setup) | Set up Adapty products, paywalls, and placements |
| [`image-split` / `image-remove-bg` / `image-enhance`](/ai-image-tools/image-tools) | AI-powered image tools |
| [`translate-screenshots` / `generate-screenshots`](/ai-image-tools/screenshots) | Screenshot translation and generation |
| [`publish`](/store-publishing/publish) | Build and upload to Play Store / App Store |
| [`refactor`](/project-setup/refactor) | Refactor package names and app IDs |
| [`update-version`](/project-setup/update-version) | Bump Android + iOS version codes |
