---
sidebar_position: 2
title: Configuration
---

# Configuration

Configuration is stored at `~/.config/kappmaker/config.json`.

## Managing Config

```bash
kappmaker config init                                    # Interactive setup
kappmaker config list                                    # Show all values
kappmaker config set <key> <value>                       # Set a value
kappmaker config get <key>                               # Get a value
kappmaker config path                                    # Show config file path
```

### App Store Defaults

```bash
kappmaker config appstore-defaults                       # View App Store defaults
kappmaker config appstore-defaults --init                # Set up API key + review contact
kappmaker config appstore-defaults --save ./config.json  # Save as global defaults
```

### Adapty Defaults

```bash
kappmaker config adapty-defaults                         # View Adapty defaults
kappmaker config adapty-defaults --save ./config.json    # Save as global defaults
```

## Config Keys

| Key | Description | Default |
|-----|-------------|---------|
| `templateRepo` | Template repository Git URL | KAppMaker template |
| `bundleIdPrefix` | Bundle/package ID prefix (e.g., `com.measify`) | `com.<appname>` |
| `androidSdkPath` | Android SDK location | `~/Library/Android/sdk` |
| `organization` | Organization for Fastlane signing | App name |
| `falApiKey` | fal.ai API key | — |
| `imgbbApiKey` | imgbb API key | — |
| `openaiApiKey` | OpenAI API key | — |
| `ascAuthName` | ASC keychain credential name | `KAppMaker` |
| `ascKeyId` | App Store Connect API Key ID | — |
| `ascIssuerId` | App Store Connect Issuer ID | — |
| `ascPrivateKeyPath` | Path to `.p8` private key | — |
| `appleId` | Apple ID email | — |
| `googleServiceAccountPath` | Google Play service account JSON | `~/credentials/google-service-app-publisher.json` |

## Global Defaults

| File | Used by | Manage with |
|------|---------|-------------|
| `~/.config/kappmaker/appstore-defaults.json` | `create-appstore-app` | `config appstore-defaults` |
| `~/.config/kappmaker/adapty-defaults.json` | `adapty setup` | `config adapty-defaults` |

Global defaults are merged as a base layer so shared settings (review contact, privacy, subscriptions, etc.) don't need to be re-entered per app.

## Config Resolution Order

For App Store Connect and Adapty, configuration is resolved by deep-merging layers (later overrides earlier):

1. **Built-in template** — sensible defaults (age rating, privacy, encryption, subscriptions)
2. **Global defaults** — shared settings across all your apps
3. **Local config** (e.g., `./Assets/appstore-config.json`) — per-project overrides
4. **Interactive prompts** — only for fields still empty

## Subscription Product ID Alignment

Subscription IDs are auto-generated so App Store Connect, Google Play, and Adapty all link automatically:

| Platform | Field | Format | Example ($6.99 weekly) |
|---|---|---|---|
| App Store Connect | `productId` | `{appname}.premium.{period}.v1.{price}.v1` | `myapp.premium.weekly.v1.699.v1` |
| Google Play | `productId` | `{appname}.premium.{period}.v1` | `myapp.premium.weekly.v1` |
| Google Play | `basePlanId` | `autorenew-{period}-{priceDigits}-v1` | `autorenew-weekly-699-v1` |
| Adapty | `ios_product_id` | matches ASC `productId` | `myapp.premium.weekly.v1.699.v1` |
| Adapty | `android_product_id` | matches Play `productId` | `myapp.premium.weekly.v1` |
| Adapty | `android_base_plan_id` | matches Play `basePlanId` | `autorenew-weekly-699-v1` |

`priceDigits` is the price with the decimal removed (e.g., `6.99` → `699`). `{period}` is one of `weekly`, `monthly`, `twomonths`, `quarterly`, `semiannual`, `yearly`.
