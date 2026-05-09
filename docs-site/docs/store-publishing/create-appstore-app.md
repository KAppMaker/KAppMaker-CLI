---
sidebar_position: 3
title: App Store Connect Setup
---

# App Store Connect Setup

Creates and fully configures an app on App Store Connect using the [asc CLI](https://github.com/rudrankriyam/App-Store-Connect-CLI).

**Command:** `kappmaker create-appstore-app`

```bash
kappmaker create-appstore-app
kappmaker create-appstore-app --config ./my-config.json
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--config <path>` | Path to JSON config file | `./Assets/appstore-config.json` |

## First-Time Setup

1. **Generate an API key** at [App Store Connect > Users and Access > Integrations > API](https://appstoreconnect.apple.com/access/integrations/api) — Admin access, download the `.p8` file immediately
2. **Run one-time setup:**
   ```bash
   kappmaker config appstore-defaults --init
   ```

## What it Does (13 Steps)

1. Validate asc CLI and authentication
2. Load config (from file or interactive prompts)
3. Register Bundle ID + enable capabilities (Sign in with Apple, In-App Purchases, Push Notifications)
4. Find or create app (fully automated via `asc web apps create`)
5. Set content rights
6. Create app version (1.0.0)
7. Set categories
8. Set age rating
9. Update localizations
10. Set pricing, availability, and subscriptions
11. Set privacy data usages
12. Set encryption declarations
13. Set review contact details

## Config Resolution

Layers are deep-merged (later overrides earlier):

1. **Built-in template** — age rating, privacy, encryption, subscriptions
2. **Global defaults** (`~/.config/kappmaker/appstore-defaults.json`) — review contact, copyright
3. **Local config** (`./Assets/appstore-config.json` or `--config`)
4. **Interactive prompts** — only for fields still empty

## Default Subscriptions

| Subscription | Period | Price | Product ID |
|-------------|--------|-------|------------|
| Weekly Premium | `ONE_WEEK` | $6.99 | `{appname}.premium.weekly.v1.699.v1` |
| Yearly Premium | `ONE_YEAR` | $29.99 | `{appname}.premium.yearly.v1.2999.v1` |

Auto-generated naming: group `{appname}.premium.v1`, ref name `{AppName} Premium Weekly v1 (6.99)`.

## Default In-App Purchases (Credit Packs)

The template also ships three CONSUMABLE in-app purchases — credit packs — that get created via the same `asc iap setup` one-shot workflow.

| Pack | Credits | Price | Product ID |
|------|---------|-------|------------|
| Basic Credit Pack | 10 | $4.99 | `credit_pack_10_499_{appname}` |
| Pro Credit Pack | 30 | $9.99 | `credit_pack_30_999_{appname}` |
| Ultimate Credit Pack | 80 | $19.99 | `credit_pack_80_1999_{appname}` |

**Format:** `credit_pack_{credits}_{priceDigits}_{appname}`. The same product ID is used on Google Play and Adapty so app code can reference one constant per platform pair.

**Auto-fill:** triggers on any `in_app_purchases[]` entry with a `credits` numeric field. Custom IAPs without a `credits` field are left untouched (the user's `product_id` wins). Reruns are idempotent — already-existing IAPs are skipped with an info log.

## Default Privacy

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
