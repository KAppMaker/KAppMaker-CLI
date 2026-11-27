# Firebase, App Store Connect, Google Play, subscriptions and Adapty

Moved here from the README. Index: [docs/commands](README.md).

## `firebase`

Five standalone subcommands matching steps 2–6 of `create`. Run them individually for partial flows (e.g. set up Firebase for an existing project), or together to replicate what `create` does.

```bash
kappmaker firebase login
kappmaker firebase project --app-name MyApp                # derives project-id = myapp-app, display = MyApp
kappmaker firebase project --project-id myapp-prod --display-name MyApp  # explicit
kappmaker firebase apps --project myapp-app --app-name MyApp --package-name com.example.myapp
kappmaker firebase auth-anonymous --project myapp-app
kappmaker firebase configs --project myapp-app --app-name MyApp --package-name com.example.myapp
```

### `firebase login`

Runs `firebase login` (interactive). No args.

### `firebase project`

Creates the Firebase project. Idempotent — if the project already exists it skips creation. Returns success/failure to the orchestrator (controls whether `create` proceeds with steps 4–6).

| Flag | Description | Required |
|------|-------------|----------|
| `--project-id <id>` | Firebase project ID (e.g. `myapp-app`) | Yes, unless `--app-name` is set |
| `--display-name <name>` | Project display name | Defaults to `--project-id` or `--app-name` |
| `--app-name <name>` | PascalCase app name; derives `project-id = <lowercase>-app` and `display-name = <name>` | Yes, unless explicit IDs are passed |

### `firebase apps`

Creates an Android + iOS app under the project. Idempotent — reuses existing apps that match the display name `${appName} (Android App)` / `${appName} (iOS App)`.

| Flag | Description | Required |
|------|-------------|----------|
| `--project <id>` | Firebase project ID | Yes |
| `--app-name <name>` | PascalCase display name (used to label the apps) | Yes |
| `--package-name <pkg>` | Android `applicationId` and iOS bundle ID (e.g. `com.example.myapp`) | Yes |

### `firebase auth-anonymous`

Enables anonymous authentication via the Identity Toolkit Admin API. If Firebase Auth has never been initialized for the project, the command pauses and asks you to click "Get started" in the Firebase Console, then retries automatically.

| Flag | Description | Required |
|------|-------------|----------|
| `--project <id>` | Firebase project ID | Yes |

### `firebase configs`

Downloads `google-services.json` and `GoogleService-Info.plist` for the Android + iOS apps and writes them to the right place. Apps are looked up via `--app-name` (display name match) unless you pass `--android-app-id` / `--ios-app-id` directly.

**Output auto-detection** (when `--android-output` / `--ios-output` aren't given): probes `MobileApp/androidApp/google-services.json`, then `MobileApp/composeApp/google-services.json`, then falls back to `Assets/google-services.json`. Same for iOS — `MobileApp/iosApp/iosApp/GoogleService-Info.plist` if it exists, otherwise `Assets/GoogleService-Info.plist`.

When `--package-name` is provided, the downloaded `google-services.json` is verified against the expected package name and patched in-place if it doesn't match (handles cases where the Firebase app was registered with an older `bundleIdPrefix`).

| Flag | Description | Required |
|------|-------------|----------|
| `--project <id>` | Firebase project ID | Yes |
| `--app-name <name>` | PascalCase display name (used to find the apps if app IDs aren't given) | Yes |
| `--package-name <pkg>` | Verify and fix the Android `google-services.json` package name | No |
| `--android-app-id <id>` | Skip lookup and use this Firebase App ID directly | No |
| `--ios-app-id <id>` | Skip lookup and use this Firebase App ID directly | No |
| `--android-output <path>` | Output path for `google-services.json` | Auto-detect |
| `--ios-output <path>` | Output path for `GoogleService-Info.plist` | Auto-detect |

---

## `create-appstore-app`

Creates and fully configures an app on App Store Connect using the [asc CLI](https://github.com/rorkai/App-Store-Connect-CLI). Requires asc ≥ 5.9.0 (an older or unreadable asc stops the command with the upgrade line).

> **2.2.0:** every step reads its result back and the run ends with a summary of FAILED steps (exit 1). Copyright defaults to `"<year> <organization>"`, availability is every territory, the age rating answers social media / UGC / messaging explicitly, the App Review detail is created with `demoAccountRequired=false` for no-login apps, group localizations are ensured, and `asc validate subscriptions` is the final check. `--yes` or `--config` answers the confirmations.

```bash
kappmaker create-appstore-app
kappmaker create-appstore-app --config ./my-config.json
```

### First-time setup

1. **Generate an API key** at [App Store Connect > Users and Access > Integrations > API](https://appstoreconnect.apple.com/access/integrations/api) — Admin access, download the `.p8` file immediately
2. **Run one-time setup:**
   ```bash
   kappmaker config appstore-defaults --init
   ```

### What it does (13 steps)

1. Validate asc CLI and authentication
2. Load config (from file or interactive prompts)
3. Register Bundle ID + enable capabilities (Sign in with Apple, In-App Purchases, Push Notifications). Name follows Apple convention: `XC com measify myapp` for `com.measify.myapp`
4. Find or create app (fully automated via `asc web apps create` — no manual App Store Connect step needed)
5. Set content rights
6. Create app version (1.0.0)
7. Set categories
8. Set age rating
9. Update localizations
10. Set pricing, availability, and subscriptions
11. Set privacy data usages
12. Set encryption declarations
13. Set review contact details

### Config resolution

Layers are deep-merged (later overrides earlier):

1. **Built-in template** — age rating, privacy, encryption, subscriptions
2. **Global defaults** (`~/.config/kappmaker/appstore-defaults.json`) — review contact, copyright
3. **Local config** (`./Assets/appstore-config.json` or `--config`)
4. **Interactive prompts** — only for fields still empty

### Default subscriptions

| Subscription | Period | Price | Product ID |
|-------------|--------|-------|------------|
| Weekly Premium | `ONE_WEEK` | $6.99 | `{appname}.premium.weekly.v1.699.v1` |
| Yearly Premium | `ONE_YEAR` | $29.99 | `{appname}.premium.yearly.v1.2999.v1` |

Auto-generated naming: group `{appname}.premium.v1`, ref name `{AppName} Premium Weekly v1 (6.99)`.

### Per-territory PPP pricing (1.7.0+ — bulk CSV import)

Subscriptions and IAPs are fanned out to **every ASC territory (~175)** with purchasing-power-parity-adjusted prices in a **single API call per product**. Requires asc CLI **≥ 1.4.0** (`brew upgrade asc`).

- **Subscriptions** (1.7.0+): `asc subscriptions pricing prices import --input <csv>`. KAppMaker writes a temp CSV with `territory,price,price_point_id` rows for all ~175 territories and pipes it in. Replaces the 155-call loop from 1.6.x which hit Apple's rate limits.
- **IAPs**: a single `asc iap pricing schedules create --prices "PP_ID:DATE,…"` call covers all territories (unchanged).

Set `"ppp_enabled": false` on any subscription or IAP to opt out and keep only your explicitly-listed `prices`. User-listed territory prices are always preserved (they win the merge).

**Tier resolution**: Apple's price-point catalog uses globally-stable tier numbers (1..800 — tier N = the same USD-equivalent across every territory). KAppMaker resolves each unique PPP USD target → tier ONCE via USA's catalog (where customerPrice is in USD), then synthesises per-territory price-point IDs locally using Apple's base64 `{s, t, p}` format. Critical fix vs 1.6.x: the old code compared a USD target against local-currency price-points (e.g. ¥, ₩, ₹) and ended up picking the FREE tier — products silently landed at $0 in JPN/IDR/INR/KRW/etc. The new tier-based resolution avoids that entirely.

**Distinct catalogs**: subscriptions use `subscriptionPricePoints` (CLI: `asc subscriptions pricing price-points list`) while IAPs use `appPricePoints` (CLI: `asc pricing price-points`). Their `s` (catalog identifier) fields differ — mixing IDs across catalogs returns `400 The provided entity is invalid`.

**Idempotent re-runs**: when `setup` reports "already been used", KAppMaker now logs `existing — refreshing pricing` and continues into the PPP fan-out so re-runs actually update territory pricing (1.6.x silently skipped).

### App Review screenshots (1.7.1+)

Apple requires a review screenshot on every subscription and IAP — without one, products remain in `MISSING_METADATA` state and per-territory pricing won't "resolve". KAppMaker uploads it automatically when you set `review_screenshot` in the config:

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

- **Global default**: `review_screenshot` at the top level applies to every sub + IAP.
- **Per-product override**: each subscription / IAP can specify its own path.
- **Idempotent**: re-runs check `view` / `images list` first and skip if a screenshot is already attached. Delete via Apple's UI to force a re-upload.
- **Silent skip on missing file**: if the path doesn't resolve to an existing file, KAppMaker logs and moves on — no error.

Under the hood: `asc subscriptions review screenshots create --file <path>` for subs and `asc iap images create --file <path>` for IAPs.

#### Required size + auto-resize prompt

Apple's recommended size for App Review screenshots is **1290 × 2796 px** (iPhone 6.7" Display, portrait — matches App Store listing screenshot dimensions). Minimum: 640 × 920 px. Format: PNG or JPG.

If the file's dimensions don't match 1290 × 2796, KAppMaker prompts:

```
WARN Review screenshot wrong-size.png is 1920×1080.
-- Apple's App Store recommended size for review screenshots: 1290×2796 (iPhone 6.7" Display, portrait).
  Resize to 1290×2796 keeping aspect ratio? (Y/n)
```

- **Y (default)** — sharp resizes the file with `fit: 'inside'` (preserves aspect ratio, may end up smaller than the target on the constraining dimension; e.g. a 1920 × 1080 input becomes 1290 × 726). Writes to a temp file. Uploads the resized copy.
- **N** — uploads the file as-is. Apple may still accept it (the rule is just `min 640 × 920`) but the aspect ratio won't match typical iPhone screenshots.

Files that are already 1290 × 2796 skip the prompt entirely.

#### Standalone replace commands

Two top-level `appstore-` prefixed commands replace existing screenshots without running the full `create-appstore-app` flow:

```bash
# Replace the review screenshot on EVERY subscription in the config
kappmaker appstore-update-subscription-review-screenshot --file ./Assets/appstore/new-review.png

# Replace the review image on EVERY IAP
kappmaker appstore-update-iap-review-screenshot --file ./Assets/appstore/iap-review.png

# Without --file, the commands use the per-product `review_screenshot` from the config
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

These commands **force-replace** existing screenshots (delete + create under the hood — empirically `asc … update` doesn't actually swap the binary). The setup-flow upload in `create-appstore-app` remains idempotent (skips when one is already attached).

### Default in-app purchases (credit packs)

The template also ships three CONSUMABLE in-app purchases shaped as credit packs. Auto-fill triggers on any `in_app_purchases[]` entry with a `credits` numeric field.

| Pack | Credits | Price | Product ID |
|------|---------|-------|------------|
| Basic Credit Pack | 10 | $4.99 | `credit_pack_10_499_{appname}` |
| Pro Credit Pack | 30 | $9.99 | `credit_pack_30_999_{appname}` |
| Ultimate Credit Pack | 80 | $19.99 | `credit_pack_80_1999_{appname}` |

Format: `credit_pack_{credits}_{priceDigits}_{appname}`. The same ID is used on Google Play and Adapty so app code can reference one constant per platform pair.

Created via the same one-shot `asc iap setup` workflow that drives subscription setup. Reruns are idempotent — already-existing product IDs are skipped with an info log.

### Default privacy

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

| Flag | Description | Default |
|------|-------------|---------|
| `--config <path>` | Path to JSON config file | `./Assets/appstore-config.json` |

---

## `appstore-monetization-push`

Standalone command that re-runs only the subscription + IAP push step from `create-appstore-app`. Useful when you want to sync pricing (including PPP fan-out) without repeating the full 13-step setup — e.g. after adding a new subscription period, adjusting prices, or upgrading to a newer KAppMaker version with PPP fixes.

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

Reads `Assets/appstore-config.json` (or `--config <path>`). Resolves the ASC app ID from `app.id` or by looking up `app.bundle_id` via `asc`. Calls the same `setupSubscriptions` / `setupInAppPurchases` functions as `create-appstore-app` — fully idempotent: existing products get pricing refreshed with the full PPP regional fan-out.

| Flag | Description | Default |
|------|-------------|---------|
| `--config <path>` | Path to JSON config file | `./Assets/appstore-config.json` |
| `--subscriptions-only` | Push subscription groups only, skip IAPs | — |
| `--iap-only` | Push IAPs only, skip subscription groups | — |

---

## `gpc`

Google Play Console management — a tight wrapper around the official Google Play Android Publisher API. All subcommands authenticate via the service account JSON at `googleServiceAccountPath` (same one used by `publish --platform android`). **No external CLI and no extra npm dependencies** — the JWT flow and HTTPS calls are implemented with Node's built-in `crypto` and `fetch`.

> **Note:** Google Play does not allow creating new apps via any public API. Create the app manually once in [Play Console](https://play.google.com/console/u/0/developers), then use these commands to configure it.

> **2.2.0:** every Play API error stops the command with Google's error body (exit 1); `gpc setup` ends with a step summary of FAILED steps. Listings are merged with the live listing (empty fields never clear Play, `--allow-empty` to clear) and read back before commit. Monetization uses `regionsVersion` 2026/01 (`--regions-version`, config `playRegionsVersion`) and reports `N of M regions priced` per product. `--yes`, or `--config`, answers confirmations.

### `gpc setup`

Full end-to-end configuration (11 steps) — the Google Play parallel to `create-appstore-app`.

```bash
kappmaker gpc setup
kappmaker gpc setup --config ./my-config.json
```

**What it does:**

1. Validate service account + obtain access token
2. Load config (`./Assets/googleplay-config.json` or interactive prompts). **Auto-detects Play's actual default language** via a throwaway edit probe and rewrites `config.app.default_language` + the matching listing locale if your config drifted from reality. Also migrates legacy product IDs and legacy data-safety placeholders. Also reads tracks state to verify an APK/AAB is uploaded.
3. Review summary and confirm
4. Verify app exists on Play Console (fails fast with a deep link if not — Google does not allow app creation via the public API)
5. Start a Play Console edit (only if the default-language listing has a title — otherwise steps 5-7 are skipped cleanly)
6. Update app details (default language + contact website/email/phone)
7. Update store listings per locale, merged with the live listing (empty config fields never clear Play; `--allow-empty` to clear), diffed, read back, then commit. The app name fills a title only where Play has none
8. **Pre-flight build check**, then create subscriptions via the new monetization API (`POST /subscriptions` with `productId` + `regionsVersion.version` as query params, base plans in body in DRAFT state, then `basePlans:activate` each one). **Base plans are available to all ~175 Play regions** — regions without explicit prices get auto-converted pricing from Google. Idempotent — existing product IDs are skipped. **Subscription listings are auto-cloned into Play's default language if missing.** Skipped with a clear message if no build is uploaded to any track (Google rejects monetization writes in that case).
9. Create one-time in-app products via the **new** monetization API (`PATCH /onetimeproducts/{id}?allowMissing=true` + `purchaseOptions:batchUpdateStates` to activate). Idempotent via `GET /oneTimeProducts`. Replaces the legacy `/inappproducts` endpoint that returns 403 on migrated apps.
10. Update the data safety declaration: converts `data_safety` JSON → Google's CSV format using a bundled canonical template + KAppMaker defaults (USER_ID for app functionality + account management; DEVICE_ID for app functionality + advertising + account management; crash/performance/diagnostics/interactions for analytics), then posts it via `POST /dataSafety` with `{ safetyLabels: "<csv>" }`. Respects `data_safety_csv_path` as an escape hatch for pre-exported CSVs.
11. Print a checklist of policy declarations that the Publisher API does NOT expose (content rating / IARC, target audience, ads, health apps, financial features, government apps, news apps, gambling, COVID-19 tracing, app access, advertising ID, families compliance, app pricing tier) with a deep link to Play Console's App content page. All verified against Google's v3 discovery document — none have REST endpoints.

### `gpc listings push`

Push just the store listings section from the config file (useful after editing copy).

```bash
kappmaker gpc listings push
kappmaker gpc listings push --config ./my-config.json
kappmaker gpc listings push --allow-empty   # let empty config fields clear live Play fields
```

Runs a single edit transaction: reads the live listings, shows the diff, updates app details and only the fields the config fills in, reads the listings back, then commits. Any mismatch or error drops the edit.

### `gpc subscriptions list`

Read-only — lists existing subscription product IDs on Play Console.

```bash
kappmaker gpc subscriptions list --package com.example.myapp
kappmaker gpc subscriptions list   # uses app.package_name from the config file
```

### `gpc subscriptions push`

Create or reuse subscriptions from the config file. Idempotent — already-existing product IDs are skipped, and base plans are activated even for reused subscriptions.

```bash
kappmaker gpc subscriptions push
```

Uses the **new** monetization API (`applications/{pkg}/subscriptions` + `basePlans:activate`). Auto-generated IDs:

| Field | Format | Example ($6.99 weekly) |
|---|---|---|
| `productId` (subscription) | `{appname}.premium.{period}.v1` | `myapp.premium.weekly.v1` |
| `basePlanId` | `autorenew-{period}-{priceDigits}-v1` | `autorenew-weekly-699-v1` |
| Subscription title | `{AppName} Premium {PeriodLabel}` | `MyApp Premium Weekly` |

These align 1-to-1 with what `adapty setup` writes to `android_product_id` and `android_base_plan_id`, so Adapty links the products automatically without any extra configuration.

### `gpc iap list`

Read-only — lists existing one-time in-app product SKUs on Play Console.

```bash
kappmaker gpc iap list --package com.example.myapp
kappmaker gpc iap list
```

### `gpc iap push`

Create or reuse one-time in-app products from the config file. Idempotent — existing products are PATCHed with fresh PPP regional pricing.

```bash
kappmaker gpc iap push
kappmaker gpc iap push --recreate-stuck   # DELETE + recreate products stuck at regionsVersion 2022/02
```

| Flag | Description |
|---|---|
| `--config <path>` | Override the default config path (`./Assets/googleplay-config.json`) |
| `--recreate-stuck` | DELETE products whose stored regions can't coexist with `regionsVersion=2022/02` (e.g. legacy products with MN) so they recreate fresh. WARNING: Google holds the productId in a soft-delete reservation window for a few minutes to a few hours after deletion — CREATE during that window fails with "Product ID already in use". Use only when you can tolerate downtime, or prefer bumping the product_id in config (e.g. `v1` → `v2`) for zero downtime. |

Uses the **new** monetization API: `PATCH /applications/{pkg}/onetimeproducts/{id}?allowMissing=true` to create/update the product, then `purchaseOptions:batchUpdateStates` with an `activatePurchaseOptionRequest` to activate the default purchase option so it's available to buyers. Replaces the legacy `/inappproducts` endpoint, which Google now rejects with "Please migrate to the new publishing API" on migrated apps.

**Default credit packs** ship in `Assets/googleplay-config.json`. Auto-fill triggers on any `in_app_products[]` entry with a `credits` numeric field — SKU is set to `credit_pack_{credits}_{priceDigits}_{appname}` (matches the ASC and Adapty IDs):

| Pack | Credits | Price | SKU |
|------|---------|-------|-----|
| Basic Credit Pack | 10 | $4.99 | `credit_pack_10_499_{appname}` |
| Pro Credit Pack | 30 | $9.99 | `credit_pack_30_999_{appname}` |
| Ultimate Credit Pack | 80 | $19.99 | `credit_pack_80_1999_{appname}` |

**Global region availability with PPP pricing (1.6.0+):** subscriptions and one-time products are both created with **explicit per-region prices** in every Play-supported region (~175), with purchasing-power-parity multipliers applied — IN gets ~0.35×, AR/PK/EG get 0.30×, US/CA/EU base at 1.00×, CH/NO at 1.10×. The multipliers come from a Steam/Spotify-inspired tier table ([iosdevmax/ppp-pricing](https://github.com/iosdevmax/ppp-pricing), MIT). Prices round to .99 endings.

| Override | Result |
|---|---|
| You list `{ region_code: "DE", price: "5.99", currency_code: "EUR" }` | Used as-is for DE; PPP fills the rest |
| You list only US/USD | PPP fans out from your USD anchor to ~175 regions |
| Set `"ppp_enabled": false` on a base plan or IAP | That entry stays restricted to your listed regions |

**Each region's price is in its native currency** (AE → AED, JP → JPY, IN → INR, etc.) — Google Play rejects mismatched currencies. The CLI calls Google's `convertRegionPrices` endpoint with your USD base price to get fair FX-converted native prices for every billable region, then multiplies by the region's PPP multiplier and charm-rounds (.99 for decimal currencies, X99 / X9 for zero-decimal currencies like JPY / KRW). Sanctioned countries (AF, IR, KP, SY, etc.) are auto-excluded — they don't appear in `convertRegionPrices` output.

**`regionsVersion=2022/02` drift override (1.6.11+):** Google's monetization API requires `regionsVersion.version` and `"2022/02"` is the only documented value. Several regions have drifted since that snapshot was taken — Google's live API returns one currency but `2022/02` expects another. The CLI handles this with an explicit override table:

| Region | Live API | 2022/02 expects | What CLI does |
|---|---|---|---|
| BG | EUR | BGN | Converts EUR → BGN via the 1 EUR = 1.95583 BGN peg |
| HR | EUR | EUR ✓ | No override (Google updated 2022/02 retroactively) |
| CI / CM / SN | XOF / XAF | USD | Uses the USD anchor (PPP multiplier still applied) |
| MN | billable | NOT BILLABLE | Skipped entirely (no currency works) |

Net effect: typical products land with all ~173 billable regions AVAILABLE (only MN drops out). Google's storage layer auto-converts each region's submitted currency to the user-facing display currency (we send BG/BGN → end users see EUR; we send CI/USD → end users see XOF).

**Existing products with regions stuck at `2022/02`:** if Google's old catalog has stored MN (or another `NEVER_BILLABLE` region) on an existing product, that PATCH cannot be completed — Google won't accept MN's currency but also refuses to remove the region. The CLI surfaces these "stuck" products at the end of the run and offers three fix paths:

1. **Recommended** — bump the `product_id` in your config (e.g. `credit_pack_10_499_myapp` → `credit_pack_10_499_myapp_v2`). Fresh product, no legacy baggage, no waiting period.
2. `--recreate-stuck` flag — DELETEs the stuck product(s) and recreates them fresh. WARNING: Google soft-deletes for a few minutes to a few hours; CREATE during that window returns "Product ID already in use". Plan downtime.
3. Manually delete on Play Console UI, wait for the reservation window to clear, then re-run.

**"New countries and regions" set to AVAILABLE (1.6.11+):** both subscriptions (`otherRegionsConfig`) and one-time products (`newRegionsConfig`) are now always set to `availability: AVAILABLE` with USD + EUR anchors when a USD anchor is present. Means any region Google adds to its billable catalog in the future is auto-priced from those anchors — no future-proofing maintenance needed.

**Want simpler pricing without PPP?** Set `"ppp_enabled": false` on a base plan or one-time product to skip the PPP fan-out. The CLI then submits only your user-listed regions in `regional_configs` (typically just US) plus `otherRegionsConfig` (subscriptions) / `newRegionsConfig` (one-time products) with USD + EUR anchors. Google handles the fan-out via its own pricing-template FX algorithm — every billable region gets a price, but without PPP discounting in lower-income markets. Trade-off: smaller payload, less control.

### `gpc data-safety push`

Push only the data safety declaration. Faster than running the full `setup` when you're iterating on the privacy answers.

```bash
kappmaker gpc data-safety push
kappmaker gpc data-safety push --verify   # check every answer against Play's question set, print what Play now declares
```

A non-2xx from Play exits 1 with Google's error body (older versions printed OK on an HTTP 400). Play has no read endpoint for the form, so `--verify` checks what was sent and tells you to glance at Play Console once.

**How it works under the hood:** Google's `POST /applications/{pkg}/dataSafety` does not take structured JSON — it takes a CSV file (the same one Play Console exports from Policy → App content → Data safety → Export to CSV), wrapped in `{ safetyLabels: "<csv>" }`. KAppMaker lets you stay in JSON and converts internally.

**Two ways to configure it in `Assets/googleplay-config.json`:**

1. **Structured JSON (recommended)** — `data_safety.answers` overlay on top of KAppMaker defaults:

   **Account creation:** "My app does not allow users to create an account" (`PSL_ACM_NONE`).

   **Data deletion:** skipped entirely (the question is optional).

   **Data types collected:**

   | Data type | Play Question / Response |
   |---|---|
   | User IDs | `PSL_DATA_TYPES_PERSONAL/PSL_USER_ACCOUNT` |
   | Device ID | `PSL_DATA_TYPES_IDENTIFIERS/PSL_DEVICE_ID` |
   | Crash logs | `PSL_DATA_TYPES_APP_PERFORMANCE/PSL_CRASH_LOGS` |
   | Diagnostics | `PSL_DATA_TYPES_APP_PERFORMANCE/PSL_PERFORMANCE_DIAGNOSTICS` |
   | Other performance | `PSL_DATA_TYPES_APP_PERFORMANCE/PSL_OTHER_PERFORMANCE` |
   | App interactions | `PSL_DATA_TYPES_APP_ACTIVITY/PSL_USER_INTERACTION` |

   **Data handling (same for ALL data types above):**
   - Collected only, **not shared** with third parties
   - **Processed ephemerally** (YES)
   - **Collection is required** — users can't turn it off
   - Purposes: Analytics (+ App functionality for Device ID)

   **Security:** encrypted in transit = YES.

   Example config (just use the default — override if you need to add data types or change handling):
   ```json
   "data_safety": {
     "apply_defaults": true,
     "answers": {}
   }
   ```

   To override a specific answer, add keys to `answers`. Keys are either `QuestionID` (for single-answer rows) or `QuestionID/ResponseID` (for multi-choice rows). Values are `true` / `false` / URL string / `null`:
   ```json
   "data_safety": {
     "apply_defaults": true,
     "answers": {
       "PSL_DATA_TYPES_PERSONAL/PSL_USER_ACCOUNT": true,
       "PSL_DATA_TYPES_LOCATION/PSL_APPROX_LOCATION": true
     }
   }
   ```

   Internally, KAppMaker loads a canonical 783-row template (extracted from the well-maintained [fastlane-plugin-google_data_safety](https://github.com/owenbean400/fastlane-plugin-google_data_safety)), applies defaults + your overrides, emits a filled CSV, and uploads it via `POST /dataSafety`.

2. **Escape hatch: CSV file** — if you already exported a real CSV from Play Console and filled it in:
   ```json
   "data_safety_csv_path": "Assets/data-safety.csv"
   ```
   When this field is set and the file exists, it takes priority over the JSON block and is uploaded verbatim.

**Important:** Review the summary Play Console shows after the push before publishing. Google's conditional question logic may reject some answers — paste the error and I'll adjust the defaults.

### `gpc app-check`

Quick read-only probe to verify that an app exists on Play Console. Useful for CI scripts and before running destructive operations.

```bash
kappmaker gpc app-check --package com.example.myapp
```

Exits 0 if found, 2 if missing (prints the Play Console deep link).

### Config

All `gpc` subcommands except `app-check` load `./Assets/googleplay-config.json` by default. The first run of `kappmaker gpc setup` creates it interactively.

| Flag | Description | Default |
|------|-------------|---------|
| `--config <path>` | Path to JSON config file | `./Assets/googleplay-config.json` |
| `--package <name>` | (list commands) Override the package name from config | — |

**Alias:** `kappmaker create-play-app` is kept as a shortcut for `kappmaker gpc setup` (the entire 11-step flow is also what the top-level `kappmaker create` calls under step 8 when you answer yes to the Google Play Console prompt).

---

## `gpc monetization push`

Standalone command that re-runs only the subscription + IAP push steps from `gpc setup`. Useful when you want to sync pricing (including full PPP fan-out across ~175 regions) without repeating listings, data safety, or the manual-checklist prompt.

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

Reads `Assets/googleplay-config.json` (or `--config <path>`). Validates the service account and probes the app state (requires at least one uploaded build — internal testing track is enough). Calls the same `setupSubscriptions` / `setupInAppProducts` functions as `gpc setup` — fully idempotent: existing products are PATCHed with refreshed PPP regional fan-out.

| Flag | Description | Default |
|------|-------------|---------|
| `--config <path>` | Path to JSON config file | `./Assets/googleplay-config.json` |
| `--subscriptions-only` | Push subscriptions only, skip IAPs | — |
| `--iap-only` | Push IAPs only, skip subscriptions | — |
| `--recreate-stuck` | Delete + recreate products stuck due to regionsVersion 2022/02 incompatibility | — |

---

## `subscription add`

Quick-add a single new subscription to Google Play and App Store Connect without editing config files. Auto-generates aligned product IDs across both stores, fans out PPP pricing across ~175 Play regions and ~155 ASC territories, and auto-creates the App Store Connect subscription group if it doesn't exist yet.

```bash
# Minimum invocation — defaults to --platform all (Play + ASC)
kappmaker subscription add --period weekly --price 9.99

# v2 product line alongside an existing v1
kappmaker subscription add --period weekly --price 9.99 --product-version 2

# Single store
kappmaker subscription add --period monthly --price 19.99 --platform android
kappmaker subscription add --period yearly --price 29.99 --platform ios

# Full control — fully spelled out
kappmaker subscription add \
  --period weekly --price 6.99 --product-version 2 \
  --name "Weekly Premium" \
  --description "Full access for one week." \
  --review-screenshot "Assets/appstore/review-screenshot_subscription.jpg" \
  --group "myapp.premium.v2" --group-name "Premium Access" \
  --app-name "MyApp"
```

**What it creates** (for `--period weekly --price 9.99 --product-version 1`):

| Where | Field | Value |
|---|---|---|
| ASC | `product_id` | `myapp.premium.weekly.v1.999.v1` |
| ASC | `ref_name` | `MyApp Premium Weekly v1 (9.99)` |
| ASC | subscription period | `ONE_WEEK` |
| ASC | localization (en-US) | name = `MyApp Premium Weekly`, description = `Full access for one week.` |
| ASC | pricing | $9.99 USD anchor → PPP fan-out across ~155 territories in one `prices import` CSV call |
| ASC | review screenshot | top-level `config.review_screenshot` (or `--review-screenshot`) |
| ASC | subscription group | first group in config, OR `--group <ref>` (auto-created with en-US name if new) |
| Play | `product_id` | `myapp.premium.weekly.v1` |
| Play | base plan | `autorenew-weekly-999-v1`, period `P1W` |
| Play | listing (en-US) | title = `MyApp Premium Weekly`, description = `Full access for one week.` |
| Play | pricing | $9.99 USD anchor → PPP fan-out across ~173 billable regions via `convertRegionPrices` |

**Flags:**

| Flag | Required | Default |
|---|---|---|
| `--period <slug>` | yes | — — one of `weekly` / `monthly` / `twomonths` / `quarterly` / `semiannual` / `yearly` |
| `--price <number>` | yes | — — USD anchor; PPP fans the rest |
| `--platform <target>` | no | `all` (= Play + ASC) — `ios` = ASC only, `android` = Play only |
| `--product-version <n>` | no | `1` — bumps every `v` marker, e.g. `--product-version 2` → `myapp.premium.weekly.v2.999.v2` + `myapp.premium.weekly.v2` + `autorenew-weekly-999-v2` |
| `--name <text>` | no | `"<AppName> Premium <Period>"` — localized display name |
| `--description <text>` | no | period-derived sentence: weekly → `"Full access for one week."`, monthly → `"Full access for one month."`, etc. |
| `--review-screenshot <path>` | no | top-level `config.review_screenshot` from `Assets/appstore-config.json` |
| `--group <ref>` | no | first group in `Assets/appstore-config.json` — if the ref doesn't exist on ASC yet, it's auto-created |
| `--group-name <text>` | no | inherits from matching config group's `localizations[0].name`, else `"Premium Access"` — used when auto-creating a new group |
| `--app-name <name>` | no | read from existing configs |
| `--bundle-id <id>` | no | iOS bundle ID override (e.g. `com.example.myapp`) — use when `Assets/appstore-config.json` doesn't exist yet |
| `--package-name <pkg>` | no | Android package name override — use when `Assets/googleplay-config.json` doesn't exist yet |

**Idempotency:** safe to re-run. Existing products are PATCHed with refreshed PPP regional fan-out (same code path as `gpc subscriptions push` and `create-appstore-app`). Existing ASC subscriptions log `"already exists — refreshing pricing"` and continue.

**Adapty is intentionally NOT included** — Adapty pulls live store prices at runtime via its store integrations, so creating an extra Adapty product entry adds noise without unlocking anything the SDK can't already fetch. Adapty product entries remain managed via `kappmaker adapty setup` for the canonical product set. (For credit packs `iap add` DOES include Adapty, see below.)

**Notes:**
- No `--free-trial` flag yet. For intro offers, edit `Assets/{googleplay,appstore}-config.json` and run `gpc subscriptions push` / `create-appstore-app`.
- Only en-US localization is created. For multi-locale, edit the config files.
- Only first regional price (`US/USD`) is set explicitly. Other regions come from PPP fan-out.

---

## `iap add`

Quick-add a single credit-pack consumable IAP to Google Play, App Store Connect, AND Adapty (Adapty is included here because credit packs use the `credit_pack_access` access level to gate consumable entitlements that have no store-side equivalent). Auto-generates aligned product IDs across all three.

```bash
# Minimum invocation
kappmaker iap add --credits 50 --price 14.99

# v2 product line (appends "_v2" suffix to the ID)
kappmaker iap add --credits 50 --price 14.99 --product-version 2

# Single store
kappmaker iap add --credits 100 --price 24.99 --platform ios

# Full control
kappmaker iap add \
  --credits 10 --price 4.99 --product-version 2 \
  --name "Basic Credit Pack" \
  --description "10 credits to use in the app." \
  --review-screenshot "Assets/appstore/review-screenshot_credits.jpg"
```

**What it creates** (for `--credits 10 --price 4.99 --product-version 1 --name "Basic Credit Pack"`):

| Where | Field | Value |
|---|---|---|
| ASC | `product_id` | `credit_pack_10_499_myapp` (v2+ appends `_v2`) |
| ASC | `type` | `CONSUMABLE` |
| ASC | `ref_name` | `MyApp Basic Credit Pack v1 (4.99)` |
| ASC | localization (en-US) | name = `Basic Credit Pack`, description = `10 credits to use in the app.` |
| ASC | pricing | $4.99 USD anchor → PPP across ~155 territories |
| Play | `sku` | `credit_pack_10_499_myapp` |
| Play | `purchase_type` | `managed` |
| Play | listing (en-US) | title = `Basic Credit Pack`, description = `10 credits to use in the app.` |
| Play | pricing | $4.99 USD anchor → PPP across ~173 billable regions |
| Adapty | `title` | `MyApp Basic Credit Pack v1 (4.99)` |
| Adapty | `period` | `consumable` (routed via Adapty REST API since CLI rejects this period value) |
| Adapty | `ios_product_id` / `android_product_id` | same ID on both — `credit_pack_10_499_myapp` |
| Adapty | access level | `credit_pack_access` (falls back to first level if missing) |

**Flags:**

| Flag | Required | Default |
|---|---|---|
| `--credits <number>` | yes | — |
| `--price <number>` | yes | — — USD anchor; PPP fans the rest |
| `--platform <target>` | no | `all` (= Play + ASC + Adapty) — `ios` = ASC only, `android` = Play only |
| `--product-version <n>` | no | `1` — v1 stays unsuffixed; v2+ appends `_v{n}` to the credit-pack ID |
| `--name <text>` | no | `"<Credits> Credit Pack"` |
| `--description <text>` | no | `"<Credits> credits to use in the app."` |
| `--review-screenshot <path>` | no | top-level `config.review_screenshot` |
| `--app-name <name>` | no | read from existing configs |
| `--bundle-id <id>` | no | iOS bundle ID override — use when no `Assets/appstore-config.json` yet |
| `--package-name <pkg>` | no | Android package name override — use when no `Assets/googleplay-config.json` yet |

**Idempotency:** safe to re-run. Play uses PATCH `?allowMissing=true` (upsert), ASC refreshes pricing on existing IAPs, Adapty pre-lists by title and skips matched.

---

## `adapty setup`

> **2.2.0:** `--config <file>` or `--yes` skips the "Continue?" question, and the run ends by reading every access level, product, paywall and placement back from Adapty (missing = FAILED, exit 1).

Sets up Adapty subscription products, paywalls, and placements using the [Adapty CLI](https://github.com/adaptyteam/adapty-cli).

```bash
kappmaker adapty setup
kappmaker adapty setup --config ./my-config.json
```

**Prerequisites:** Install (`npm install -g adapty`) and log in (`adapty auth login`).

### What it does (8 steps)

1. Validate CLI and authentication
2. Load config (from file or interactive prompts)
3. Find or create app (iOS + Android)
4. Create "Premium" access level
5. Create products
6. Create paywalls (linking products)
7. Create placements (linking paywalls)

### Default access levels

| sdk_id | Title | Used by |
|---|---|---|
| `Premium` | Premium | Subscriptions (Weekly + Yearly Premium) |
| `credit_pack_access` | Credit Pack Access | All 3 default credit pack products |

Subscriptions and consumable credit packs are routed to **separate access levels** — buying a credit pack does not unlock recurring premium features and vice versa. Each entry in `products[]` has an `access_level_sdk_id` that points to one of the access levels above; the orchestrator creates each access level once and links each product accordingly. Add more access levels in `Assets/adapty-config.json` if you need them.

Existing configs that use the legacy `access_level` (singular) field are auto-migrated to `access_levels` (plural) the next time you run `kappmaker adapty setup`.

### Default products

| Product | Period | Price | Access Level | iOS Product ID | Android Product ID | Android Base Plan ID |
|---------|--------|-------|--------------|----------------|--------------------|-----------------------|
| Weekly Premium | `weekly` | $6.99 | `Premium` | `{appname}.premium.weekly.v1.699.v1` | `{appname}.premium.weekly.v1` | `autorenew-weekly-699-v1` |
| Yearly Premium | `annual` | $29.99 | `Premium` | `{appname}.premium.yearly.v1.2999.v1` | `{appname}.premium.yearly.v1` | `autorenew-yearly-2999-v1` |
| Basic Credit Pack | `consumable` | $4.99 | `credit_pack_access` | `credit_pack_10_499_{appname}` | `credit_pack_10_499_{appname}` | _(none — IAP)_ |
| Pro Credit Pack | `consumable` | $9.99 | `credit_pack_access` | `credit_pack_30_999_{appname}` | `credit_pack_30_999_{appname}` | _(none — IAP)_ |
| Ultimate Credit Pack | `consumable` | $19.99 | `credit_pack_access` | `credit_pack_80_1999_{appname}` | `credit_pack_80_1999_{appname}` | _(none — IAP)_ |

iOS product IDs match the App Store Connect format, and Android IDs match what `kappmaker gpc setup` writes to Google Play Console — so all three systems link automatically without extra configuration. Credit packs (entries with a `credits` numeric field) get the consumable-IAP product ID format on both platforms; subscriptions get the `{appname}.premium.{period}.v1.x.v1` family.

> **Note on the `consumable` period:** the Adapty CLI v0.1.5 hardcodes a period whitelist (`weekly`, `monthly`, `two_months`, `trimonthly`, `semiannual`, `annual`, `lifetime`) that excludes `consumable`. The Adapty REST API does accept it, so KAppMaker creates credit pack products via a direct API call (using the auth token already cached at `~/.config/adapty/config.json`). Subscriptions and lifetime products still go through the CLI as before. If a future Adapty CLI release accepts `consumable`, this will become a no-op.

> **Note on prices in the Adapty dashboard:** the `price` field in `adapty-config.json` is used by KAppMaker to generate product IDs (e.g. `699` digits in `democli5.premium.weekly.v1.699.v1`) and to mirror prices into App Store Connect / Google Play Console — Adapty itself **does not accept developer-set prices** via its API. The `OPTIONS /products/` metadata explicitly says: _"Strips response to plan-specified fields (id, title, vendor_products)"_, and probing with seven different price-field shapes confirms they're all silently dropped. Prices appear in the Adapty dashboard only after you connect store integrations there (one-time, dashboard-only step):
>
> - **App Store Connect** — paste the same `.p8` / Key ID / Issuer ID you already have configured for `kappmaker create-appstore-app`
> - **Google Play** — upload the same service-account JSON used by `kappmaker gpc setup`
>
> Connect both at the Adapty dashboard → Settings → Integrations. The Adapty mobile SDK fetches prices directly from the native store APIs at runtime, so the in-app behaviour is correct even before you connect dashboard integrations — only the dashboard view is affected.

### Default paywalls and placements

| Paywall | Products | Placement | Developer ID |
|---------|----------|-----------|-------------|
| Default Paywall | Weekly + Yearly | Default | `default` |
| Onboarding Paywall | Weekly + Yearly | Onboarding | `onboarding` |
| Credits Paywall | Basic + Pro + Ultimate Credit Pack | Credits | `credits_pack` |

Fetch credit packs in app code with `Adapty.getPaywall("credits_pack")`.

| Flag | Description | Default |
|------|-------------|---------|
| `--config <path>` | Path to JSON config file | `./Assets/adapty-config.json` |

---
