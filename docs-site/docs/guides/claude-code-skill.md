---
sidebar_position: 3
title: Claude Code Skill
---

# Claude Code Skill

If you use [Claude Code](https://claude.ai/code), you can install the `/kappmaker` skill to run any CLI command through natural language — with automatic prerequisite checks, guided setup, and inline error recovery.

## Install

```bash
npx skills add KAppMaker/KAppMaker-CLI --skill kappmaker
```

Or via the Claude Code plugin system:

```
/plugin marketplace add KAppMaker/KAppMaker-CLI
/plugin install kappmaker@KAppMaker-CLI
```

## Usage

Once installed, just describe what you want in plain English. Claude will check your config, verify API keys are set, and walk you through any missing prerequisites before running the command.

### App Setup

```
/kappmaker create MyApp
/kappmaker create MyApp using my custom template at github.com/me/my-template
/kappmaker refactor package name to com.example.myapp and app name to MyApp
/kappmaker bump the app version
/kappmaker bump version to 2.0.0
```

### AI Image Tools

```
/kappmaker create a logo for my fitness tracking app
/kappmaker create a logo with prompt "minimalist dumbbell icon, blue gradient"
/kappmaker generate an image with prompt "a cozy coffee shop illustration"
/kappmaker remove background from logo.png
/kappmaker enhance image quality of banner.png
/kappmaker split this 2x2 grid image and keep images 1 and 3
/kappmaker convert all images in assets/ to webp
/kappmaker convert logo.png to webp with quality 90
```

### Screenshots

```
/kappmaker generate screenshots for my fitness app
/kappmaker translate screenshots to German and Japanese
/kappmaker translate screenshots from en-US to all supported locales
```

### Store Publishing Setup

```
/kappmaker set up App Store Connect
/kappmaker set up Google Play Console
/kappmaker set up Adapty subscriptions and paywalls
```

### Google Play Console

```
/kappmaker push store listings to Google Play
/kappmaker push subscriptions to Google Play
/kappmaker push in-app purchases to Google Play
/kappmaker push data safety to Google Play
/kappmaker list subscriptions on Google Play
/kappmaker check if my app exists on Google Play
```

### Build & Publish

```
/kappmaker configure Fastlane
/kappmaker generate Android signing keystore
/kappmaker build Android release
/kappmaker publish to Android
/kappmaker publish to iOS
/kappmaker publish to both stores
```
