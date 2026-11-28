---
name: kappmaker-gpc
description: Manage an app on Google Play Console (GPC) for Android (store listing, data safety, releases, subscriptions and in-app products). Use when the user mentions Google Play Console, GPC, the Play Store, an Android listing, data safety or releases.
---

# KAppMaker: Google Play Console

## Before running any command

1. **Prerequisites**: `kappmaker --version` (install: `npm i -g kappmaker`). If a credential is
   missing the CLI says so; re-run `kappmaker config init`.
2. **Read `AiGuidelines/` first**: the PRD, positioning and UI spec already answer most questions.


### gpc: Google Play Console Management

**Syntax**:
- `kappmaker gpc setup [--config <path>] [--yes] [--allow-empty] [--regions-version <v>]`: full 11-step flow (alias: `kappmaker create-play-app`)
- `kappmaker gpc listings push [--config <path>] [--yes] [--allow-empty]`: push store listings only (merged with the live listing, diff shown, read back)
- `kappmaker gpc subscriptions list [--package <pkg>] [--config <path>]`
- `kappmaker gpc subscriptions push [--config <path>] [--regions-version <v>]`
- `kappmaker gpc iap list [--package <pkg>] [--config <path>]`
- `kappmaker gpc iap push [--config <path>] [--recreate-stuck] [--regions-version <v>]`
- `kappmaker gpc monetization push [--config <path>] [--subscriptions-only] [--iap-only] [--recreate-stuck] [--regions-version <v>]`: push subscriptions + IAPs together (monetization steps of `gpc setup` as a standalone; idempotent PPP refresh)
- `kappmaker gpc data-safety push [--config <path>] [--verify]`
- `kappmaker gpc app-check --package <pkg>`

**Prerequisites**:
- `googleServiceAccountPath` set in config (Google Play Developer API service account JSON)
- App MUST already exist in [Play Console](https://play.google.com/console/u/0/developers): Google does not allow API-based app creation. If `gpc setup` gets a 404 at step 4, tell the user to create the app manually first, then rerun.
- No external CLI required: gpc talks directly to `androidpublisher.googleapis.com/v3` via Node's built-in `fetch` + `crypto` (service account → JWT → access token).

**Fails loudly (CLI 2.2.0+)**: every Play API error stops the command with the HTTP status and
Google's error body (exit 1). Older versions printed OK on a data safety HTTP 400. `gpc setup` ends
with a step summary that lists each FAILED step. Never report a step as done from the output alone:
read the summary.

**Non-interactive**: `--yes`, or `--config <file>` (the file holds the answers), answers every
confirmation that does not clear data. Piped answers (`printf 'y\n' | ...`) are read in order.

**Listings never get blanked**: Play's listing PUT replaces the whole listing, so the CLI starts from
the live listing and overlays only the fields the config fills in. Empty config fields are skipped.
Clearing a live field needs `--allow-empty` (and a yes at a terminal). The listing is read back
inside the edit before commit; a mismatch drops the edit. The app name is used as a title only where
Play has no title yet.

**Data safety**: `--verify` checks the declaration row by row against Play's question set (typos in
answer keys fail before anything is sent) and prints the data types Play now declares. Play has no
API to read the form back, so the CLI says so and the user should glance at Play Console once.

**Config file**: Looks for `./Assets/googleplay-config.json`. If not found, `gpc setup` prompts interactively; other subcommands fail and tell the user to run `gpc setup` first.

**What `gpc setup` does** (11 steps):
1. Validate service account + obtain access token
2. Load config (file or interactive prompts)
3. Review summary + confirm
4. Verify app exists on Play Console (fails fast with deep link if not)
5. Update app details (default language + contact website/email/phone) inside an edit
6. Update store listings per locale (title, short/full description, video)
7. Commit the edit
8. Create subscriptions via the new monetization API (subscription → base plans → activate): idempotent
9. Create one-time in-app products via the **new** `monetization.onetimeproducts.*` API (`PATCH /onetimeproducts/{id}?allowMissing=true` + `purchaseOptions:batchUpdateStates` to activate). Idempotent. Replaces the legacy `/inappproducts` endpoint that Google rejects with 403 "Please migrate to the new publishing API" on migrated apps.
10. Update data safety declaration: converts user's `data_safety.answers` JSON → Google's CSV format via a bundled canonical template + KAppMaker defaults matching the iOS App Store privacy set. Respects `data_safety_csv_path` as an escape hatch for pre-exported CSVs.
11. Print warnings for Play Console-only items (content rating / IARC, app pricing tier)

**Product ID formats**:
- ASC / iOS subscription: `{appname}.premium.{period}.v1.{price}.v1` (e.g. `myapp.premium.weekly.v1.699.v1`)
- Play / Android subscription `productId`: `{appname}.premium.{period}.v1` (e.g. `myapp.premium.weekly.v1`)
- Play / Android `basePlanId`: `autorenew-{period}-{priceDigits}-v1` (e.g. `autorenew-weekly-699-v1`)
- Subscription title (shown on Play checkout): `{AppName} Premium {PeriodLabel}` (e.g. `MyApp Premium Weekly`). This is `gpc setup`'s convention: the quick-add `subscription add` names its Play listing `{AppName} {Period} Premium` instead (see kappmaker-monetization).
- **Credit packs (one-time IAP)**: same ID on ASC + Play + Adapty: `credit_pack_{credits}_{priceDigits}_{appname}` (e.g. `credit_pack_10_499_myapp`)

All three systems (ASC, Play, Adapty) use the same generator so the IDs align automatically without extra configuration.

**Default credit pack IAPs** ship in `Assets/googleplay-config.json` (and the parallel ASC/Adapty templates): Basic 10/$4.99, Pro 30/$9.99, Ultimate 80/$19.99. Auto-fill triggers on `in_app_products[]` entries with a `credits` numeric field. Step 9 of `gpc setup` calls `setupInAppProducts` against the new monetization API to create them.

**Per-region PPP pricing**: subscriptions and one-time products fan out to every billable Play
region with purchasing-power-parity prices in each region's native currency (India ≈ 0.35x,
Argentina ≈ 0.30x, US/EU 1.00x, charm-rounded). User-listed regions in `regional_configs` win;
PPP fills the rest; per-product opt-out via `"ppp_enabled": false` (every billable region still gets
an explicit price, by plain currency conversion of the USD price: no PPP discount). Every product is
read back and reported as `N of M regions priced`; a product short of M makes the command exit 1.

**regionsVersion**: default `2026/01` (CLI 2.2.0+; it was hardcoded `2022/02`, which made ET
unbillable and left one app priced in 3 regions). Override with `--regions-version` or
`kappmaker config set playRegionsVersion <v>`. The 2022/02 currency workarounds below apply only when
someone asks for 2022/02. Re-runs PATCH existing products, so
running setup again back-fills regional pricing onto products created by older CLI versions.

**Pricing/region errors: quick map.** These all have known causes and fixed versions; the full
mechanics live in `references/pricing-history.md` (read it when one of these fires):

| Error / symptom | Meaning | Fix |
|---|---|---|
| "Region code X is not billable at … 2022/02" | region-catalog drift | upgrade ≥1.6.8; auto-retried |
| "Invalid currency for region code X: expected Y" | native-currency drift (BG/HR/CI/CM) | upgrade ≥1.6.11; auto-overridden |
| "Regional configs were removed from the base plan" | Google treats stored regions as sticky | upgrade ≥1.6.10; existing regions echoed |
| "…price.units (TYPE_INT64), 'NaN'" | proto3 omits zero `Money.units` | upgrade ≥1.6.6 |
| "expanded $X to 0 regions" / "missing the other regions config" / "Missing: buy" | three PATCH gotchas | upgrade ≥1.6.5 |
| Products show "USA only" in Play Console after a successful run | Console UI lag OR app-level country availability | check the `Stored on Google: X/Y regions` output line; if Y is high, it saved: see the diagnostic checklist the CLI prints |
| Product stuck with a never-billable region (MN) stored on it | unfixable in place | bump `product_id` (recommended), or `--recreate-stuck` (soft-delete reservation delay), or delete in Console UI |

**When to use individual subcommands instead of `setup`**:
- User changed listing copy → `gpc listings push`
- User tweaked subscription or IAP prices (or wants full PPP refresh) → `gpc monetization push` (does both) or individual `gpc subscriptions push` / `gpc iap push`
- User updated data safety form → `gpc data-safety push`
- CI pre-check that the app exists → `gpc app-check --package <pkg>` (exits 0 or 2)

**Tip**: Before running `gpc setup`, help the user review or create `Assets/googleplay-config.json`. Read the existing config and explain each section (app, details, listings, subscriptions, in_app_products, data_safety). The user can edit it before running.

**Data safety schema**: The `data_safety` JSON block uses KAppMaker defaults: no account creation (`PSL_ACM_NONE`), data deletion question omitted (optional), collects Device ID + Crash logs + Diagnostics + Other performance + App interactions (only these, not "Other app activity"), all processed **ephemerally**, collection **required** (users can't turn it off), collected only (not shared), encrypted in transit. Users can override specific answers via `data_safety.answers` with keys like `"QuestionID"` or `"QuestionID/ResponseID"` and values `true`/`false`/`"URL"`/`null`. Escape hatch: `data_safety_csv_path` uploads a pre-filled CSV from Play Console → Policy → App content → Data safety → Export to CSV.

**Manual-only declarations**: The Play Publisher API does NOT expose content rating (IARC), target audience, ads declaration, health apps, financial features, government apps, news apps, gambling, COVID-19 tracing, app access (login walls), advertising ID usage, families compliance, or app pricing tier. Step 11 of `gpc setup` prints a checklist with a deep link to the Play Console App content page for the user to tick these off manually. No API workaround exists.

---

## Where this sits in the flow

- **Before this:** **kappmaker-new-app** (package name comes from the project).
- **After this:** **kappmaker-aso-metadata** for listing text, **kappmaker-screenshots**, **kappmaker-feature-graphic**, then **kappmaker-publish**.
