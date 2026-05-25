---
sidebar_position: 6
title: Quick-add Subscription / IAP
---

# Quick-add Subscription / IAP

Single-command shortcuts to add ONE new subscription or credit-pack consumable IAP to Google Play + App Store Connect (and Adapty, for IAPs) — without editing the JSON config files. Auto-generates aligned product IDs across stores, fans out PPP-adjusted pricing across ~175 Play regions and ~155 ASC territories, and auto-creates the App Store Connect subscription group if it doesn't exist yet.

**Commands:**
- `kappmaker subscription add` — Play + App Store Connect (Adapty intentionally excluded)
- `kappmaker iap add` — Play + App Store Connect + Adapty (Adapty included to gate `credit_pack_access` consumable entitlements)

These are intended for iterating on a live app after the initial `create-appstore-app` / `gpc setup` flow. They're idempotent and re-runnable — existing products are PATCHed with refreshed pricing rather than duplicated.

## `kappmaker subscription add`

### Examples

```bash
# Minimum invocation — defaults to --platform all (Play + ASC)
kappmaker subscription add --period weekly --price 9.99

# v2 product line alongside an existing v1
kappmaker subscription add --period weekly --price 9.99 --product-version 2

# Single store
kappmaker subscription add --period monthly --price 19.99 --platform android
kappmaker subscription add --period yearly --price 29.99 --platform ios

# Full control
kappmaker subscription add \
  --period weekly --price 6.99 --product-version 2 \
  --name "Weekly Premium" \
  --description "Full access for one week." \
  --review-screenshot "Assets/appstore/review-screenshot_subscription.jpg" \
  --group "myapp.premium.v2" --group-name "Premium Access" \
  --app-name "MyApp"
```

### Flags

| Flag | Required | Default |
|---|---|---|
| `--period <slug>` | yes | — — `weekly` / `monthly` / `twomonths` / `quarterly` / `semiannual` / `yearly` |
| `--price <number>` | yes | — — USD anchor; PPP fans the rest |
| `--platform <target>` | no | `all` (Play + ASC) — `ios` = ASC only, `android` = Play only |
| `--product-version <n>` | no | `1` — bumps every `v` marker (e.g. `--product-version 2` → `myapp.premium.weekly.v2.999.v2` + `myapp.premium.weekly.v2` + `autorenew-weekly-999-v2`) |
| `--name <text>` | no | `"<AppName> Premium <Period>"` |
| `--description <text>` | no | period-derived sentence: weekly → `"Full access for one week."`, monthly → `"Full access for one month."`, etc. |
| `--review-screenshot <path>` | no | top-level `review_screenshot` from `Assets/appstore-config.json` |
| `--group <ref>` | no | first group in `Assets/appstore-config.json` — if the ref doesn't exist on ASC, it's auto-created |
| `--group-name <text>` | no | inherits from matching config group's `localizations[0].name`, else `"Premium Access"` — used only when auto-creating a new group |
| `--app-name <name>` | no | read from existing configs |
| `--bundle-id <id>` | no | iOS bundle ID override (e.g. `com.example.myapp`) — use when `Assets/appstore-config.json` doesn't exist yet |
| `--package-name <pkg>` | no | Android package name override — use when `Assets/googleplay-config.json` doesn't exist yet |

### What it creates

For `kappmaker subscription add --period weekly --price 9.99` (defaults):

**App Store Connect:**
- Product ID: `myapp.premium.weekly.v1.999.v1`
- Reference name: `MyApp Premium Weekly v1 (9.99)`
- Subscription period: `ONE_WEEK`
- Family sharable: `false`
- en-US localization: name = `MyApp Premium Weekly`, description = `Full access for one week.`
- Pricing: $9.99 USD anchor + PPP-adjusted prices across ~155 territories (one `prices import` CSV call)
- Review screenshot: uploaded from top-level `review_screenshot` (resized to 1290 × 2796 if needed)
- Subscription group: first group from config (or `--group <ref>`) — auto-created with en-US name if new

**Google Play:**
- Product ID: `myapp.premium.weekly.v1`
- Base plan: `autorenew-weekly-999-v1`, billing period `P1W`
- en-US listing: title = `MyApp Premium Weekly`, description = `Full access for one week.`
- Pricing: $9.99 USD anchor + PPP across ~173 billable regions (via `convertRegionPrices`)

### Why no Adapty?

Adapty mirrors store prices at runtime via its store integrations (per the "Adapty Prices Are Not Developer-Set" rule). Creating an extra Adapty product entry every time you add a subscription adds noise without unlocking anything the SDK can't already fetch live from the stores. The canonical Adapty product set stays managed via [`adapty setup`](./adapty-setup.md).

### Auto-creating App Store Connect subscription groups

When you pass `--group <ref>` and that group doesn't yet exist on App Store Connect, KAppMaker calls `asc subscriptions setup --group-reference-name <ref>` which auto-creates the group, then attaches an en-US localization so the group has a proper App-Store-facing display name (Apple requires one). Resolution order for the localized name:

1. `--group-name <text>` flag
2. Existing group's `localizations[0].name` in `Assets/appstore-config.json` (if the ref matches a configured group)
3. Fallback: `"Premium Access"`

For pre-existing groups, the duplicate-create localization call gracefully fails (silently swallowed by `allowFailure: true`) so the existing group name is never overwritten.

### Idempotency

Safe to re-run. Both stores go through the same idempotent setup paths as [`gpc subscriptions push`](./google-play-console.md) and [`create-appstore-app`](./create-appstore-app.md):

- **Play**: existing products are PATCHed (`PATCH /subscriptions/{id}?updateMask=basePlans,listings`) with the freshly-built body, including the full PPP regional fan-out. Net effect of re-running: regional pricing gets refreshed.
- **ASC**: `asc subscriptions setup` reports `"already been used"` on existing products → KAppMaker logs `existing — refreshing pricing` and runs the PPP fan-out (CSV import of per-territory price points).

To stand up a fresh product family alongside an existing v1, use `--product-version 2` (or higher). The new IDs are entirely separate, no collision.

### Notes & limitations

- **No `--free-trial`** — intro offers / free trials aren't wired through this command yet. For those, edit `Assets/{googleplay,appstore}-config.json` directly and run `gpc subscriptions push` / `create-appstore-app`.
- **Single locale (en-US)** — for multi-locale, edit the configs.
- **Single regional anchor (US / USD)** — other regions come from PPP fan-out automatically.
- **Auto-aligned IDs follow the table in [Configuration](../configuration.md#subscription-product-id-alignment)**.

## `kappmaker iap add`

Quick-add a single credit-pack consumable IAP. Unlike `subscription add`, this DOES push to Adapty because credit packs use the `credit_pack_access` access level to gate consumable entitlements that have no store-side equivalent.

### Examples

```bash
# Minimum invocation — Play + ASC + Adapty
kappmaker iap add --credits 50 --price 14.99

# v2 product line (appends "_v2" to the ID)
kappmaker iap add --credits 50 --price 14.99 --product-version 2

# Single store
kappmaker iap add --credits 100 --price 24.99 --platform ios

# Full control — recreate Forevly's three default credit packs
kappmaker iap add --credits 10 --price 4.99 --product-version 2 \
  --name "Basic Credit Pack" \
  --review-screenshot "Assets/appstore/review-screenshot_credits.jpg"

kappmaker iap add --credits 30 --price 9.99 --product-version 2 \
  --name "Pro Credit Pack" \
  --review-screenshot "Assets/appstore/review-screenshot_credits.jpg"

kappmaker iap add --credits 80 --price 19.99 --product-version 2 \
  --name "Ultimate Credit Pack" \
  --review-screenshot "Assets/appstore/review-screenshot_credits.jpg"
```

### Flags

| Flag | Required | Default |
|---|---|---|
| `--credits <number>` | yes | — |
| `--price <number>` | yes | — — USD anchor; PPP fans the rest |
| `--platform <target>` | no | `all` (Play + ASC + Adapty) — `ios` = ASC only, `android` = Play only |
| `--product-version <n>` | no | `1` — v1 stays unsuffixed; v2+ appends `_v{n}` to the credit-pack ID |
| `--name <text>` | no | `"<Credits> Credit Pack"` |
| `--description <text>` | no | `"<Credits> credits to use in the app."` |
| `--review-screenshot <path>` | no | top-level `review_screenshot` from `Assets/appstore-config.json` |
| `--app-name <name>` | no | read from existing configs |
| `--bundle-id <id>` | no | iOS bundle ID override — use when no `Assets/appstore-config.json` yet |
| `--package-name <pkg>` | no | Android package name override — use when no `Assets/googleplay-config.json` yet |

### What it creates

For `kappmaker iap add --credits 10 --price 4.99 --name "Basic Credit Pack"`:

**App Store Connect:**
- Product ID: `credit_pack_10_499_myapp` (v2+ → `credit_pack_10_499_myapp_v2`)
- Type: `CONSUMABLE`
- Reference name: `MyApp Basic Credit Pack v1 (4.99)`
- en-US localization: name = `Basic Credit Pack`, description = `10 credits to use in the app.`
- Pricing: $4.99 USD + PPP across ~155 territories
- Review screenshot: uploaded from `--review-screenshot` or top-level default

**Google Play:**
- SKU: `credit_pack_10_499_myapp`
- Purchase type: `managed`
- en-US listing: title = `Basic Credit Pack`, description = `10 credits to use in the app.`
- Pricing: $4.99 USD + PPP across ~173 regions

**Adapty:**
- Title: `MyApp Basic Credit Pack v1 (4.99)`
- Period: `consumable` (routed via Adapty REST API; the CLI rejects this period value)
- iOS / Android product ID: `credit_pack_10_499_myapp` (same on both)
- Access level: `credit_pack_access` (falls back to first available level if missing)

### Idempotency

- **Play**: `PATCH /onetimeproducts/{id}?allowMissing=true` (upsert) + activate purchase option (reuses existing `purchaseOptionId` for legacy `"buy"` products).
- **ASC**: existing IAPs log `"already been used"` and refresh pricing.
- **Adapty**: pre-lists products by title and skips if already present.

## Source

- [src/commands/subscription-add.ts](https://github.com/KAppMaker/KAppMaker-CLI/blob/main/src/commands/subscription-add.ts)
- [src/commands/iap-add.ts](https://github.com/KAppMaker/KAppMaker-CLI/blob/main/src/commands/iap-add.ts)
- [src/services/product-id.builder.ts](https://github.com/KAppMaker/KAppMaker-CLI/blob/main/src/services/product-id.builder.ts) — shared ID + period mapping
