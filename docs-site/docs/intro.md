---
slug: /
sidebar_position: 1
title: Getting Started
description: >-
  Command reference for the KAppMaker CLI: create a Kotlin Multiplatform project, configure Firebase, build signed releases and ship to the App Store and Google Play. It is also the CLI behind App Army from KAppMaker, agentic mobile app development on your own machine. See kappmaker.com.
---

# KAppMaker CLI

A CLI that automates the whole mobile app launch, from the first project to store-ready builds.

It runs on its own, and it is also the CLI behind [App Army](https://kappmaker.com): agentic mobile app development
that you install on your own laptop or a server you rent. App Army's agents run Claude Code on your machine, under your
own accounts, and drive these commands for you. Every command here is one an agent can run unattended, and nothing is
ever sent back to KAppMaker from your machine.

Bought App Army? You have three ways in:

- **From your AI:** connect it with `claude mcp add --scope user kappmaker -- npx -y kappmaker@latest mcp` (other apps:
  [Set up App Army from your AI](/guides/app-army-from-your-ai)), then say "Set up App Army on my server at 1.2.3.4".
- **One command:** `curl -fsSL https://kappmaker.com/install.sh | bash` on your laptop, or
  `curl -fsSL https://kappmaker.com/install.sh | bash -s -- --server` on a Linux server as root.
  `kappmaker army install` does the same and checks the installer against its published SHA-256 first.
- **Only the Claude Code plugin:** `/plugin marketplace add KAppMaker/app-army-mod`, then
  `/plugin install kappmaker-app-army@app-army-mod` (accept the GitHub invite first).

Once the kit is installed, `kappmaker army <command>` runs the kit's own `kappmaker-army <command>`.

A single `kappmaker create` command can:

- Clone a template repository and set up a new project
- Create a Firebase project, register Android + iOS apps, enable authentication, and download SDK configs
- Generate an AI-powered app logo with automatic background removal
- Create an App Store Connect listing with metadata, categories, age rating, subscriptions, privacy declarations, and review contact info
- Configure an existing Google Play Console app: store listings, subscriptions, one-time in-app products, and the data safety declaration
- Set up Adapty subscription products, paywalls, and placements for both iOS and Android
- Refactor Gradle package names and application IDs
- Set up the build environment (Android SDK)
- Produce a signed Android release build (AAB) via Fastlane, ready to upload to Google Play

Standalone commands let you generate marketing screenshots from a text description, translate screenshots to 48+ locales in parallel, remove image backgrounds, enhance image quality, and split grid images, all with AI.

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

### Prefer to run only some steps?

Every step of `create` is also exposed as a standalone command. The most common minimal flow is to clone the template and refactor the package name:

```bash
kappmaker clone MyApp
cd MyApp-All/MobileApp
kappmaker refactor --app-id com.example.myapp --app-name MyApp
```

See the [Project Setup](/project-setup/create#running-steps-individually) section for the full mapping of `create` steps to standalone commands.

## Custom Templates

By default KAppMaker uses the [KAppMaker boilerplate](https://kappmaker.com) (Kotlin Multiplatform), but you can bring your own template:

```bash
kappmaker create MyApp --template-repo git@github.com:you/your-template.git
# or set it permanently:
kappmaker config set templateRepo git@github.com:you/your-template.git
```

See the [Custom Templates guide](/guides/custom-templates) for details on what works out of the box with any template.

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

## Commands Overview

| Command | Description |
|---------|-------------|
| `doctor` | Check the external tools the CLI uses: versions + exact install lines (macOS/Linux) |
| `army <cmd>` / `army install` | Run the App Army kit (`kappmaker-army`), or download, verify and run its installer |
| [`create`](/project-setup/create) | Full end-to-end app setup (Firebase, logo, ASC, GPC, Adapty, release build) |
| [`clone`](/project-setup/clone) | Clone the template into `<AppName>-All` (step 1 of `create` standalone) |
| [`git setup-upstream`](/project-setup/git-setup-upstream) | Rename `origin` to `upstream` after a manual clone |
| [`firebase`](/project-setup/firebase) | Firebase setup steps: `login`, `project`, `apps`, `auth-anonymous`, `configs` |
| [`create-logo`](/ai-image-tools/create-logo) | Generate an app logo with AI |
| [`create-appstore-app`](/store-publishing/create-appstore-app) | Set up an app on App Store Connect |
| [`gpc setup`](/store-publishing/google-play-console) | Set up an app on Google Play Console |
| [`adapty setup`](/store-publishing/adapty-setup) | Set up Adapty products, paywalls, and placements |
| [`image-split` / `image-remove-bg` / `image-enhance`](/ai-image-tools/image-tools) | AI-powered image tools |
| [`translate-screenshots` / `generate-screenshots`](/ai-image-tools/screenshots) | Screenshot translation and generation |
| [`publish`](/store-publishing/publish) | Build and upload to Play Store / App Store |
| [`refactor`](/project-setup/refactor) | Refactor package names and app IDs |
| [`update-version`](/project-setup/update-version) | Bump Android + iOS version codes |
