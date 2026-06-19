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

:::tip Adding ONE more subscription without re-running the full flow

After the initial `create-appstore-app` is done, you can add a single new subscription with `kappmaker subscription add --period weekly --price 9.99 --platform ios` (no config edit needed). See [Quick-add Subscription / IAP](./quick-add.md).

:::

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

## App Review screenshots (1.7.1+)

Apple requires a **review screenshot** on every subscription and IAP — without one, the product remains in `MISSING_METADATA` state and per-territory pricing won't show as "resolved" in `asc subscriptions pricing prices list --resolved`. KAppMaker uploads them automatically via `asc subscriptions review screenshots create` (subs) and `asc iap images create` (IAPs).

**Global default + per-product override**:

```json
{
  "review_screenshot": "Assets/appstore/review-screenshot.png",
  "subscriptions": {
    "groups": [{
      "subscriptions": [{
        "ref_name": "Premium Weekly",
        "review_screenshot": "Assets/appstore/weekly-review.png"
      }]
    }]
  },
  "in_app_purchases": [{
    "product_id": "credit_pack_10_499_myapp",
    "review_screenshot": "Assets/appstore/iap-review.png"
  }]
}
```

The top-level `review_screenshot` applies to every subscription and IAP that doesn't override it. Use PNG or JPG. Paths are resolved relative to the project root.

**Idempotent**: KAppMaker checks `asc subscriptions review app-store-screenshot view` (subs) or `asc iap images list` (IAPs) before uploading — if a screenshot/image is already attached, the upload is skipped. To replace, delete it via App Store Connect's UI first, then re-run.

**Silent skip on missing file**: if the resolved path doesn't exist, KAppMaker logs an info message (`Review screenshot for "X" not found at ... — skipping upload.`) and moves on. The product stays in `MISSING_METADATA` until you add a file at that path and re-run.

### Required image size

| Setting | Value |
|---|---|
| **Recommended** | **1290 × 2796 px** (iPhone 6.7" Display, portrait — same as App Store listing screenshots) |
| Minimum | 640 × 920 px |
| Format | PNG or JPG |
| Aspect ratio | Portrait, ~9 : 19.5 |

If your screenshot doesn't match 1290 × 2796, KAppMaker prompts to resize:

```
WARN Review screenshot wrong-size.png is 1920×1080.
-- Apple's App Store recommended size for review screenshots: 1290×2796 (iPhone 6.7" Display, portrait).
  Resize to 1290×2796 keeping aspect ratio? (Y/n)
```

- **Y** (default) — sharp resizes with `fit: 'inside'` (preserves aspect ratio, may end up smaller on one dimension; e.g. 1920×1080 → 1290×726). Writes to a temp file, uploads the resized copy.
- **N** — uploads as-is.

Files that are already 1290 × 2796 skip the prompt entirely.

### Standalone replace commands

Two top-level `appstore-` prefixed commands replace existing screenshots without running the full setup flow:

```bash
# Replace the review screenshot on EVERY subscription in the config
kappmaker appstore-update-subscription-review-screenshot --file ./Assets/appstore/new-review.png

# Replace the review image on EVERY IAP
kappmaker appstore-update-iap-review-screenshot --file ./Assets/appstore/iap-review.png

# Without --file, use the per-product `review_screenshot` from the config
kappmaker appstore-update-subscription-review-screenshot
kappmaker appstore-update-iap-review-screenshot

# Target a single product
kappmaker appstore-update-iap-review-screenshot \
    --file ./Assets/appstore/credit-pack-30.png \
    --product-id credit_pack_30_999_myapp
```

| Flag | Description |
|---|---|
| `--file <path>` | Single screenshot applied to all matched products. Overrides per-product `review_screenshot` from the config. |
| `--config <path>` | Override default `./Assets/appstore-config.json`. |
| `--product-id <id>` | Target ONE product (matches by `product_id` or `ref_name`). |

Both commands trigger the same auto-resize prompt as the setup flow.

:::info Force-replace semantics
These commands delete the existing screenshot and create a new one. Empirically `asc subscriptions review screenshots update` only marks an out-of-band upload as complete (it doesn't take `--file`), and `asc iap images update --file` returns success but leaves the previous binary in place. Delete + create is the reliable swap.
:::

:::warning $0 / FREE-tier bug (1.6.x)
Versions 1.6.x had a bug where products silently landed at $0 in territories whose price-points are denominated in non-USD (JPN, IDR, INR, KRW, CHL, COL, HUN, NGA, PAK, PHL, RUS, THA, TZA, VNM, etc.). The old code compared the USD PPP target numerically against local-currency `customerPrice` values, picking the FREE tier as "closest" (e.g. for JPN: |¥0 − 3.99| = 3.99 < |¥50 − 3.99| = 46). 1.7.0's tier-based resolution avoids this entirely. **If your app is on 1.6.x and shows $0 prices on App Store Connect, upgrade and re-run `create-appstore-app`** — re-runs now refresh pricing.
:::

**Local-tier override for non-proportional markets (1.13.8+)**: Apple's tier structure is non-linear in some markets. In Turkey (TRY), for example, tier 14 ≈ 3× tier 1 locally — not 14×. Synthesising a USA tier number for these territories causes a double-PPP-discount (e.g. $29.99 → tier 88 → TRY 99.99 ≈ $2.15 instead of the intended ~$13.49). KAppMaker 1.13.8+ fetches the local price-point catalog for `LOCAL_PRICE_TERRITORIES = {TUR, EGY, NGA, JPN, KOR, IDN, BRA}`, computes `target_local = tier1_local × usaTierNumber`, and picks the closest price-point in local currency. Results are cached by `(territory, usaTierNumber)` so weekly + yearly subscriptions with the same USD target pay only one catalog fetch per territory per run.

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

## appstore-monetization-push

Re-run only the subscription + IAP push steps from `create-appstore-app` — useful for refreshing PPP pricing, adding a new product from the config, or fixing `MISSING_METADATA` state without repeating the full 13-step flow.

```bash
# Push everything (subscriptions + IAPs)
kappmaker appstore-monetization-push

# Subscriptions only
kappmaker appstore-monetization-push --subscriptions-only

# IAPs only
kappmaker appstore-monetization-push --iap-only

# Custom config path
kappmaker appstore-monetization-push --config ./path/to/appstore-config.json
```

Reads `Assets/appstore-config.json` (or `--config`). Resolves the app by `app.id` or looks up `app.bundle_id` via `asc`. Calls the same `setupSubscriptions` / `setupInAppPurchases` functions as `create-appstore-app` — fully idempotent: existing products log `"existing — refreshing pricing"` and re-apply the full PPP fan-out.

| Flag | Description | Default |
|---|---|---|
| `--config <path>` | Path to JSON config file | `./Assets/appstore-config.json` |
| `--subscriptions-only` | Push subscription groups only, skip IAPs | — |
| `--iap-only` | Push IAPs only, skip subscription groups | — |

:::tip When to use this vs `create-appstore-app`
Use `appstore-monetization-push` when you've already run the full setup and just want to sync pricing (e.g. after upgrading KAppMaker for a PPP fix, or after adding a new subscription/IAP to the config). Use `create-appstore-app` for initial setup or when you also need to update metadata, privacy, or review contact.
:::

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
