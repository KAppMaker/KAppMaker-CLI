---
sidebar_position: 9
title: Publishing to Play Store & App Store
---

# Publishing to Play Store & App Store

Build and upload your app to Google Play and/or App Store using Fastlane.

**Command:** `kappmaker publish`

```bash
kappmaker publish                                          # Both platforms
kappmaker publish --platform android                       # Android only
kappmaker publish --platform ios                           # iOS only
kappmaker publish --platform android --track internal      # Android internal track
kappmaker publish --upload-metadata --upload-screenshots   # With metadata
```

Run from the project root (containing `MobileApp/`) or inside `MobileApp/` directly. Requires Fastlane via Bundler (`Gemfile` + `fastlane/Fastfile`).

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--platform <name>` | Platform to publish: `android`, `ios` (repeatable) | Both |
| `--track <name>` | Android Play Store track (internal/alpha/beta/production) | `production` |
| `--upload-metadata` | Upload metadata (title, description) | `false` |
| `--upload-screenshots` | Upload screenshots | `false` |
| `--upload-images` | Upload images — icon, feature graphic (Android only) | `false` |
| `--submit-for-review` | Submit for review after upload | `true` |

## Prerequisites

- **Android:** Google Play service account JSON — see [Google Play Publisher setup](/guides/external-services#google-play-publisher)
- **iOS:** App Store Connect API key — see [App Store Connect setup](/guides/external-services#app-store-connect-cli). The CLI generates the Fastlane-format publisher JSON automatically from your `ascKeyId`/`ascIssuerId`/`ascPrivateKeyPath` config.

:::tip
Run [`fastlane configure`](/build-signing/fastlane-configure) first if you haven't set up Fastlane yet.
:::
