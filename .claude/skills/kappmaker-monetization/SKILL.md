---
name: kappmaker-monetization
description: Add and manage the subscription and in-app purchase PRODUCTS for a KAppMaker app on App Store Connect and Google Play, including credit packs and pricing. Use when the user asks to add a subscription, add an IAP, add credit packs or change pricing. For the subscription provider's own dashboard use kappmaker-adapty.
---

# KAppMaker — Monetization

## Before running any command

1. **Prerequisites** — `kappmaker --version` (install: `npm i -g kappmaker`). If a credential is
   missing the CLI says so; re-run `kappmaker config init`.
2. **Read `AiGuidelines/` first** — the PRD, positioning and UI spec already answer most questions.

## The provider is a separate skill

This skill covers the products. Wiring them to a provider's dashboard and SDK is that provider's
skill — today **kappmaker-adapty** (RevenueCat will slot in the same way).


### Quick-add Subscription / IAP — One new product, no config edit

For iterating on a live app after the initial setup is done. Instead of editing `Assets/{googleplay,appstore,adapty}-config.json` and re-running the full flow, these add ONE product end-to-end and push to all relevant stores in one command.

**Trigger phrases**:
- "add a new weekly subscription at $9.99"
- "create a $19.99 monthly subscription for iOS only"
- "add a 50-credit pack for $14.99"
- "create a v2 yearly subscription"

**Two commands**:

`kappmaker subscription add --period <slug> --price <usd>` — Play + ASC. Adapty is intentionally NOT included (Adapty pulls live store prices at runtime via integrations, so adding an entry adds noise without unlocking anything).

`kappmaker iap add --credits <n> --price <usd>` — Play + ASC + Adapty. Adapty IS included for credit packs because they use the `credit_pack_access` access level to gate consumable entitlements (no store-side equivalent).

**Common flags** (both commands):

| Flag | Default | Notes |
|---|---|---|
| `--platform` | `all` | `all` / `ios` / `android`. `iap add` includes Adapty only in `all`. |
| `--product-version <n>` | `1` | Bumps every `v` marker in the IDs. For subs: `--product-version 2` → `myapp.premium.weekly.v2.999.v2` + `myapp.premium.weekly.v2` + `autorenew-weekly-999-v2`. For IAPs: v1 stays unsuffixed; v2+ appends `_v2` to the credit-pack ID. (Named `--product-version` rather than `--version` to avoid clashing with Commander's root `kappmaker --version`.) |
| `--bundle-id <id>` | from configs | iOS bundle ID override — use when `Assets/appstore-config.json` doesn't exist yet. |
| `--package-name <pkg>` | from configs | Android package name override — use when `Assets/googleplay-config.json` doesn't exist yet. |
| `--name <text>` | derived | Localized display name. Subs default to `"<AppName> Premium <Period>"`, IAPs default to `"<credits> Credit Pack"`. |
| `--description <text>` | derived | Subs: period-derived (e.g. `weekly → "Full access for one week."`). IAPs: `"<credits> credits to use in the app."`. |
| `--review-screenshot <path>` | top-level `review_screenshot` | Apple required — without one, products stay in `MISSING_METADATA`. |
| `--app-name <name>` | from configs | Override if no config exists yet. |

**Subscription-only flags**:

| Flag | Default | Notes |
|---|---|---|
| `--period <slug>` | required | `weekly` / `monthly` / `twomonths` / `quarterly` / `semiannual` / `yearly` |
| `--price <number>` | required | USD anchor; PPP fans the rest |
| `--group <ref>` | first group in `appstore-config.json` | If the ref doesn't exist on ASC, it's auto-created |
| `--group-name <text>` | inherits from config group's `localizations[0].name`, else `"Premium Access"` | Used only when auto-creating a new group |

**IAP-only flags**:

| Flag | Default | Notes |
|---|---|---|
| `--credits <number>` | required | Positive integer |
| `--price <number>` | required | USD anchor; PPP fans the rest |

**What it creates**:
- Auto-aligned product IDs across stores following the alignment table in `CLAUDE.md` (`{appname}.premium.<period>.v<N>.<priceDigits>.v<N>` for ASC, `{appname}.premium.<period>.v<N>` for Play product + `autorenew-<period>-<priceDigits>-v<N>` for base plan).
- Full PPP fan-out across ~155 ASC territories (via `asc subscriptions pricing prices import` CSV) and ~173 Play billable regions (via `convertRegionPrices` + native-currency entries).
- en-US listing/localization on both stores.
- Review screenshot upload on ASC (resized to 1290 × 2796 if needed).
- For new ASC subscription groups: auto-created with proper en-US localization so the App Store UI shows the right group name.

**Idempotency**: safe to re-run. Existing products are PATCHed (Play) or report `"already exists — refreshing pricing"` (ASC) and re-apply the full PPP fan-out. To stand up a separate v2 line, use `--product-version 2`.

**When to use vs. the full flow**:
- Use **`subscription add` / `iap add`** when iterating on an existing app — adding one more price point, launching a v2, or replacing stuck legacy products.
- Use **`create-appstore-app` / `gpc setup`** for initial setup with the full canonical product set, or when you need multi-locale, intro offers, or custom regional pricing overrides that aren't covered by the quick-add flags.

**Not yet supported via flags** (require editing the JSON config):
- Free trials / intro offers
- Multi-locale listings
- Custom per-territory price overrides (PPP covers the common case)

---

## Where this sits in the flow

- **Before this:** **kappmaker-asc** and/or **kappmaker-gpc** — products need the store app record to exist first.
- **After this:** **kappmaker-adapty** to wire the products to the provider.
