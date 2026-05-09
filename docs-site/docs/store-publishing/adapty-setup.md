---
sidebar_position: 5
title: Subscription Management (Adapty)
---

# Subscription Management (Adapty)

Set up Adapty subscription products, paywalls, and placements using the [Adapty CLI](https://github.com/adaptyteam/adapty-cli).

**Command:** `kappmaker adapty setup`

```bash
kappmaker adapty setup
kappmaker adapty setup --config ./my-config.json
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--config <path>` | Path to JSON config file | `./Assets/adapty-config.json` |

## Prerequisites

Install and log in:

```bash
npm install -g adapty
adapty auth login
```

## What it Does (8 Steps)

1. Validate CLI and authentication
2. Load config (from file or interactive prompts)
3. Find or create app (iOS + Android)
4. Create "Premium" access level
5. Create products
6. Create paywalls (linking products)
7. Create placements (linking paywalls)

## Default Access Levels

| sdk_id | Title | Used by |
|---|---|---|
| `Premium` | Premium | Subscriptions (Weekly + Yearly Premium) |
| `credit_pack_access` | Credit Pack Access | All 3 default credit pack products |

Subscriptions and consumable credit packs are routed to **separate access levels** so buying a credit pack does not unlock recurring premium features and vice versa. Each entry in `products[]` has an `access_level_sdk_id` linking it to one of the entries above; the orchestrator creates each access level once and routes products to the right one.

Configs from earlier KAppMaker versions (which used a single `access_level` field) are auto-migrated to the new `access_levels` array on the next setup run.

## Default Products

| Product | Period | Price | Access Level | iOS Product ID | Android Product ID | Android Base Plan ID |
|---------|--------|-------|--------------|----------------|--------------------|-----------------------|
| Weekly Premium | `weekly` | $6.99 | `Premium` | `{appname}.premium.weekly.v1.699.v1` | `{appname}.premium.weekly.v1` | `autorenew-weekly-699-v1` |
| Yearly Premium | `annual` | $29.99 | `Premium` | `{appname}.premium.yearly.v1.2999.v1` | `{appname}.premium.yearly.v1` | `autorenew-yearly-2999-v1` |
| Basic Credit Pack | `consumable` | $4.99 | `credit_pack_access` | `credit_pack_10_499_{appname}` | `credit_pack_10_499_{appname}` | _(none — IAP)_ |
| Pro Credit Pack | `consumable` | $9.99 | `credit_pack_access` | `credit_pack_30_999_{appname}` | `credit_pack_30_999_{appname}` | _(none — IAP)_ |
| Ultimate Credit Pack | `consumable` | $19.99 | `credit_pack_access` | `credit_pack_80_1999_{appname}` | `credit_pack_80_1999_{appname}` | _(none — IAP)_ |

iOS product IDs match the App Store Connect format, and Android IDs match what `kappmaker gpc setup` writes to Google Play Console — so all three systems link automatically.

**Subscription** entries use the `{appname}.premium.{period}.v1.x.v1` family. **Credit pack** entries (any product with a numeric `credits` field) use the consumable-IAP format `credit_pack_{credits}_{priceDigits}_{appname}` on both iOS and Android, with `period: consumable` and an empty `android_base_plan_id`.

:::note Why `consumable` works despite the Adapty CLI rejecting it
Adapty CLI v0.1.5 hardcodes a period whitelist that excludes `consumable`, but the underlying REST API does accept it. KAppMaker creates credit pack products via a direct API call to `https://api-admin.adapty.io/api/v1/developer/apps/{appId}/products/` using the auth token already cached at `~/.config/adapty/config.json` (or `ADAPTY_TOKEN` env var). Subscriptions and lifetime products still go through the CLI as before. When a future Adapty CLI release adds `consumable` to its whitelist, the API workaround becomes a no-op transparently — no user action needed.
:::

:::warning Prices are not developer-set in Adapty
The `price` field in `Assets/adapty-config.json` is used by KAppMaker to generate product IDs (e.g. `699` digits in `myapp.premium.weekly.v1.699.v1`) and to mirror prices into App Store Connect and Google Play Console — Adapty itself **does not accept developer-set prices** via its API. This is by design: the Adapty `OPTIONS /products/` metadata says `"Strips response to plan-specified fields (id, title, vendor_products)"`, and probing with seven different price-field shapes (`price`, `currency_code`, `localized_price`, `price_string`, `display_price`, nested `vendor_products.app_store.price`, `prices[]`) confirms they're all silently dropped.

**Prices appear in the Adapty dashboard only after you connect store integrations there** (one-time, dashboard-only step — not exposed by the Adapty CLI):

- **App Store Connect** — paste the same `.p8` / Key ID / Issuer ID you already configured for `kappmaker create-appstore-app`.
- **Google Play** — upload the same service-account JSON used by `kappmaker gpc setup`.

Connect both at the Adapty dashboard → **Settings → Integrations**. Once connected, Adapty pulls live product details (title, period, **price**, currency) from each store and displays them.

The mobile Adapty SDK fetches prices directly from the native store APIs at runtime, so the in-app paywall always shows the right prices — only the dashboard view is affected before integrations are connected.

`kappmaker adapty setup` prints a reminder of these steps at the end of every run.
:::

## Default Paywalls and Placements

| Paywall | Products | Placement | Developer ID |
|---------|----------|-----------|-------------|
| Default Paywall | Weekly + Yearly | Default | `default` |
| Onboarding Paywall | Weekly + Yearly | Onboarding | `onboarding` |
| Credits Paywall | Basic + Pro + Ultimate Credit Pack | Credits | `credits_pack` |

App code fetches credit packs with `Adapty.getPaywall("credits_pack")`.
