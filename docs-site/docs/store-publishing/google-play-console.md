---
sidebar_position: 4
title: Google Play Console Setup
---

# Google Play Console Setup

A tight wrapper around the official Google Play Android Publisher API. All subcommands authenticate via the service account JSON at `googleServiceAccountPath`. **No external CLI and no extra npm dependencies** — the JWT flow and HTTPS calls are implemented with Node's built-in `crypto` and `fetch`.

:::note
Google Play does not allow creating new apps via any public API. Create the app manually once in [Play Console](https://play.google.com/console/u/0/developers), then use these commands to configure it.
:::

## gpc setup

Full end-to-end configuration (11 steps) — the Google Play parallel to `create-appstore-app`.

```bash
kappmaker gpc setup
kappmaker gpc setup --config ./my-config.json
```

**Alias:** `kappmaker create-play-app`

### What it Does (11 Steps)

1. Validate service account + obtain access token
2. Load config (`./Assets/googleplay-config.json` or interactive prompts). Auto-detects Play's actual default language and migrates legacy product IDs
3. Review summary and confirm
4. Verify app exists on Play Console (fails fast with a deep link if not)
5. Start a Play Console edit (skipped if default-language listing has no title)
6. Update app details (default language + contact website/email/phone)
7. Update store listings per locale (title, short/full description, video); commits the edit. Empty listing titles are auto-filled from the app name
8. Create subscriptions via the new monetization API. Base plans are available to all ~175 Play regions (not just the regions with explicit prices — Google auto-converts pricing for the rest). Idempotent — existing product IDs are skipped. Skipped if no build is uploaded to any track
9. Create one-time in-app products via the new monetization API. Idempotent
10. Update the data safety declaration (JSON → CSV conversion using bundled canonical template)
11. Print a checklist of manual-only Play Console declarations that have no REST endpoints

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--config <path>` | Path to JSON config file | `./Assets/googleplay-config.json` |

---

## gpc listings push

Push just the store listings section from the config file. Useful after editing copy.

```bash
kappmaker gpc listings push
kappmaker gpc listings push --config ./my-config.json
```

Runs a single edit transaction: updates app details → updates every listing locale → commits.

---

## gpc subscriptions list

Read-only — lists existing subscription product IDs on Play Console.

```bash
kappmaker gpc subscriptions list --package com.example.myapp
kappmaker gpc subscriptions list   # uses app.package_name from the config file
```

## gpc subscriptions push

Create or reuse subscriptions from the config file. Idempotent — already-existing product IDs are skipped.

```bash
kappmaker gpc subscriptions push
```

:::tip Adding ONE more subscription without editing the config

`kappmaker subscription add --period weekly --price 9.99 --platform android` pushes a single new subscription with auto-aligned IDs across both stores. See [Quick-add Subscription / IAP](./quick-add.md).

:::

Uses the new monetization API. Auto-generated IDs:

| Field | Format | Example ($6.99 weekly) |
|---|---|---|
| `productId` | `{appname}.premium.{period}.v1` | `myapp.premium.weekly.v1` |
| `basePlanId` | `autorenew-{period}-{priceDigits}-v1` | `autorenew-weekly-699-v1` |
| Subscription title | `{AppName} Premium {PeriodLabel}` | `MyApp Premium Weekly` |

---

## gpc iap list

Read-only — lists existing one-time in-app product SKUs on Play Console.

```bash
kappmaker gpc iap list --package com.example.myapp
kappmaker gpc iap list
```

## gpc iap push

Create or reuse one-time in-app products from the config file. Idempotent — existing products are PATCHed with fresh PPP regional pricing.

```bash
kappmaker gpc iap push
kappmaker gpc iap push --recreate-stuck   # DELETE + recreate "stuck" products (see below)
```

Uses the new monetization API (`PATCH /onetimeproducts/{id}?allowMissing=true`), replacing the legacy `/inappproducts` endpoint.

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--config <path>` | Path to JSON config file | `./Assets/googleplay-config.json` |
| `--recreate-stuck` | DELETE products whose stored regions can't coexist with `regionsVersion=2022/02` (e.g. legacy products with MN stored), then recreate fresh. WARNING: Google soft-deletes for a few minutes to a few hours; CREATE during that window returns `"Product ID already in use"`. Prefer bumping `product_id` in config (e.g. `v1` → `v2`) for zero downtime. | _off_ |

### Per-region PPP pricing (1.6.0+)

Subscriptions and one-time products are fanned out to **every Play-supported region** (~175) with purchasing-power-parity-adjusted USD prices — not just the region you list explicitly. The multiplier table is Steam/Spotify-inspired ([iosdevmax/ppp-pricing](https://github.com/iosdevmax/ppp-pricing), MIT, bundled at `src/data/ppp-tiers.upstream.json`):

| Tier | Multiplier | Sample regions |
|---|---|---|
| Very low | 0.30 | AR, EG, PK, BD, NG, KE |
| Low | 0.35 | IN, VN, PH, ID, UA, KZ |
| Lower-mid | 0.45 | BR, TR, TH, MY, CO, RO, BG |
| Mid | 0.60 | MX, ZA, CL, PL, HU, GR, PT, CZ |
| Upper-mid | 0.80 | KR, JP, TW, ES, IT, IL, SA, AE |
| Base | 1.00 | US, CA, GB, AU, NZ, FR, DE, NL, SG |
| High | 1.10 | CH, NO, DK, SE, FI, IS, LU |

Prices are rounded to .99 endings. Regions outside the table fall back via a closest-neighbour lookup (e.g. `PR → US`, `XK → AL`); anything still missing uses `0.60` (mid tier).

**Each region's price is in that region's native currency** (AE → AED, JP → JPY, IN → INR, etc.) — Google Play rejects mismatched currencies (HTTP 400 _"Invalid currency for region code AE: expected AED but got USD"_).

The CLI calls Google's `pricing:convertRegionPrices` endpoint with your USD base price once per (package, base price) tuple. That single call:
1. Returns the authoritative billable region list (sanctioned countries like AF / IR / KP / SY are excluded — they don't appear in the response).
2. Returns fair FX-converted prices in each region's native currency.

Then KAppMaker multiplies each native price by the region's PPP multiplier and charm-rounds:
- **Decimal currencies** (USD, EUR, GBP, INR, BRL, etc.) — Spotify-style: floor to whole + `.99`. So `INR 415 × 0.35 ≈ 145.25 → INR 144.99` floor-and-99 logic.
- **Zero-decimal currencies** (JPY, KRW, CLP, ISK, VND, etc.) — round to the nearest `X99` / `X9` / integer. So `JPY 750 × 0.80 = 600 → JPY 599`.

Typical apps with 5 distinct base prices (weekly sub + yearly sub + 3 credit packs) make ~5 `convertRegionPrices` calls per setup run.

### regionsVersion 2022/02 drift override (1.6.11+)

Google's monetization API requires `regionsVersion.version` and `"2022/02"` is the only documented value as of 2026. Several regions have drifted since that snapshot — Google's live API returns one currency but `2022/02` expects another. The CLI handles this transparently:

| Region | Live API | 2022/02 expects | Resolution |
|---|---|---|---|
| BG (Bulgaria) | EUR | BGN | Convert EUR → BGN via the 1 EUR = 1.95583 BGN peg |
| HR (Croatia) | EUR | EUR ✓ | No override (Google updated 2022/02 retroactively in 2023) |
| CI (Côte d'Ivoire) | XOF | USD | Replace with USD anchor; PPP multiplier still applied |
| CM (Cameroon) | XAF | USD | Same |
| SN (Senegal) | XOF | USD | Same |
| MN (Mongolia) | billable | NOT BILLABLE | Drop entirely (no currency works at 2022/02) |

Net effect: typical products land with all ~173 billable regions AVAILABLE (only MN drops out). Google's storage layer auto-converts each region's submitted currency to the user-facing display currency at runtime — e.g. we send `BG: BGN`, Google shows EUR to Bulgarian users; we send `CI: USD`, Google shows XOF to Ivorian users.

### "New countries and regions" set to AVAILABLE (1.6.11+)

Both subscriptions (`otherRegionsConfig`) and one-time products (`newRegionsConfig`) are now always set to `availability: AVAILABLE` with USD + EUR anchors when a USD anchor is present in your config. In Play Console this surfaces as **"New countries and regions: Available"** — any region Google adds to its billable catalog in the future automatically gets pricing derived from those anchors, no maintenance needed.

### Stuck legacy products (`NEVER_BILLABLE` regions)

If Google's old catalog stored a `NEVER_BILLABLE` region (currently just MN) on an existing product, that PATCH can't be completed at `regionsVersion=2022/02` — Google won't accept MN's currency but also refuses to drop the region. The CLI detects this deadlock, marks the product as "stuck" in its final summary, and offers three fix paths in order of safety:

1. **Recommended** — bump the `product_id` in your config (e.g. `credit_pack_10_499_myapp` → `credit_pack_10_499_myapp_v2`). Fresh product, full PPP fan-out, zero downtime.
2. `kappmaker gpc iap push --recreate-stuck` — DELETEs the stuck product(s) and recreates them fresh. **WARNING**: Google soft-deletes for a few minutes to a few hours after deletion. CREATE during that window returns `"Product ID already in use"`. Plan downtime if your app code references these IDs in production.
3. Manually delete on Play Console UI, wait for the reservation window to clear, then re-run.

### Simpler alternative: `ppp_enabled: false`

If you don't want PPP discounting and would prefer a uniform USD-anchor price across all regions (Google handles the FX conversion at display time), set `"ppp_enabled": false` on the base plan or one-time product:

```json
{
  "base_plan_id": "autorenew-yearly-2999-v1",
  "billing_period": "P1Y",
  "ppp_enabled": false,
  "regional_configs": [
    { "region_code": "US", "price": "29.99", "currency_code": "USD" }
  ]
}
```

The CLI then submits only your US entry in `regionalConfigs` plus `otherRegionsConfig: { usdPrice, eurPrice, newSubscriberAvailability }` (for subscriptions) or `newRegionsConfig: { availability, usdPrice, eurPrice }` (for one-time products). Google fans out the USD anchor to every billable region using its pricing-template FX algorithm — every region gets a price, just without PPP discounts in lower-income markets. Payload is ~1 entry instead of ~150.

The trade-off: simpler config but you lose the IN ≈ 0.35×, AR ≈ 0.30× discounting that increases conversion in those markets.

**Override rule**: any region you list explicitly in `regional_configs` (subscription) or `prices` (IAP) wins. PPP fills only the regions you didn't list:

```json
{
  "sku": "credit_pack_10_499_myapp",
  "default_price": { "region_code": "US", "price": "4.99", "currency_code": "USD" },
  "prices": [
    { "region_code": "DE", "price": "5.49", "currency_code": "EUR" }
  ]
}
```

US gets your `default_price`, DE keeps your explicit `5.49 EUR`, the other ~173 regions get PPP-adjusted USD prices derived from the US anchor.

**Opt-out**: set `"ppp_enabled": false` on a subscription base plan or IAP to skip the fan-out and stay restricted to your listed regions.

**Why explicit fan-out**: Google's `otherRegionsConfig` / `newRegionsConfig` auto-conversion (used in 1.5.x) fanned out unreliably — many users saw products listed in only 1-2 regions even with valid USD/EUR anchors. Per-region fan-out is now the default and works.

### Default credit packs

The `Assets/googleplay-config.json` template ships with three default consumable IAPs (credit packs) that match the App Store Connect and Adapty templates:

| Pack | Credits | Price | SKU |
|------|---------|-------|-----|
| Basic Credit Pack | 10 | $4.99 | `credit_pack_10_499_{appname}` |
| Pro Credit Pack | 30 | $9.99 | `credit_pack_30_999_{appname}` |
| Ultimate Credit Pack | 80 | $19.99 | `credit_pack_80_1999_{appname}` |

**Format:** `credit_pack_{credits}_{priceDigits}_{appname}`. The same product ID is used across ASC, Play, and Adapty so app code only needs one constant.

**Auto-fill:** triggers on any `in_app_products[]` entry with a `credits` numeric field. Custom IAPs without a `credits` field keep whatever `sku` you write.

---

## gpc monetization push

Re-run only the subscription + IAP push steps from `gpc setup` — useful for refreshing PPP pricing across all ~175 regions without repeating listings, data safety, or the manual-checklist prompt.

```bash
# Push everything (subscriptions + IAPs)
kappmaker gpc monetization push

# Subscriptions only
kappmaker gpc monetization push --subscriptions-only

# IAPs only
kappmaker gpc monetization push --iap-only

# Custom config path
kappmaker gpc monetization push --config ./path/to/googleplay-config.json

# Re-create products stuck due to regionsVersion 2022/02 drift
kappmaker gpc monetization push --recreate-stuck
```

Validates the service account and probes app state (requires at least one uploaded build — internal testing track is enough). Calls the same `setupSubscriptions` / `setupInAppProducts` functions as `gpc setup` — fully idempotent: existing products are PATCHed with refreshed PPP regional fan-out.

| Flag | Description | Default |
|---|---|---|
| `--config <path>` | Path to JSON config file | `./Assets/googleplay-config.json` |
| `--subscriptions-only` | Push subscriptions only, skip IAPs | — |
| `--iap-only` | Push IAPs only, skip subscriptions | — |
| `--recreate-stuck` | DELETE + recreate products stuck due to `regionsVersion=2022/02` incompatibility | — |

:::tip When to use this vs `gpc setup`
Use `gpc monetization push` when you've already run the full setup and just want to sync pricing (e.g. after upgrading KAppMaker for a PPP fix, or after adding a new product to the config). Use `gpc setup` for initial setup or when you also need to update listings or data safety.
:::

---

## gpc data-safety push

Push only the data safety declaration. Faster than running the full `setup` when iterating on the privacy answers.

```bash
kappmaker gpc data-safety push
```

### Two Ways to Configure

**1. Structured JSON (recommended)** — `data_safety.answers` overlay on top of defaults:

```json
"data_safety": {
  "apply_defaults": true,
  "answers": {}
}
```

Default data types collected:

| Data type | Play Question / Response | Collection purposes |
|---|---|---|
| User IDs | `PSL_DATA_TYPES_PERSONAL/PSL_USER_ACCOUNT` | App functionality, Account management |
| Device ID | `PSL_DATA_TYPES_IDENTIFIERS/PSL_DEVICE_ID` | App functionality, Advertising or marketing, Account management |
| Crash logs | `PSL_DATA_TYPES_APP_PERFORMANCE/PSL_CRASH_LOGS` | Analytics |
| Diagnostics | `PSL_DATA_TYPES_APP_PERFORMANCE/PSL_PERFORMANCE_DIAGNOSTICS` | Analytics |
| Other performance | `PSL_DATA_TYPES_APP_PERFORMANCE/PSL_OTHER_PERFORMANCE` | Analytics |
| App interactions | `PSL_DATA_TYPES_APP_ACTIVITY/PSL_USER_INTERACTION` | Analytics |

Default data handling: collected only (not shared), processed ephemerally, collection is required, encrypted in transit.

To override a specific answer, add keys to `answers`:

```json
"data_safety": {
  "apply_defaults": true,
  "answers": {
    "PSL_DATA_TYPES_LOCATION/PSL_APPROX_LOCATION": true
  }
}
```

**2. Escape hatch: CSV file** — upload a Play Console-exported CSV verbatim:

```json
"data_safety_csv_path": "Assets/data-safety.csv"
```

---

## gpc app-check

Quick read-only probe to verify that an app exists on Play Console. Useful for CI scripts.

```bash
kappmaker gpc app-check --package com.example.myapp
```

Exits `0` if found, `2` if missing (prints the Play Console deep link).

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--package <name>` | Override the package name from config | — |
