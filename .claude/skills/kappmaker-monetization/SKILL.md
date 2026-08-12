---
name: kappmaker-monetization
description: Set up subscriptions and in-app purchases for a KAppMaker app — Adapty configuration, and quick-adding a single subscription or credit-pack IAP to an existing app. Use when the user asks about subscriptions, in-app purchases, IAP, credit packs, paywall products or Adapty.
---

# KAppMaker — Monetization

## Before running any command

1. **Prerequisites** — `kappmaker --version` (install: `npm i -g kappmaker`). If a credential is
   missing the CLI says so; re-run `kappmaker config init` to add it.
2. **Read the project's own docs first** — `AiGuidelines/` holds the PRD, user flow and UI spec for
   this app. Never invent product decisions the docs already answer.
3. **In-project work has its own playbook** — check `<project>/.claude/skills/README.md` before
   hand-rolling anything.


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

### adapty setup — Subscription Management

**Syntax**: `kappmaker adapty setup [--config <path>]`

**Prerequisites**:
- `adapty` CLI installed (`which adapty`; auto-installs via npm if missing)
- Adapty authentication (CLI handles via browser OAuth)

**Config file**: Looks for `./Assets/adapty-config.json`. If not found, prompts interactively.
- Global defaults at `~/.config/kappmaker/adapty-defaults.json` are used as base layer.

**What it does** (8 steps): Create/find app, set access level, create products (with iOS/Android IDs), create paywalls, create placements.

**Product ID format**: Aligned with App Store Connect AND Google Play Console so Adapty links them across all three systems automatically.

For subscriptions: `ios_product_id` = `{appname}.premium.{period}.v1.{price}.v1`, `android_product_id` = `{appname}.premium.{period}.v1`, `android_base_plan_id` = `autorenew-{period}-{priceDigits}-v1`. Routed to access level `Premium`.

For credit pack IAPs (entries with `credits` field): `ios_product_id` = `android_product_id` = `credit_pack_{credits}_{priceDigits}_{appname}`. `android_base_plan_id` is left empty (IAPs have no base plan). **Period is `consumable`** and the product is routed to a separate `credit_pack_access` access level (so buying a credit pack does not grant the recurring `Premium` entitlement).

**Adapty CLI consumable-period workaround**: the Adapty CLI v0.1.5 hardcodes a period whitelist that excludes `consumable`. KAppMaker bypasses this for credit packs by hitting Adapty's REST API directly (using the auth token cached at `~/.config/adapty/config.json` or `ADAPTY_TOKEN` env var). Subscriptions and lifetime products still go through the CLI. No user-visible difference; just a transparent fallback.

**Prices are not developer-set in Adapty**: the `price` field in `Assets/adapty-config.json` only drives ID generation (and mirrors into ASC/GPC). Adapty's developer API explicitly strips price fields from product creation — verified via OPTIONS metadata ("Strips response to plan-specified fields (id, title, vendor_products)"). Prices appear in the Adapty dashboard only after the user connects App Store Connect and Google Play integrations there (dashboard-only step; not exposed via CLI/API). When users complain that prices are missing in Adapty, point them to: Adapty dashboard → Settings → Integrations → connect ASC (paste the same `.p8` / Key ID / Issuer ID they used for `kappmaker create-appstore-app`) and Google Play (upload the same service-account JSON used by `kappmaker gpc setup`). The mobile Adapty SDK already shows correct prices in-app — it fetches them from native store APIs at runtime regardless of dashboard state.

**Multi-access-level config shape**: `access_levels: [...]` (plural) replaces the legacy single `access_level`. Each product has an `access_level_sdk_id` field linking it to one of the access levels. Existing configs with the legacy field auto-migrate on load.

**Default Credits Paywall + placement**: The Adapty template ships with a `Credits Paywall` containing the 3 default credit packs and a `Credits` placement (developer_id `credits_pack`). App code fetches it with `Adapty.getPaywall("credits_pack")`.

**Idempotent re-runs**: `adapty setup` lists existing products / paywalls / placements first and skips ones already present. Safe to rerun at any time.

**Prerequisite ordering**: If the user wants Adapty on Android, the Play Console products must exist first. The `create` orchestrator handles this automatically (step 8 runs `gpc setup` before step 9 runs Adapty), but if invoked standalone, tell the user to run `kappmaker gpc setup` (or at least `gpc subscriptions push`) before `kappmaker adapty setup`.

---
