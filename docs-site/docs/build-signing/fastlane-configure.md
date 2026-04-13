---
sidebar_position: 8
title: Fastlane Setup
---

# Fastlane Setup

Set up Fastlane in the mobile app directory. Creates `Gemfile`, `fastlane/Fastfile`, and runs `bundle install`.

**Command:** `kappmaker fastlane configure`

```bash
kappmaker fastlane configure
```

Run from the project root (containing `MobileApp/`) or inside `MobileApp/` directly.

## What it Creates

- `Gemfile` — Ruby gem dependencies (fastlane)
- `fastlane/Fastfile` — Build and upload lanes for Android (Play Store) and iOS (App Store)

If files already exist, they are skipped (not overwritten).

:::tip
This is a prerequisite for the [`publish`](/store-publishing/publish) command.
:::
