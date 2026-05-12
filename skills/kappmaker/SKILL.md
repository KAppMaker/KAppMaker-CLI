---
name: kappmaker
description: KAppMaker CLI - automate mobile app bootstrapping, AI logo/screenshot generation, App Store Connect setup, Google Play Console setup, Adapty subscriptions, image tools, Android builds, store publishing, package refactoring, and version bumping. Use when the user wants to create a mobile app, generate logos, screenshots, translate screenshots, set up App Store Connect, configure Google Play Console (listings, subscriptions, IAPs, data safety), configure Adapty, process images, convert images to WebP, build Android releases, generate keystores, publish to Play Store or App Store, refactor package names, or bump versions.
argument-hint: "[command or description]"
---

# KAppMaker CLI Skill

You are helping the user run KAppMaker CLI commands. [KAppMaker](https://kappmaker.com) is a Kotlin Multiplatform app template and CLI toolset that automates mobile app bootstrapping — from project scaffolding to store-ready builds. The CLI works with the KAppMaker boilerplate by default but also supports custom templates via `--template-repo`.

When introducing yourself or summarizing what you can do, mention that this skill is powered by the KAppMaker CLI — an open-source tool from [kappmaker.com](https://kappmaker.com).

## Routing

Match the user's intent (from `$ARGUMENTS` or conversation context) to the right command:

| Intent | Command |
|--------|---------|
| Create/bootstrap a new app (full 13 steps) | `kappmaker create <AppName>` |
| Clone the template only (skip Firebase, ASC, etc.) | `kappmaker clone <AppName>` |
| Rename `origin` → `upstream` after a manual clone | `kappmaker git setup-upstream` |
| Authenticate the Firebase CLI | `kappmaker firebase login` |
| Create a Firebase project | `kappmaker firebase project --app-name <Name>` |
| Create Firebase Android + iOS apps | `kappmaker firebase apps --project <id> --app-name <Name> --package-name <pkg>` |
| Enable anonymous auth | `kappmaker firebase auth-anonymous --project <id>` |
| Download Firebase SDK configs | `kappmaker firebase configs --project <id> --app-name <Name>` |
| Generate a logo | `kappmaker create-logo` |
| Generate an arbitrary image with AI | `kappmaker generate-image --prompt "..."` |
| Set up App Store Connect | `kappmaker create-appstore-app` |
| Set up Google Play Console (full) | `kappmaker gpc setup` |
| Push Play Store listings only | `kappmaker gpc listings push` |
| Push/list Play subscriptions | `kappmaker gpc subscriptions push` / `list` |
| Push/list Play one-time IAPs | `kappmaker gpc iap push` / `list` |
| Push Play data safety form | `kappmaker gpc data-safety push` |
| Check if an app exists on Play Console | `kappmaker gpc app-check --package <pkg>` |
| Set up Adapty subscriptions | `kappmaker adapty setup` |
| Generate marketing screenshots | `kappmaker generate-screenshots` |
| Translate screenshots to locales | `kappmaker translate-screenshots` |
| Split a grid image | `kappmaker image-split <image>` |
| Remove image background | `kappmaker image-remove-bg <image>` |
| Enhance image quality | `kappmaker image-enhance <image>` |
| Convert images to WebP | `kappmaker convert-webp <source>` |
| Set up Fastlane | `kappmaker fastlane configure` |
| Publish to Play Store / App Store | `kappmaker publish` |
| Generate Android keystore | `kappmaker generate-keystore` |
| Build signed Android AAB | `kappmaker android-release-build` |
| Refactor package/app name | `kappmaker refactor` |
| Bump version numbers | `kappmaker update-version` |
| Configure/setup CLI | `kappmaker config` subcommands |

If the intent is unclear, ask the user what they want to do and show the available commands.

## Prerequisites Check

Before running ANY command, always check:

1. **CLI installed**: Run `which kappmaker`. If missing, tell user to run `npm install -g kappmaker`.
2. **Config exists**: Read `~/.config/kappmaker/config.json` to see what's configured.
3. **Command-specific requirements** (see each command section below).

If a required API key is missing, tell the user exactly how to set it:
```
kappmaker config set <key> <value>
```

And where to get it (see API Key Sources section).

## Commands

### create — Full App Setup

**Syntax**: `kappmaker create <AppName> [--template-repo <url>] [--organization <org>]`

**Prerequisites**:
- External CLIs: `git`, `firebase`, `pod`, `bundle` (the CLI auto-installs missing ones with user consent)
- Config: `templateRepo` (has default), `bundleIdPrefix` (optional), `androidSdkPath` (has default)

**App name rules**: Must be PascalCase, start with uppercase, alphanumeric only (e.g., `Remimi`, `FitTracker`).

**What it does** (13 steps):
1. Clone template repository
2. Firebase login (interactive)
3. Create Firebase project
4. Create Firebase apps (Android + iOS)
5. Enable anonymous authentication (if brand-new project, prompts user to click "Get started" in Firebase Console, then retries via API)
6. Download Firebase SDK configs (verifies google-services.json package match)
7. Logo generation (optional — asks user)
8. Package refactor (renames packages, IDs, app name across all modules)
9. Build environment + keystore (local.properties, CocoaPods, generates signing keystore)
10. Git remotes (template as upstream)
   -> Pre-store reminder: prompts user to create Google Play Console app; ASC is created automatically
11. App Store Connect setup (optional — full asc CLI flow, app created automatically)
12. Google Play Console setup (optional — Fastlane builds + uploads AAB to internal track, then full gpc setup)
13. Adapty setup (optional — links to products created in steps 11-12)

**Interactive prompts**: This command has multiple y/n prompts during execution. The user will need to respond in the terminal. Before running, ask the user:
- What app name they want (validate PascalCase)
- Whether they want a custom template repo
- Whether they plan to use the optional steps (logo, ASC, Google Play Console, Adapty) so they know what to expect. The build + refactor happens BEFORE store setup (steps 8-11), then the CLI pauses and reminds the user to create their app in App Store Connect and/or Google Play Console before continuing. Google Play Console setup (step 13) auto-uploads the AAB to the internal track first.

Run the command and let the user interact with it directly.

---

### clone — Clone Template Only (step 1 of `create`)

**Syntax**: `kappmaker clone <AppName> [--template-repo <url>] [--target-dir <path>]`

**Prerequisites**: `git`, plus a `templateRepo` value in config (default: KAppMaker boilerplate).

**App name rules**: PascalCase, starts uppercase, alphanumeric only — same rules as `create`.

**What it does**:
1. Triggers `config init` if `~/.config/kappmaker/config.json` doesn't exist yet
2. Prompts to delete + start fresh if the target directory already exists
3. Runs `git clone <templateRepo> <targetDir>`

**When to suggest this over `create`**: If the user explicitly says they only want to clone, scaffold, or "set up the project without Firebase / store stuff," reach for `clone` instead of the full `create`. Common minimal flow:

```bash
kappmaker clone MyApp
cd MyApp-All/MobileApp
kappmaker refactor --app-id com.example.myapp --app-name MyApp
```

`clone` is also what the full `create` calls under the hood for step 1 — same overwrite prompt and config-init-on-first-run behavior.

---

### git setup-upstream — Rename origin to upstream (step 10 of `create`)

**Syntax**: `kappmaker git setup-upstream [path]`

**Prerequisites**: The target directory must be a git repository.

**What it does**: Runs `git remote rename origin upstream` so the template repo is preserved as the upstream remote, leaving the user free to add their own `origin` later. Exits non-zero if the path isn't a git repo.

**When to suggest this**: After the user has manually cloned the template (or used `kappmaker clone`) and is about to push to their own repo. The full `create` calls this automatically as step 10.

---

### firebase — Firebase Setup Steps (steps 2–6 of `create`)

Five subcommands, each running one part of `create`'s Firebase flow as a standalone. Run them individually for partial setups (e.g. an existing Firebase project that just needs SDK configs), or chain them together to replicate `create`.

**Subcommands**:
- `kappmaker firebase login` — `firebase login` (interactive)
- `kappmaker firebase project --app-name <Name>` — create the project (or `--project-id <id> --display-name <name>`)
- `kappmaker firebase apps --project <id> --app-name <Name> --package-name <pkg>` — create Android + iOS apps
- `kappmaker firebase auth-anonymous --project <id>` — enable anonymous auth (handles the "click Get started" Auth init flow)
- `kappmaker firebase configs --project <id> --app-name <Name> [--package-name <pkg>]` — download SDK configs

**Prerequisites**:
- `firebase` CLI installed (`which firebase`; auto-installs via `npm install -g firebase-tools` if missing)
- `firebase login` must have been run before any of `project`/`apps`/`auth-anonymous`/`configs`

**Naming conventions used by `create`** — match these if you want to replicate what `create` does:
- Project ID: `<lowercase-app-name>-app` (e.g. `myapp-app` for `MyApp`). The `--app-name` shortcut on `firebase project` derives this for you.
- App display names: `${appName} (Android App)` and `${appName} (iOS App)`. `firebase configs` looks up apps by these names unless you pass `--android-app-id`/`--ios-app-id`.

**`firebase configs` output paths** auto-detect from cwd:
1. `MobileApp/androidApp/google-services.json` if `MobileApp/androidApp/` exists (AGP 9 layout)
2. `MobileApp/composeApp/google-services.json` if `MobileApp/composeApp/` exists (legacy)
3. `Assets/google-services.json` as last-resort fallback

Same probe for iOS (`MobileApp/iosApp/iosApp/GoogleService-Info.plist` first). Override via `--android-output` / `--ios-output`.

**Idempotency**:
- `firebase project` skips creation if the project already exists.
- `firebase apps` reuses apps that match the expected display name instead of creating duplicates.
- `firebase configs` always re-downloads (cheap, no side effects).

**`--package-name` on configs** — when set, the downloaded `google-services.json` is verified to contain the expected package and patched in-place if mismatched (e.g. when the Firebase app was registered with a different `bundleIdPrefix` previously). Pass it whenever you have the new package name handy.

**When to suggest these standalone over `create`**:
- User has an existing Firebase project and just needs SDK configs → `firebase configs`.
- User wants to set up a Firebase project for an already-cloned project → `firebase project` → `firebase apps` → `firebase auth-anonymous` → `firebase configs`.
- CI step that just needs to refresh `google-services.json` → `firebase configs --project ... --android-app-id ...`.

The full `create` orchestrator calls these five commands internally for steps 2–6.

---

### create-logo — AI Logo Generation

**Syntax**: `kappmaker create-logo [--prompt <text>] [--output <path>]`

**Prerequisites**: `falApiKey` (prompted on first use if not set).

**What it does**:
1. Reads app idea from `--prompt`, or asks the user interactively if omitted
2. Generates a 4x4 grid of 16 logo variations via fal.ai
3. Opens preview image
4. User selects a logo (1-16) with optional zoom/gap adjustments
5. Extracts selected logo to 512x512 PNG
6. Saves to `Assets/app_logo.png` (or custom `--output` path)

**Interactive**: Always interactive for the grid selection (number prompt). The initial app-idea prompt can be skipped by passing `--prompt "..."` up front.

---

### generate-image — Generic AI Image Generator

**Syntax**: `kappmaker generate-image --prompt <text> [options]`

**Options**:
- `--prompt <text>` (required) — Text description of the image
- `--output <path>` — Output file or directory (default: `Assets/generated.png`)
- `--num-images <n>` — Number of images, 1–8 (default: 1)
- `--aspect-ratio <ratio>` — `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, `21:9`, `9:21`, `auto` (default: `1:1`)
- `--resolution <res>` — `1K`, `2K`, `4K` (default: `2K`)
- `--output-format <fmt>` — `png`, `jpg`, `webp` (default: `png`)
- `--reference <paths...>` — Reference inputs; switches to fal.ai's `nano-banana-2/edit` endpoint. Each entry can be a file path, a directory (all `.png`/`.jpg`/`.jpeg`/`.webp` inside are auto-picked, sorted, non-recursive), or an HTTP(S) URL. Capped at 10 references total.

**Prerequisites**: `falApiKey` (prompted on first use if not set). `imgbbApiKey` is optional but recommended when using `--reference` with local files — if set, refs are uploaded to imgbb for reliable URLs; if not, they are sent inline as data URIs.

**What it does**: Thin wrapper around fal.ai's `nano-banana-2` (text-to-image) or `nano-banana-2/edit` (if any reference images are supplied). Submits the request, polls until complete, and downloads the result(s).

**Output path rules**:
- No `--output` → defaults to `Assets/generated.png` (or `generated_1.png`, `_2.png`… for multi)
- `--output` without a file extension → treated as a directory
- `--output` with a file extension → used verbatim for single image; for multi, `_1`, `_2`, … are appended before the extension

**When to use this vs `create-logo`**: Use `create-logo` when the user specifically wants an app logo (grid selection, background removal flow). Use `generate-image` for one-off marketing images, hero shots, backgrounds, illustrations, mockups, or any other general-purpose image task.

---

### create-appstore-app — App Store Connect Setup

**Syntax**: `kappmaker create-appstore-app [--config <path>]`

**Prerequisites**:
- `asc` CLI installed **≥ 1.4.0** (`brew install asc` or `brew upgrade asc`; the bulk-CSV `subscriptions pricing prices import` command used by KAppMaker 1.7.0+ requires this version)
- Repo location: https://github.com/rorkai/App-Store-Connect-CLI (renamed from rudrankriyam in 2026)
- Config keys: `ascKeyId`, `ascIssuerId`, `ascPrivateKeyPath` (for API auth)
- `appleId` — now required (used by both `asc web apps create` and privacy setup)

**Config file**: Looks for `./Assets/appstore-config.json`. If not found, prompts interactively.
- Global defaults at `~/.config/kappmaker/appstore-defaults.json` are used as base layer.

**What it does** (13 steps): Register bundle ID + enable capabilities (Sign in with Apple, In-App Purchases, Push Notifications), create/find app (fully automated — no manual ASC step needed), set content rights, create version, set categories, age rating, localizations, pricing, subscriptions, **consumable in-app purchases (credit packs)**, privacy, encryption, review contact.

**Default credit packs**: 3 CONSUMABLE IAPs ship in the template (`Basic` 10 credits / $4.99, `Pro` 30 / $9.99, `Ultimate` 80 / $19.99). Auto-fill turns each into `credit_pack_{credits}_{priceDigits}_{appname}` (e.g. `credit_pack_10_499_myapp`) — same product ID is used on Google Play and Adapty so the app code only needs one constant. Credit-pack auto-fill triggers on any `in_app_purchases[]` entry with a `credits` numeric field; other custom IAPs are left alone (the user's `product_id` wins). Created via `asc iap setup` — idempotent on rerun.

**Tip**: Before running, you can help the user review or create the `Assets/appstore-config.json` file. Read the existing config and explain each section. The user can edit it before running.

**Per-territory PPP pricing (1.7.0+ — bulk CSV import)**: subscriptions and IAPs are fanned out to **every ASC territory (~175)** with PPP-adjusted prices in ONE API call per product.
- **Subscriptions**: `asc subscriptions pricing prices import --input <csv>` (added in asc 1.4.0). CSV columns `territory,price,price_point_id`; KAppMaker writes a temp file and pipes it in. Omits `--start-date` so rows are treated as starting prices (Apple rejects future-dated rows when the territory has no starting price yet: "Create a starting price before creating future prices").
- **IAPs**: `asc iap pricing schedules create --prices "PP_ID:DATE,…"` (already batch).
- **Tier resolution**: Apple's price-point catalog uses globally-stable tier numbers (1..800; tier N = same USD-equivalent across all territories). Resolve each unique PPP USD target → tier ONCE via USA's catalog (USD-priced), then synthesise per-territory price-point IDs locally using Apple's base64 `{s, t, p}` format. Critical bug fix vs 1.6.x — old code numerically compared a USD target to local-currency prices (¥, ₩, ₹) and picked the FREE tier, silently landing products at $0 in JPN/IDR/INR/KRW/etc.
- **Distinct catalogs, distinct IDs**: subscriptions = `subscriptionPricePoints` (`s` = subscription-internal ID); IAPs = `appPricePoints` (`s` = app ID). Mixing IDs returns `400 The provided entity is invalid`.
- **Idempotent re-runs**: existing subs/IAPs now refresh pricing instead of being skipped (1.6.x silently skipped → users couldn't re-price legacy products).

---

### gpc — Google Play Console Management

**Syntax**:
- `kappmaker gpc setup [--config <path>]` — full 11-step flow (alias: `kappmaker create-play-app`)
- `kappmaker gpc listings push [--config <path>]` — push store listings only
- `kappmaker gpc subscriptions list [--package <pkg>] [--config <path>]`
- `kappmaker gpc subscriptions push [--config <path>]`
- `kappmaker gpc iap list [--package <pkg>] [--config <path>]`
- `kappmaker gpc iap push [--config <path>]`
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
- User tweaked subscription prices → `gpc subscriptions push`
- User updated data safety form → `gpc data-safety push`
- CI pre-check that the app exists → `gpc app-check --package <pkg>` (exits 0 or 2)

**Tip**: Before running `gpc setup`, help the user review or create `Assets/googleplay-config.json`. Read the existing config and explain each section (app, details, listings, subscriptions, in_app_products, data_safety). The user can edit it before running.

**Data safety schema**: The `data_safety` JSON block uses KAppMaker defaults: no account creation (`PSL_ACM_NONE`), data deletion question omitted (optional), collects Device ID + Crash logs + Diagnostics + Other performance + App interactions (only — not "Other app activity"), all processed **ephemerally**, collection **required** (users can't turn it off), collected only (not shared), encrypted in transit. Users can override specific answers via `data_safety.answers` with keys like `"QuestionID"` or `"QuestionID/ResponseID"` and values `true`/`false`/`"URL"`/`null`. Escape hatch: `data_safety_csv_path` uploads a pre-filled CSV from Play Console → Policy → App content → Data safety → Export to CSV.

**Manual-only declarations**: The Play Publisher API does NOT expose content rating (IARC), target audience, ads declaration, health apps, financial features, government apps, news apps, gambling, COVID-19 tracing, app access (login walls), advertising ID usage, families compliance, or app pricing tier. Step 11 of `gpc setup` prints a checklist with a deep link to the Play Console App content page for the user to tick these off manually. No API workaround exists.

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

### generate-screenshots — AI Screenshot Generation

**Syntax**: `kappmaker generate-screenshots --prompt "<app description>" [options]`

**Options**:
- `--prompt <text>` (required) — App description or PRD
- `--input <dir>` — Reference screenshots directory (default: auto-detect `Assets/screenshots`)
- `--style <id>` — Style preset 1-8 (default: 1)
- `--output <dir>` — Output directory (default: `Assets/screenshots`)
- `--resolution <res>` — AI resolution: 1K, 2K, 4K (default: 2K)

**Prerequisites**: `openaiApiKey`, `falApiKey`, `imgbbApiKey` — all prompted on first use if not set.

**What it does**: Calls OpenAI to generate a detailed screenshot prompt, then fal.ai to generate 8 marketing screenshots in a fixed 2×4 grid, splits them into 8 individual 1284×2778 images, saves to appstore/playstore directories. Grid shape is fixed by design — number of reference images does not change the output count.

**Style presets** (1-8): Different visual styles for the screenshots. Ask the user what style they prefer if not specified.

---

### translate-screenshots — Locale Translation

**Syntax**: `kappmaker translate-screenshots [source-dir] [options]`

**Options**:
- `[source-dir]` — Source screenshots directory (default: `MobileApp/distribution/ios/appstore_metadata/screenshots/en-US`)
- `--output <path>` — Distribution directory root
- `--locales <codes...>` — Target Play Store locale codes, space-separated (default: all 48+)
- `--rows <n>` — Grid rows (default: 2)
- `--cols <n>` — Grid columns (default: 4)
- `--resolution <res>` — 1K, 2K, 4K (default: 2K)

**Prerequisites**: `falApiKey`, `imgbbApiKey` (prompted on first use if not set).

**What it does**: Combines source screenshots into a grid, translates to all target locales in parallel via fal.ai, splits translated grids back into individual images, saves to Fastlane distribution structure for both iOS and Android.

---

### image-split — Grid Image Splitter

**Syntax**: `kappmaker image-split <source> [options]`

**Options**:
- `--rows <n>` (default: 4)
- `--cols <n>` (default: 4)
- `--zoom <factor>` (default: 1.07)
- `--gap <pixels>` (default: 0)
- `--width <pixels>` (default: 512)
- `--height <pixels>` (default: 512)
- `--output-dir <path>` (default: current directory)
- `--keep <indices>` — Comma-separated tile indices to keep (e.g., `1,3,5`)

**Prerequisites**: None (uses local sharp library).

**Common use cases — ALWAYS pass explicit `--rows`/`--cols`/`--width`/`--height` matching the source grid. The defaults (4×4, 512×512) are tuned for logo grids only — using them on a screenshot grid will produce a wrong split (e.g. 2 half-images each containing a 2×2 sub-grid of screenshots).**

| Use case | Source layout | Recommended args |
|---|---|---|
| Logo grid (from `create-logo`) | 4 rows × 4 cols, 16 cells | defaults are fine, or `--rows 4 --cols 4 --width 512 --height 512` |
| **Marketing screenshot grid (from `generate-image` or fal.ai)** | **2 rows × 4 cols, 8 cells** | **`--rows 2 --cols 4 --width 1284 --height 2778`** |

Note: `generate-screenshots` already splits its own output internally into `appstore/` and `playstore/` directories — you do **not** need to run `image-split` after it. Only run `image-split` on a screenshot grid if the user generated it some other way (e.g. via `generate-image` with `--reference`).

---

### image-remove-bg — Background Removal

**Syntax**: `kappmaker image-remove-bg <source> [--output <path>]`

**Prerequisites**: `falApiKey` (prompted on first use if not set).

---

### image-enhance — Quality Enhancement

**Syntax**: `kappmaker image-enhance <source> [--output <path>]`

**Prerequisites**: `falApiKey` (prompted on first use if not set).

---

### convert-webp — Image to WebP Conversion

**Syntax**: `kappmaker convert-webp <source> [options]`

**Options**:
- `--quality <n>` — WebP quality, 0–100 (default: 75)
- `--recursive` — Search directories recursively (default: false)
- `--delete-originals` — Delete original files after conversion (default: false)
- `--output <dir>` — Output directory (default: same directory as source)

**Prerequisites**: None (uses local sharp library, no API key needed).

**What it does**: Converts PNG, JPG, JPEG, BMP, TIFF, and GIF images to WebP format — similar to Android Studio's built-in converter. Shows before/after file sizes and percentage saved for each file. Works on single files or entire directories (with `--recursive`).

---

### fastlane configure — Set Up Fastlane

**Syntax**: `kappmaker fastlane configure`

**Prerequisites**: Ruby and Bundler (`gem install bundler`). Run from the project root or inside `MobileApp/`.

**What it does**: Creates `Gemfile` + `fastlane/Fastfile` in the mobile app directory, then runs `bundle install`. Skips files that already exist. This is a prerequisite for `kappmaker publish`.

---

### publish — Build & Upload to Stores

**Syntax**: `kappmaker publish [options]`

**Options**:
- `--platform <name>` — Platform to publish: `android`, `ios` (repeatable, default: both)
- `--track <name>` — Android Play Store track: internal/alpha/beta/production (default: `production`)
- `--upload-metadata` — Upload metadata texts (default: false)
- `--upload-screenshots` — Upload screenshots (default: false)
- `--upload-images` — Upload images — icon, feature graphic, Android only (default: false)
- `--submit-for-review` — Submit for review after upload (default: true)

**Prerequisites**:
- Fastlane via Bundler (`Gemfile` + `fastlane/Fastfile` in mobileDir)
- **Android**: `googleServiceAccountPath` set in config (Google Play service account JSON)
- **iOS**: `ascKeyId`, `ascIssuerId`, `ascPrivateKeyPath` set in config (CLI generates Fastlane publisher JSON automatically)

Run from the project root or inside `MobileApp/`.

**What it does**: Builds and uploads via Fastlane's `playstore_release` (Android) and `appstore_release` (iOS) lanes. With no `--platform`, publishes to both stores sequentially.

---

### generate-keystore — Android Signing Keystore

**Syntax**: `kappmaker generate-keystore [options]`

**Options**:
- `--first-name <name>` — Developer name for keystore (required if no `--organization`)
- `--organization <name>` — Organization name for keystore (required if no `--first-name`)
- `--output <dir>` — Output directory (default: `distribution/android/keystore` inside mobileDir)

**Prerequisites**: `keytool` (comes with JDK). Run from the project root or inside `MobileApp/`.

**What it does**: Generates `keystore.jks` and `keystore.properties` with a secure random password. At least one of `--first-name` or `--organization` must be provided.

---

### android-release-build — Signed Android AAB

**Syntax**: `kappmaker android-release-build [options]`

**Options**:
- `--organization <name>` — Organization for keystore if it needs generating (default: from config)
- `--first-name <name>` — Developer name for keystore if it needs generating
- `--output <dir>` — Output directory for AAB (default: `distribution/android` inside mobileDir)

**Prerequisites**: `gradlew` in the mobile app directory, JDK. Run from the project root or inside `MobileApp/`.

**What it does**:
1. Generates keystore if `distribution/android/keystore/keystore.properties` doesn't exist
2. Builds AAB via `./gradlew :androidApp:bundleRelease`
3. Copies AAB to output directory
4. Logs path to the built AAB

---

### refactor — Package & App Name Refactoring

**Syntax**: `kappmaker refactor --app-id <id> --app-name <name> [options]`

**Options**:
- `--app-id <id>` (required) — New applicationId / bundleId (e.g., `com.example.myapp`)
- `--app-name <name>` (required) — New display name (e.g., `MyApp`)
- `--old-app-id <id>` — Current applicationId to replace (default: `com.measify.kappmaker`)
- `--old-app-name <name>` — Current app name to replace (default: `KAppMakerAllModules`)
- `--skip-package-rename` — Only update IDs and app name, keep Kotlin package directories intact

**Prerequisites**: None. Run from the project root (containing `MobileApp/`) or inside `MobileApp/`.

**What it does**:
- **Full refactor** (default): Renames Kotlin packages in all source sets, moves directories, updates Gradle files, Firebase configs, iOS project files, GitHub workflows, and app display name.
- **Skip-package-rename mode**: Only updates applicationId/bundleId, Firebase configs, iOS files, workflows, and app name — keeps Kotlin package dirs intact. Useful for creating multiple apps from one codebase.

**Re-refactoring**: To refactor a project that was already refactored, pass `--old-app-id` and `--old-app-name` with the current values:
```
kappmaker refactor --app-id com.new.app --app-name NewApp --old-app-id com.previous.app --old-app-name PreviousApp
```

---

### update-version — Version Bumping

**Syntax**: `kappmaker update-version [-v <version>]`

**Options**:
- `-v, --version <name>` — Set explicit version name (e.g., `2.0.0`). If omitted, auto-increments patch (e.g., `1.2.3` → `1.2.4`).

**Prerequisites**: None. Run from the project root (containing `MobileApp/`) or inside `MobileApp/`.

**What it updates**:
- Android: `versionCode` (+1) and `versionName` in `androidApp/build.gradle.kts`
- iOS: `CURRENT_PROJECT_VERSION` (+1) and `MARKETING_VERSION` in `project.pbxproj` + `Info.plist`

If a platform's files are missing, that platform is skipped with a warning.

---

### config — Configuration Management

**Subcommands**:
- `kappmaker config list` — Show all config values
- `kappmaker config get <key>` — Get a specific value
- `kappmaker config set <key> <value>` — Set a value
- `kappmaker config path` — Show config file path
- `kappmaker config init` — Interactive setup wizard (has prompts). Also offers to initialize global App Store and Adapty defaults at the end.
- `kappmaker config appstore-defaults --init` — Interactive App Store defaults setup. Backfills missing credit-pack IAPs from the template on re-run (useful after upgrading from pre-1.4 defaults).
- `kappmaker config appstore-defaults --save <file>` — Save JSON as global defaults
- `kappmaker config adapty-defaults --init` — Initialize Adapty defaults from the built-in template (subs + 3 credit packs + Credits Paywall + `credits_pack` placement). Backfills any of `products` / `paywalls` / `placements` that are empty/missing on re-run.
- `kappmaker config adapty-defaults --save <file>` — Save Adapty JSON as global defaults

**Valid config keys**: `templateRepo`, `bundleIdPrefix`, `androidSdkPath`, `organization`, `falApiKey`, `imgbbApiKey`, `openaiApiKey`, `ascAuthName`, `ascKeyId`, `ascIssuerId`, `ascPrivateKeyPath`, `appleId`, `googleServiceAccountPath`.

For config setup, prefer using `kappmaker config set <key> <value>` for each key individually rather than `kappmaker config init` (which is fully interactive and harder to guide through).

## API Key Sources

| Key | Where to get it |
|-----|----------------|
| `falApiKey` | https://fal.ai/dashboard/keys |
| `imgbbApiKey` | https://api.imgbb.com (free) |
| `openaiApiKey` | https://platform.openai.com/api-keys |
| `ascKeyId` + `ascIssuerId` + `ascPrivateKeyPath` | App Store Connect > Users and Access > Integrations > App Store Connect API |
| `appleId` | Your Apple ID email address |
| `googleServiceAccountPath` | Google Cloud Console > IAM > Service Accounts > Keys > JSON (then grant access in Play Console > Users and permissions). Used by both `kappmaker publish --platform android` and the entire `kappmaker gpc` command group. |

## Error Handling

- If a command fails, read the error output carefully.
- Common issues:
  - **Missing API keys (fal.ai, OpenAI, imgbb)**: The CLI prompts for them inline on first use and saves to config automatically. No need to pre-configure — the user will be asked when a command needs a key.
  - **Firebase auth errors**: Run `firebase login` separately first
  - **asc not found**: Run `brew install asc`
  - **adapty not found**: Run `npm install -g adapty`
  - **App name validation**: Must be PascalCase, start uppercase, alphanumeric only
  - **Directory already exists**: The create command will ask whether to delete it
- Steps that fail due to missing dependencies warn and skip gracefully instead of aborting the entire flow.
- Missing API keys are prompted inline and saved to config on first use (never fatal exits for unconfigured keys).
- If no config file exists when `create` runs, `configInit()` is triggered automatically before the first step.
- Missing App Store Connect config triggers inline interactive setup (API key, Apple ID, review contact).

## Chaining Commands

Some common workflows:
1. **Full app setup**: `kappmaker create <AppName>` (does everything)
2. **Minimal scaffold (clone + refactor only)**: `kappmaker clone <AppName>` → `cd <AppName>-All/MobileApp` → `kappmaker refactor --app-id <id> --app-name <name>`. Then optionally `cd ..` and `kappmaker git setup-upstream` if the user wants the template kept as the upstream remote.
3. **Firebase-only setup (existing project)**: `kappmaker firebase login` → `kappmaker firebase project --app-name <Name>` → `kappmaker firebase apps --project <id> --app-name <Name> --package-name <pkg>` → `kappmaker firebase auth-anonymous --project <id>` → `kappmaker firebase configs --project <id> --app-name <Name> --package-name <pkg>`. Same as steps 2–6 of `create`.
3. **Screenshots pipeline**: First `generate-screenshots`, then `translate-screenshots`
3. **Logo pipeline**: `create-logo`, then optionally `image-remove-bg` and `image-enhance`
4. **Generic image pipeline**: `generate-image`, then optionally `image-remove-bg` and `image-enhance` for one-off assets (hero images, backgrounds, mockups)
4. **Store setup**: `create-appstore-app`, then `gpc setup`, then `adapty setup` — product IDs align automatically across all three systems. On Android, the Play Console app must already exist (create manually once in Play Console, then `gpc setup` configures everything else).
5. **Iterate on Play Store copy without a full upload**: edit `Assets/googleplay-config.json`, then `kappmaker gpc listings push` (skips Fastlane, talks to the API directly)
5. **Rebrand app**: `refactor --app-id <new-id> --app-name <new-name>`, then `update-version`
6. **First publish**: `fastlane configure`, then `android-release-build`, then `publish`
