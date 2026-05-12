---
sidebar_position: 3
title: App Store Connect Setup
---

# App Store Connect Setup

Creates and fully configures an app on App Store Connect using the [asc CLI](https://github.com/rorkai/App-Store-Connect-CLI).

:::warning Requires asc CLI ≥ 1.4.0
KAppMaker 1.7.0+ uses `asc subscriptions pricing prices import` (added in asc 1.4.0) to bulk-apply per-territory PPP prices in a single API call. Upgrade via `brew upgrade asc` and verify with `asc --version`.

The asc CLI repo moved from `rudrankriyam/App-Store-Connect-CLI` → `rorkai/App-Store-Connect-CLI` in 2026. The brew formula installs the latest stable from the new repo automatically.
:::

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

## Per-territory PPP pricing (1.7.0+ — bulk CSV import)

Subscriptions and IAPs are fanned out to **every ASC territory** (~175) with purchasing-power-parity-adjusted prices in a **single API call per product**. The multiplier table is Steam/Spotify-inspired ([iosdevmax/ppp-pricing](https://github.com/iosdevmax/ppp-pricing), MIT) and covers tiers 0.30 → 1.10.

**Subscriptions** (1.7.0+): `asc subscriptions pricing prices import --input <csv>`. KAppMaker writes a temp CSV with `territory,price,price_point_id` rows for all ~175 territories and pipes it in. One API call per subscription. Replaces the 155-call loop from 1.6.x which hit Apple's rate limits.

**IAPs**: a single `asc iap pricing schedules create --prices "PP_ID:DATE,…"` call covering all territories at once.

**Tier resolution**: Apple's price-point catalog uses globally-stable tier numbers (1..800 — tier N has the same USD-equivalent in every territory). KAppMaker resolves each unique PPP USD target → tier ONCE via USA's catalog (where customerPrice is in USD), then synthesises the per-territory price-point ID locally using Apple's base64 `{s, t, p}` format. Saves ~175 per-territory catalog fetches.

**Distinct catalogs**: subscriptions use `subscriptionPricePoints` (`s` = subscription-internal ID, different per sub); IAPs use `appPricePoints` (`s` = app ID). Mixing IDs across catalogs triggers `400 The provided entity is invalid`.

**Idempotent re-runs (1.7.0+)**: when `asc subscriptions setup` or `asc iap setup` reports "already been used", KAppMaker now refreshes pricing instead of skipping — so re-runs actually update territory prices on existing products. The asc CLI's `--subscription-id` / `--iap-id` flags accept the product_id directly, so no internal-ID lookup is needed.

:::warning $0 / FREE-tier bug (1.6.x)
Versions 1.6.x had a bug where products silently landed at $0 in territories whose price-points are denominated in non-USD (JPN, IDR, INR, KRW, CHL, COL, HUN, NGA, PAK, PHL, RUS, THA, TZA, VNM, etc.). The old code compared the USD PPP target numerically against local-currency `customerPrice` values, picking the FREE tier as "closest" (e.g. for JPN: |¥0 − 3.99| = 3.99 < |¥50 − 3.99| = 46). 1.7.0's tier-based resolution avoids this entirely. **If your app is on 1.6.x and shows $0 prices on App Store Connect, upgrade and re-run `create-appstore-app`** — re-runs now refresh pricing.
:::

**Override rule**: any territory you list in `prices` is preserved as-is. PPP fills the rest.

**Opt-out**: set `"ppp_enabled": false` on a subscription or IAP to skip the fan-out and stay with only your explicitly-listed `prices`.

```json
{
  "type": "CONSUMABLE",
  "ref_name": "MyApp Basic Credit Pack v1 (4.99)",
  "product_id": "credit_pack_10_499_myapp",
  "ppp_enabled": true,
  "prices": [
    { "territory": "USA", "price": "4.99" }
  ],
  "localizations": [{ "locale": "en-US", "name": "Basic Credit Pack", "description": "10 credits to use in the app." }]
}
```

The `--territory` flag accepts alpha-2, alpha-3 ISO codes, or English country names; KAppMaker uses alpha-3.

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
