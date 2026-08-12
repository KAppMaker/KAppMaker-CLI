---
name: kappmaker-gpc
description: Manage an app on Google Play Console (GPC) for Android — store listing, data safety, releases, subscriptions and in-app products. Use when the user mentions Google Play Console, GPC, the Play Store, an Android listing, data safety, or asks to configure or release the app on Google's side.
---

# KAppMaker — Google Play Console

## Before running any command

1. **Prerequisites** — `kappmaker --version` (install: `npm i -g kappmaker`). If a credential is
   missing the CLI says so; re-run `kappmaker config init`.
2. **Read `AiGuidelines/` first** — the PRD and positioning already answer most listing questions.
3. **Keywords are their own skill** — for what to put in the title, subtitle and keyword field, use
   **kappmaker-aso**.

### gpc — Google Play Console Management

**Syntax**:
- `kappmaker gpc setup [--config <path>]` — full 11-step flow (alias: `kappmaker create-play-app`)
- `kappmaker gpc listings push [--config <path>]` — push store listings only
- `kappmaker gpc subscriptions list [--package <pkg>] [--config <path>]`
- `kappmaker gpc subscriptions push [--config <path>]`
- `kappmaker gpc iap list [--package <pkg>] [--config <path>]`
- `kappmaker gpc iap push [--config <path>]`
- `kappmaker gpc monetization push [--config <path>] [--subscriptions-only] [--iap-only] [--recreate-stuck]` — push subscriptions + IAPs together (monetization steps of `gpc setup` as a standalone; idempotent PPP refresh)
- `kappmaker gpc data-safety push [--config <path>]`
- `kappmaker gpc app-check --package <pkg>`

**Prerequisites**:
- `googleServiceAccountPath` set in config (Google Play Developer API service account JSON)
- App MUST already exist in [Play Console](https://play.google.com/console/u/0/developers) — Google does not allow API-based app creation. If `gpc setup` gets a 404 at step 4, tell the user to create the app manually first, then rerun.
- No external CLI required — gpc talks directly to `androidpublisher.googleapis.com/v3` via Node's built-in `fetch` + `crypto` (service account → JWT → access token).

**Config file**: Looks for `./Assets/googleplay-config.json`. If not found, `gpc setup` prompts interactively; other subcommands fail and tell the user to run `gpc setup` first.

**What `gpc setup` does** (11 steps):
1. Validate service account + obtain access token
2. Load config (file or interactive prompts)
3. Review summary + confirm
4. Verify app exists on Play Console (fails fast with deep link if not)
5. Update app details (default language + contact website/email/phone) inside an edit
6. Update store listings per locale (title, short/full description, video)
7. Commit the edit
8. Create subscriptions via the new monetization API (subscription → base plans → activate) — idempotent
9. Create one-time in-app products via the **new** `monetization.onetimeproducts.*` API (`PATCH /onetimeproducts/{id}?allowMissing=true` + `purchaseOptions:batchUpdateStates` to activate). Idempotent. Replaces the legacy `/inappproducts` endpoint that Google rejects with 403 "Please migrate to the new publishing API" on migrated apps.
10. Update data safety declaration: converts user's `data_safety.answers` JSON → Google's CSV format via a bundled canonical template + KAppMaker defaults matching the iOS App Store privacy set. Respects `data_safety_csv_path` as an escape hatch for pre-exported CSVs.
11. Print warnings for Play Console-only items (content rating / IARC, app pricing tier)

**Product ID formats**:
- ASC / iOS subscription: `{appname}.premium.{period}.v1.{price}.v1` (e.g. `myapp.premium.weekly.v1.699.v1`)
- Play / Android subscription `productId`: `{appname}.premium.{period}.v1` (e.g. `myapp.premium.weekly.v1`)
- Play / Android `basePlanId`: `autorenew-{period}-{priceDigits}-v1` (e.g. `autorenew-weekly-699-v1`)
- Subscription title (shown on Play checkout): `{AppName} Premium {PeriodLabel}` (e.g. `MyApp Premium Weekly`)
- **Credit packs (one-time IAP)** — same ID on ASC + Play + Adapty: `credit_pack_{credits}_{priceDigits}_{appname}` (e.g. `credit_pack_10_499_myapp`)

All three systems (ASC, Play, Adapty) use the same generator so the IDs align automatically without extra configuration.

**Default credit pack IAPs** ship in `Assets/googleplay-config.json` (and the parallel ASC/Adapty templates): Basic 10/$4.99, Pro 30/$9.99, Ultimate 80/$19.99. Auto-fill triggers on `in_app_products[]` entries with a `credits` numeric field. Step 9 of `gpc setup` calls `setupInAppProducts` against the new monetization API to create them.

**Per-region PPP pricing (1.6.0+)**: both subscriptions and one-time products are fanned out to every billable Play region (~140 of the ~175 ISO codes; sanctioned countries like AF/IR/KP/SY are auto-excluded via `convertRegionPrices`) with purchasing-power-parity-adjusted USD prices. Multiplier table (Steam/Spotify-inspired, sourced from [iosdevmax/ppp-pricing](https://github.com/iosdevmax/ppp-pricing) — MIT) lives at `src/data/ppp-tiers.ts`; helper at `src/services/ppp-pricing.service.ts`. India ≈ 0.35×, Argentina/Pakistan/Egypt ≈ 0.30×, US/CA/EU base 1.00×, Switzerland/Norway 1.10×; rounded to .99 endings. User-listed regions in `regional_configs` win; PPP fills the rest. Per-product opt-out via `"ppp_enabled": false`. Run `npm run test:ppp` to smoke-test.

**Re-run updates existing products (1.6.1+)**: when an existing product is hit, the CLI PATCHes it with the new pricing instead of skipping — back-fills PPP regional pricing onto products created by earlier CLI versions.

**Billable-region filter (1.6.2+)**: HTTP 400 _"Region code X is not billable at the specified regions version 2022/02"_ is fixed in 1.6.2 — upgrade if a user reports it. The CLI now queries `convertRegionPrices` once per setup run to fetch the authoritative billable region list and filters PPP fan-out to that set.

**Native-currency PPP (1.6.3+)**: HTTP 400 _"Invalid currency for region code AE: expected AED but got USD"_ is fixed in 1.6.3 — upgrade if a user reports it. PPP fan-out now sends prices in each region's native currency (AED for AE, JPY for JP, INR for IN, etc.) by using Google's `convertRegionPrices` for FX, then applying the PPP multiplier in local currency with currency-appropriate charm rounding (X.99 for decimal currencies, X99/X9/integer for zero-decimal currencies like JPY/KRW/VND).

**Two pricing modes (1.6.4+)**: each base plan / one-time product carries `ppp_enabled?: boolean` (default `true`).
- `ppp_enabled: true` → explicit per-region PPP via `convertRegionPrices` + native-currency entries (current default; ~150 regions per product).
- `ppp_enabled: false` → fall back to `otherRegionsConfig` (subs) / `newRegionsConfig` (one-time products) with USD + EUR anchors. Google auto-fans-out via its FX pricing template — every billable region gets a price, no PPP discounting. Smaller payload. Tell users this is the right pick if they want uniform USD-anchor pricing without PPP discounts. **Important**: Google requires BOTH `usdPrice` and `eurPrice` Money objects (HTTP 400 if either is missing) — 1.6.4 derives both from the user's USD anchor (mirroring USD value as EUR anchor unless an explicit EUR entry is in `regional_configs`).

**Proto3 partial-Money fix (1.6.6+)** — if a user reports HTTP 400 _"Invalid value at '...price.units' (TYPE_INT64), 'NaN'"_, upgrade to 1.6.6. Google's JSON response omits `Money.units` when it's `0` (proto3 default-value omission); the CLI now normalizes incoming Money payloads at the boundary so missing `units`/`nanos` default to `"0"`/`0` instead of propagating `NaN`.

**Post-PATCH verification + diagnostic message (1.6.9+)** — when a user reports "products still show USA only in Play Console" after a successful API run, check the `Stored on Google: X/Y regions available` lines in the CLI output. If `Y` is high (e.g., 167), the data IS saved on Google's side and the user is hitting Play Console UI lag OR app-level country availability (Production track → Country availability — the app itself must be released in those countries). 1.6.9 prints a diagnostic checklist at the end of `setupSubscriptions` / `setupInAppProducts` covering all four scenarios. Also fixes `activateBasePlan` body (was sending `{}` instead of the required `packageName/productId/basePlanId/latencyTolerance` fields).

**Existing-region preservation (1.6.10+)** — if a user reports HTTP 400 _"Regional configs were removed from the base plan: X, Y, Z"_ (or _"...from the purchase option"_), upgrade to 1.6.10. The cause: Google considers regional configs sticky at the per-region level — once a product has stored a config for `X`, every subsequent PATCH must include `X` or Google rejects. 1.6.10 reads existing state first via `fetchExistingSubscriptionState` / `fetchExistingOneTimeProductState` (one GET per product), then echoes every previously-stored region for regions not already in the fresh PPP fan-out.

**Currency override approach + NEVER_BILLABLE (1.6.11+)** — 1.6.10's drop-and-mark-unavailable approach was wrong. Drift regions (except MN) ARE billable at `regionsVersion=2022/02` — just under a different currency than the live `convertRegionPrices` API returns. 1.6.11+ overrides the currency inline in the fresh fan-out via `applyCurrencyOverrideFor2022_02`:

| Region | Live API | 2022/02 expects | Fix |
|---|---|---|---|
| BG | EUR | BGN | Convert EUR → BGN via the 1 EUR = 1.95583 BGN peg |
| HR | EUR | EUR ✓ | None (Google updated 2022/02 retroactively) |
| CI / CM / SN | XOF / XAF | USD | Replace with USD anchor; PPP still applies on top |
| MN | billable | NOT BILLABLE | In `NEVER_BILLABLE_AT_2022_02`; skipped entirely |

Net result on legacy products with all 5 drift regions stored: 173/173 regions AVAILABLE instead of 168/173 force-unavailable. Google's storage layer auto-converts the submitted currency to each region's actual display currency.

For genuinely unfixable products (an existing product has MN or another `NEVER_BILLABLE` region stored on it), the CLI surfaces a "stuck" warning + 3 fix options:
1. Bump `product_id` in config — recommended; no downtime
2. `--recreate-stuck` flag — DELETE+recreate, but Google holds the ID in soft-delete reservation for a few minutes to hours afterwards
3. Manually delete on Play Console UI, wait, re-run

**"New countries" availability (1.6.11+)** — one-time products' `newRegionsConfig` is now ALWAYS set to `availability: AVAILABLE` (was previously only set when `ppp_enabled: false`). Mirrors what subscriptions do via `otherRegionsConfig`. Future regions Google adds get auto-priced from the USD/EUR anchor.

**Two regionsVersion 2022/02 drift error patterns + session cache (1.6.8+)** — if a user reports either HTTP 400 _"Invalid currency for region code X: expected Y but got Z"_ OR _"Region code X is not billable at the specified regions version 2022/02"_, upgrade to 1.6.8. The CLI now:
- Preseeds `KNOWN_2022_02_DRIFT_REGIONS = {BG, HR, CI, CM, MN}` (Bulgaria, Croatia — Eurozone; Ivory Coast, Cameroon — CFA franc; Mongolia — not billable).
- Parses BOTH `Invalid currency for region code X` AND `Region code X is not billable` from 400 responses via `extractDriftRegions`.
- Maintains a `sessionDriftCache` per package so once a region is discovered as drifted on product N, products N+1, N+2, ... skip it up front.
- Retries each PATCH up to 5× with progressively larger exclude set.

Result: the user sees `Subscription/IAP updated (dropped K drift regions: BG, HR, CI, CM, MN)` instead of cascading errors. If Romania or Czech Republic joins the Eurozone in the future and Google's API drifts again, the auto-retry catches it on the first run without any CLI update.

**Three PATCH gotchas fixed in 1.6.5** — upgrade if any of these errors surface:
1. _"expanded $X.XX to 0 regions"_ — `convertRegionPrices` response shape mismatch (field is `price`, not `regionPrice`).
2. _"is missing the other regions config, which is now required since it has been previously set"_ — subscriptions: `otherRegionsConfig` is sticky once set; every PATCH must include it. 1.6.5 always includes it when a USD anchor exists.
3. _"Product must list all of its existing purchase options. Missing: buy"_ — one-time products: legacy products used `purchaseOptionId: "buy"`, not `"default"`. 1.6.5 GETs the existing product first and reuses its actual purchase option ID.

If a user reports "products only show in US + Mongolia / Nigeria / etc." they're on a version older than 1.6.0 that relied on Google's `otherRegionsConfig` / `newRegionsConfig` auto-conversion (which fanned out unreliably). Upgrade to 1.6.0+ — explicit per-region pricing replaces it.

If a user reports HTTP 400 _"Unknown name 'otherRegionsConfig' at 'one_time_product.purchase_options[0]': Cannot find field"_ they're on a version older than 1.5.2.

**When to use individual subcommands instead of `setup`**:
- User changed listing copy → `gpc listings push`
- User tweaked subscription or IAP prices (or wants full PPP refresh) → `gpc monetization push` (does both) or individual `gpc subscriptions push` / `gpc iap push`
- User updated data safety form → `gpc data-safety push`
- CI pre-check that the app exists → `gpc app-check --package <pkg>` (exits 0 or 2)

**Tip**: Before running `gpc setup`, help the user review or create `Assets/googleplay-config.json`. Read the existing config and explain each section (app, details, listings, subscriptions, in_app_products, data_safety). The user can edit it before running.

**Data safety schema**: The `data_safety` JSON block uses KAppMaker defaults: no account creation (`PSL_ACM_NONE`), data deletion question omitted (optional), collects Device ID + Crash logs + Diagnostics + Other performance + App interactions (only — not "Other app activity"), all processed **ephemerally**, collection **required** (users can't turn it off), collected only (not shared), encrypted in transit. Users can override specific answers via `data_safety.answers` with keys like `"QuestionID"` or `"QuestionID/ResponseID"` and values `true`/`false`/`"URL"`/`null`. Escape hatch: `data_safety_csv_path` uploads a pre-filled CSV from Play Console → Policy → App content → Data safety → Export to CSV.

**Manual-only declarations**: The Play Publisher API does NOT expose content rating (IARC), target audience, ads declaration, health apps, financial features, government apps, news apps, gambling, COVID-19 tracing, app access (login walls), advertising ID usage, families compliance, or app pricing tier. Step 11 of `gpc setup` prints a checklist with a deep link to the Play Console App content page for the user to tick these off manually. No API workaround exists.

---
