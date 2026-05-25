# CLAUDE.md

## Project Overview

Documentation site: https://cli.kappmaker.com (source in `docs-site/`, deployed via GitHub Pages)

KAppMaker CLI — a TypeScript/Node.js CLI tool that automates mobile app bootstrapping for the KAppMaker platform. It wraps Firebase CLI, Gradle, Fastlane, CocoaPods, Git, fal.ai, App Store Connect CLI (asc), and Adapty CLI into a single workflow. Google Play Console management is built-in (not wrapping any external CLI) — `gpc.service.ts` talks directly to `androidpublisher.googleapis.com/v3` via Node's built-in `fetch` + `crypto` (service-account JWT flow).

## Tech Stack

- **TypeScript** with ESM (`"type": "module"` in package.json)
- **Commander.js** for CLI structure
- **execa** for subprocess execution
- **chalk** for colored output
- **ora** for spinners
- **fs-extra** for file operations
- **sharp** for image processing (logo extraction, grid splitting)

## Key Conventions

- All imports use `.js` extensions (required by NodeNext module resolution)
- Each CLI command lives in its own file under `src/commands/`
- Each external tool (firebase, git, gradle, fal.ai, etc.) has its own service under `src/services/`
- No file should exceed ~150 lines
- Use `async/await` everywhere
- Use `run()` from `src/utils/exec.ts` for commands with spinner output
- Use `runStreaming()` for interactive commands (e.g., `firebase login`)
- Graceful degradation — steps that fail or detect missing dependencies warn and skip instead of aborting the entire flow
- Missing API keys (fal.ai, OpenAI, imgbb) are prompted inline and saved to config on first use — no fatal exits for missing keys
- Missing App Store Connect config (API key, Apple ID) triggers inline interactive setup via `configAppStoreDefaults`
- If no `~/.config/kappmaker/config.json` exists when `create` runs, `configInit()` is called automatically before the first step

## Commands

```bash
npm run dev          # Run with tsx (no build needed)
npm run build        # Compile TypeScript to dist/
npx tsx src/index.ts create <AppName>              # Full end-to-end app setup (13 steps)
npx tsx src/index.ts clone <AppName>               # Step 1 only — clone template into <AppName>-All
npx tsx src/index.ts git setup-upstream [path]     # Step 10 only — rename origin to upstream (default: cwd)
npx tsx src/index.ts firebase login                                                       # Step 2 — `firebase login`
npx tsx src/index.ts firebase project --app-name <Name>                                   # Step 3 — create Firebase project (or --project-id <id>)
npx tsx src/index.ts firebase apps --project <id> --app-name <Name> --package-name <pkg>  # Step 4 — create Android + iOS apps
npx tsx src/index.ts firebase auth-anonymous --project <id>                               # Step 5 — enable anonymous auth
npx tsx src/index.ts firebase configs --project <id> --app-name <Name> [--package-name <pkg>]  # Step 6 — download SDK configs
npx tsx src/index.ts create-logo [--prompt "..."]  # Logo generation (--prompt skips interactive input)
npx tsx src/index.ts generate-image --prompt "..." # Generic AI image generator (fal.ai nano-banana-2)
npx tsx src/index.ts image-split <image> [opts]    # Split grid image (--keep 1,3 to filter)
npx tsx src/index.ts image-remove-bg <image>       # Remove background
npx tsx src/index.ts image-enhance <image>         # Enhance quality
npx tsx src/index.ts translate-screenshots          # Translate screenshots (default: en-US source)
npx tsx src/index.ts translate-screenshots <dir> --locales de-DE ja-JP  # Specific locales
npx tsx src/index.ts generate-screenshots --prompt "A fitness app..."   # Generate marketing screenshots
npx tsx src/index.ts generate-feature-image --prompt "..." --app-name "FitTrack" --primary-color "#FF3B30"  # Generate Google Play feature graphic (1024×500)
npx tsx src/index.ts generate-ios-icons [--source <logo>]  # Generate all iOS AppIcon.appiconset PNGs + Contents.json (no AI)
npx tsx src/index.ts generate-android-icons [--source <logo>] [--background "#RRGGBB"]  # Generate Android mipmap-* launcher icons + adaptive XML + colors.xml entry (no AI)
npx tsx src/index.ts create-appstore-app           # App Store Connect setup
npx tsx src/index.ts appstore-update-subscription-review-screenshot --file <path>  # Replace subscription review screenshots (1290×2796)
npx tsx src/index.ts appstore-update-iap-review-screenshot --file <path>           # Replace IAP review images (1290×2796)
npx tsx src/index.ts gpc setup                     # Google Play Console setup (full 11-step flow)
npx tsx src/index.ts create-play-app               # Alias for `gpc setup`
npx tsx src/index.ts gpc app-check --package <pkg> # Verify app exists on Play Console
npx tsx src/index.ts gpc listings push             # Push store listings from config
npx tsx src/index.ts gpc subscriptions list [--package <pkg>]  # List existing subscriptions
npx tsx src/index.ts gpc subscriptions push        # Create/reuse subscriptions from config
npx tsx src/index.ts gpc iap list [--package <pkg>]            # List existing in-app products
npx tsx src/index.ts gpc iap push                  # Create/reuse IAPs from config
npx tsx src/index.ts gpc data-safety push          # Push data safety declaration from config
npx tsx src/index.ts adapty setup                  # Adapty products/paywall/placements setup
npx tsx src/index.ts subscription add --period weekly --price 9.99                          # Create one new subscription on Play + ASC (auto-generates aligned IDs)
npx tsx src/index.ts subscription add --period weekly --price 9.99 --product-version 2              # Same period/price but a fresh v2 product line (alongside existing v1)
npx tsx src/index.ts subscription add --period monthly --price 19.99 --platform android     # Play only
npx tsx src/index.ts iap add --credits 50 --price 14.99                                     # Create one new credit-pack IAP on Play + ASC + Adapty
npx tsx src/index.ts iap add --credits 100 --price 24.99 --platform ios                     # ASC only
npx tsx src/index.ts iap add --credits 50 --price 14.99 --product-version 2                         # Fresh v2 credit-pack line (appends "_v2" to the ID)
npx tsx src/index.ts fastlane configure                                    # Set up Fastlane (Gemfile + Fastfile + bundle install)
npx tsx src/index.ts publish --platform android                            # Publish Android to Play Store
npx tsx src/index.ts publish --platform ios                                # Publish iOS to App Store
npx tsx src/index.ts publish                                               # Publish to both stores
npx tsx src/index.ts generate-keystore --organization "MyCompany"          # Generate Android signing keystore
npx tsx src/index.ts android-release-build                                # Build signed Android AAB
npx tsx src/index.ts refactor --app-id com.example.myapp --app-name MyApp  # Full package refactor
npx tsx src/index.ts refactor --app-id com.example.myapp --app-name MyApp --skip-package-rename  # IDs only
npx tsx src/index.ts update-version                # Bump patch version + versionCode on both platforms
npx tsx src/index.ts update-version -v 2.0.0       # Set explicit version name
npx tsx src/index.ts convert-webp <image-or-dir>                           # Convert PNG/JPG/BMP/TIFF/GIF to WebP
npx tsx src/index.ts convert-webp <dir> --recursive --quality 90           # Batch convert recursively
```

## Skill-Driven Workflows (no shell command)

Some features run entirely inside the `kappmaker:kappmaker` Claude Code skill — they have no `kappmaker` binary entry point because they don't need one (no external API calls, no per-command state). The skill reads/writes files directly via the Claude Code tool.

Currently in this category:

- **ASO keyword research** — discovers high-value keywords for a base topic using the [Astro MCP](https://tryastro.app/docs/mcp/) tools (`search_app_store`, `extract_competitors_keywords`, `get_keyword_suggestions`), filters by popularity/difficulty thresholds, clusters by sub-niche, and writes `AiGuidelines/keywords.md`. Falls back to a manual brainstorm (with `?` scores) when Astro MCP isn't connected. See [.claude/skills/kappmaker/SKILL.md](.claude/skills/kappmaker/SKILL.md) "ASO Keyword Research" section. Natural chain: research → use the output keywords in `localize-metadata mode=keyword-expansion`.

  **Project convention — `AiGuidelines/`**: `AiGuidelines/` is the canonical home for AI-facing planning docs (`prd.md`, `app-idea.md`, `keywords.md`, `brand.md`, and any other `*.md` describing the product). The kappmaker skill reads this folder **before invoking any command** to fill in missing inputs (app description, app name, tagline, brand color, etc.) so the user isn't asked for things already written down. Cascade order: `AiGuidelines/*.md` → `README.md` → existing ASO metadata under `MobileApp/distribution/ios/appstore_metadata/texts/en-US/` → `Assets/googleplay-config.json` / `Assets/appstore-config.json`. See [.claude/skills/kappmaker/SKILL.md](.claude/skills/kappmaker/SKILL.md) "Context Gathering" section. The folder is created on first write if missing.

- **ASO metadata localization** — generates per-locale `name`/`subtitle`/`keywords`/`description` (iOS) and `title`/`short_description`/`full_description` (Android) text files into `MobileApp/distribution/{ios/appstore_metadata/texts,android/playstore_metadata}/<locale>/`. Two modes (`keyword-expansion` and `market-localization`), invoked via natural-language trigger phrases the skill router picks up. See [.claude/skills/kappmaker/SKILL.md](.claude/skills/kappmaker/SKILL.md) "Localize ASO Metadata" section for the full procedure, the embedded ASO guideline checks, and the 30-row locale code table.

When adding new skill-driven workflows: place the procedure as a new `###` section in `.claude/skills/kappmaker/SKILL.md`, add a row to the routing table at the top, and link it from the appropriate ASO / image / publishing docs page. No `src/commands/` file, no `src/cli.ts` entry.

## Custom Template Support

The CLI defaults to the [KAppMaker](https://kappmaker.com) boilerplate but supports custom templates via `--template-repo` or `kappmaker config set templateRepo <url>`.

Steps 1–9 of the `create` command are universal (or optional). Steps 10–13 detect the boilerplate structure and skip gracefully with warnings when the expected files are not found:

- **Step 10 (Package refactor)** — uses TypeScript refactor service (no longer depends on Gradle task)
- **Step 11 (Build env)** — checks for `gradlew` before `local.properties`, checks for `Podfile` before CocoaPods
- **Step 12 (Git remotes)** — always runs (works with any template)
- **Step 13 (Fastlane build)** — checks for `Fastfile` before attempting the build
- **Step 6 (Firebase configs)** — falls back to `Assets/` if KAppMaker directories don't exist
- **translate-screenshots** — falls back to parent of source dir if `MobileApp/distribution` doesn't exist

## Create Command Flow (13 steps)

The `create` command is the main orchestrator that runs everything end-to-end:

1. Clone template repository
2. Firebase login
3. Create Firebase project — if creation fails, warns and skips steps 4-6
4. Create Firebase apps (Android + iOS)
5. Enable anonymous authentication (Identity Toolkit REST API; if brand-new project, prompts user to click "Get started" in Firebase Console, then retries)
6. Download Firebase SDK configs (KAppMaker paths or `Assets/` fallback; verifies google-services.json package matches config)
7. Logo generation (optional — asks user, then auto-removes background)
8. Package refactor — renames packages, IDs, and app name across all modules (shared, androidApp, desktopApp, webApp, designsystem, libs; also walks legacy `composeApp/` for pre-rename projects)
9. Build environment + keystore — local.properties, CocoaPods, generates signing keystore if missing
10. Git remotes (template as upstream)
    ↕ Pre-store reminder: prompts user to create Google Play Console app; ASC is created automatically
11. App Store Connect setup (optional — calls `createAppStoreApp`; app is created automatically via `asc web apps create`)
12. Google Play Console setup (optional) — Fastlane builds + uploads AAB to internal track first (so billing is enabled for subscriptions), then calls `createPlayApp`
13. Adapty setup (optional — calls `adaptySetup`)

## Project Structure

```
docs-site/                    # Docusaurus documentation site (cli.kappmaker.com)
  docusaurus.config.ts        # Site config (url, navbar, footer, theme)
  sidebars.ts                 # Sidebar navigation structure
  docs/                       # Markdown pages organized by topic
    intro.md                  # Landing page (Getting Started)
    configuration.md          # Config keys, global defaults, subscription ID alignment
    project-setup/            # Full App Setup, Refactoring, Version Bumping
    store-publishing/         # App Store Connect, Google Play Console, Adapty, Publish
    build-signing/            # Fastlane Setup, Keystore, Android Release Build
    aso/                      # ASO Guidelines, Metadata Localization (skill-driven), Screenshot Translation
    ai-image-tools/           # Logo Generation, Screenshot Generation, Image Processing
    guides/                   # External Services, Custom Templates, Claude Code Skill
  static/CNAME                # Custom domain: cli.kappmaker.com
.github/
  workflows/
    deploy-docs.yml           # GitHub Pages deployment (triggers on docs-site/ changes)
src/
  index.ts                  # Entry point (shebang)
  cli.ts                    # Commander.js program setup
  commands/
    create.ts               # Full app setup (13-step orchestrator: Firebase + logo + refactor + build + ASC + GPC + Adapty)
    clone.ts                # `kappmaker clone <AppName>` — step 1 of create as a standalone command (also called by create.ts)
    git.ts                  # `kappmaker git setup-upstream` — step 10 of create as a standalone command (also called by create.ts)
    firebase.ts             # `kappmaker firebase` subcommands: login, project, apps, auth-anonymous, configs (steps 2-6 of create as standalones; also called by create.ts)
    create-logo.ts          # Logo generation (fal.ai + sharp); accepts --prompt to skip interactive input
    generate-image.ts       # Generic AI image generator (fal.ai nano-banana-2; --prompt, --num-images, --aspect-ratio, --resolution, --reference)
    generate-feature-image.ts # Google Play feature graphic generator (OpenAI + fal.ai, sharp resize to 1024×500)
    generate-ios-icons.ts   # iOS AppIcon.appiconset generator (sharp-only, 11 sizes + Contents.json, no AI)
    generate-android-icons.ts # Android mipmap-* launcher icon generator (sharp-only, 5 densities × 3 files + adaptive XML + colors.xml upsert, no AI)
    create-appstore-app.ts  # App Store Connect setup (13-step orchestrator via asc CLI)
    create-play-app.ts      # Google Play Console setup (11-step orchestrator via direct Publisher API)
    gpc.ts                  # kappmaker gpc subcommands: setup, app-check, listings, subscriptions, iap, data-safety
    adapty-setup.ts         # Adapty setup (8-step orchestrator via adapty CLI)
    subscription-add.ts     # `subscription add` — one-shot subscription push to Play + ASC + Adapty (no config writes)
    iap-add.ts              # `iap add` — one-shot credit-pack IAP push to Play + ASC + Adapty (no config writes)
    split.ts                # image-split — grid image splitter
    remove-bg.ts            # image-remove-bg — background removal (fal.ai bria)
    enhance.ts              # image-enhance — upscale quality (fal.ai nano-banana-2/edit)
    convert-webp.ts         # convert-webp — PNG/JPG/BMP/TIFF/GIF to WebP (sharp, no API key needed)
    translate-screenshots.ts  # Screenshot translation to multiple locales (fal.ai)
    generate-screenshots.ts   # AI screenshot generation (OpenAI + fal.ai)
    fastlane-configure.ts   # Set up Fastlane (Gemfile + Fastfile + bundle install)
    publish.ts              # Build and upload to Google Play / App Store via Fastlane
    generate-keystore.ts    # Generate Android signing keystore
    android-release-build.ts # Build signed Android release AAB
    refactor.ts             # Package name, application ID, bundle ID, and app name refactoring
    update-version.ts       # Bump Android + iOS version codes and version name
    config.ts               # Config management (list, set, get, init)
  services/
    firebase.service.ts     # Firebase CLI wrapper (project + app creation + anonymous auth via REST)
    fal.service.ts          # fal.ai HTTP API (submit, poll, fetch, download, translate, screenshot generation)
    openai.service.ts       # OpenAI API (prompt generation for screenshots)
    screenshot-styles.ts    # Screenshot style prompts (8 styles) for generate-screenshots
    git.service.ts          # Git clone + remote setup
    fastlane-setup.service.ts # Fastlane scaffolding (Gemfile + Fastfile + bundle install)
    publish.service.ts      # Android/iOS publishing via Fastlane (Play Store + App Store)
    keystore.service.ts     # Android keystore generation (keytool + properties)
    gradle.service.ts       # Gradle build helpers (local.properties, clean & build)
    ios.service.ts          # CocoaPods install
    fastlane.service.ts     # Android release build (keystore + gradle) + AAB path finder
    logo.service.ts         # Prompt builder + sharp image extraction/splitting
    asc.service.ts          # App Store Connect CLI wrapper (bundle ID + capabilities, app creation, version, categories, metadata)
    asc-monetization.service.ts  # ASC pricing, subscriptions, in-app purchases
    gpc.service.ts          # Google Play Publisher API wrapper (service-account JWT auth, edits, listings, data safety, app state probe) — no external CLI
    gpc-monetization.service.ts  # Play new monetization API (subscriptions + base plans + one-time products via oneTimeProducts, NOT legacy inappproducts)
    gpc-data-safety.service.ts   # JSON→CSV converter for Data Safety form, using bundled canonical template
    adapty.service.ts       # Adapty CLI wrapper (apps, access levels, products, paywalls, placements)
    refactor.service.ts     # Package/app name refactoring (Kotlin sources, Gradle, iOS, Firebase, workflows)
    screenshot.service.ts   # Screenshot grid combine/split, locale mapping, Fastlane output
    version.service.ts      # Android + iOS version reading/writing (build.gradle.kts, pbxproj, Info.plist)
    product-id.builder.ts   # Period + price → aligned ASC / Play / Adapty product IDs (shared by subscription-add and iap-add)
  utils/
    logger.ts               # chalk-based step/success/error logging
    exec.ts                 # execa wrapper with spinner and streaming modes
    validator.ts            # CLI dependency checks + app name validation
    config.ts               # User config loader/saver (~/.config/kappmaker/config.json)
    prompt.ts               # Interactive prompts (confirm, input)
  templates/
    appstore-config.json    # Default App Store Connect config template
    googleplay-config.json  # Default Google Play Console config template
    data-safety-template.json  # Canonical Play Data Safety form schema (783 rows, 217 Q IDs)
    adapty-config.json      # Default Adapty config template
  types/
    index.ts                # Shared interfaces
    appstore.ts             # App Store Connect config interfaces
    googleplay.ts           # Google Play Console config interfaces
    adapty.ts               # Adapty config interfaces
```

## Adding a New Command

1. Create `src/commands/<name>.ts` with an exported async function
2. Register the command in `src/cli.ts` using Commander.js
3. Create any needed services in `src/services/`

## Adding a New Service

1. Create `src/services/<tool>.service.ts`
2. For services that wrap an external CLI: import `run` or `runStreaming` from `src/utils/exec.js` and shell out with typed arguments.
3. For services that talk to an HTTP API directly (see `gpc.service.ts`): use Node's built-in `fetch` + `node:crypto` (for JWT signing if needed). Add a local `apiRequest<T>()` helper that reuses an `ora` spinner for UX parity with `run()` in `exec.ts`. Do not add new npm dependencies without a concrete reason.
4. Export individual functions (not a class).

## Configuration

User config file: `~/.config/kappmaker/config.json` (managed via `src/utils/config.ts`)

| Key | Default | Used by |
|-----|---------|---------|
| `templateRepo` | `git@github.com:KAppMaker/KAppMaker-All.git` | `create.ts` → template clone |
| `bundleIdPrefix` | `""` (empty = `com.<appname>`) | `create.ts` → package/bundle ID |
| `androidSdkPath` | `~/Library/Android/sdk` | `gradle.service.ts` → `local.properties` |
| `organization` | `""` (empty = app name) | `fastlane.service.ts` → keystore signing |
| `falApiKey` | `""` | `fal.service.ts` → logo generation, background removal, enhancement, screenshot translation/generation |
| `imgbbApiKey` | `""` | `fal.service.ts` → image upload for screenshot translation and generation (free at api.imgbb.com) |
| `openaiApiKey` | `""` | `openai.service.ts` → screenshot generation prompt (GPT-4.1) |
| `ascAuthName` | `"KAppMaker"` | `asc.service.ts` → credential name stored in keychain for auto-login |
| `ascKeyId` | `""` | `asc.service.ts` → App Store Connect API authentication |
| `ascIssuerId` | `""` | `asc.service.ts` → App Store Connect API authentication |
| `ascPrivateKeyPath` | `""` | `asc.service.ts` → path to `.p8` key (copied to config dir) |
| `appleId` | `""` | `asc.service.ts` → Apple ID for privacy setup (asc web privacy) |
| `googleServiceAccountPath` | `~/credentials/google-service-app-publisher.json` | `publish.service.ts` → Fastlane upload; `gpc.service.ts` → Play Publisher API auth (JWT → access token) |

### Per-region PPP pricing (1.6.0+)

Subscriptions and one-time IAPs (Play and ASC, both monetization paths) are fanned out to every supported region/territory with **purchasing-power-parity-adjusted prices** instead of a single USD price. The multipliers come from a Steam/Spotify-inspired tier table (source: [iosdevmax/ppp-pricing](https://github.com/iosdevmax/ppp-pricing), MIT) bundled at `src/data/ppp-tiers.upstream.json` and re-typed in `src/data/ppp-tiers.ts`. Tiers run 0.30 → 1.10 across ~100 hand-tuned countries; missing regions fall back via `FALLBACK_NEIGHBOUR` (geographic / economic proximity) and finally to `PPP_DEFAULT_COEFFICIENT = 0.60`.

**Why explicit fan-out instead of `otherRegionsConfig` / `newRegionsConfig`**: Google's auto-conversion from USD/EUR anchors only fanned out to a couple of regions in practice (the user reported "US + Mongolia only"). Explicit per-region pricing is reliable and gives us PPP control over what each region sees.

**Helper module**: `src/services/ppp-pricing.service.ts`:
- `getMultiplier(alpha2)` — chained lookup PPP_MULTIPLIERS → FALLBACK_NEIGHBOUR → 0.60 default
- `applyPpp(usd, alpha2, { round99 })` — Spotify-style round-to-.99 by default
- `expandPlayRegions(usd, exclude)` — returns ~175 USD-priced entries (Google's `convertRegionPrices` displays local currency at runtime)
- `expandAscTerritories(usd, exclude)` — returns ~155 alpha-3 (territory, target USD) pairs; caller resolves price-points
- `findClosestPricePointForPrice(appId, territory, target)` — minimises `|customerPrice − target|`; per-territory cache so each catalog is fetched once per run
- `findExactPricePointForPrice(...)` — legacy exact-match (used by `createPricing` for app-level pricing)

**Override rule**: user-listed `regional_configs` (Play) and `prices` (ASC) win. The fan-out spreads PPP entries first and user entries last, then dedupes by region/territory (`Map.set` last-write-wins).

**Per-product opt-out**: every monetization entry accepts `ppp_enabled?: boolean` (default `true`):
- `GooglePlayBasePlan.ppp_enabled`
- `GooglePlayInAppProduct.ppp_enabled`
- `AppStoreSubscription.ppp_enabled`
- `AppStoreInAppPurchase.ppp_enabled`

**ASC implementation detail (1.7.0+ — bulk CSV import)**: requires **asc CLI ≥ 1.4.0** (rorkai/App-Store-Connect-CLI, renamed from rudrankriyam). Both subscriptions and IAPs land their per-territory PPP fan-out in a **single API call** per product:

- **Subscriptions**: `asc subscriptions pricing prices import --input <csv>` (added in asc 1.4.0). KAppMaker writes a temp CSV with `territory,price,price_point_id` rows for all 175 territories and pipes it in. ~1 API call per subscription instead of ~155 — eliminates the rate-limit cascade we hit in 1.6.x.
- **IAPs**: `asc iap pricing schedules create --prices "PP_ID:DATE,..."` (already batch from earlier versions).

**Tier resolution (1.7.0+)**: Apple's price-point catalog uses globally-stable tier numbers (1..800; tier N = the same USD-equivalent across every territory). We resolve each unique PPP USD target → tier ONCE via USA's catalog (where customerPrice is in USD), then synthesise per-territory price-point IDs locally using Apple's base64 `{s, t, p}` format (s = catalog-specific identifier, t = territory alpha-3, p = `10000 + tier`). This replaced 1.6.x's broken "compare USD target to local-currency price-points" which picked the **FREE tier (¥0)** for JPN/IDR/INR/KRW/etc.

**Two catalogs, distinct IDs**:
- `appPricePoints` (`asc pricing price-points`) — for IAPs. `s = appId`.
- `subscriptionPricePoints` (`asc subscriptions pricing price-points list`) — for subscriptions. `s = subscription-internal ID` (different per subscription, must be extracted from a real USA price-point response, NOT the app ID). Mixing IDs across catalogs triggers "The provided entity is invalid".

**Idempotency on re-runs (1.7.0+)**: when a subscription / IAP `setup` call reports "already been used", KAppMaker now logs `existing — refreshing pricing` and continues into the PPP fan-out (the previous behaviour was to skip pricing entirely, leaving stale prices on re-runs). The asc CLI's `--subscription-id` and `--iap-id` flags accept the product_id directly, so the lookup is free.

**App Review screenshots (1.7.1+)**: Apple requires a review screenshot on every subscription and IAP — without one, products stay in `MISSING_METADATA` state and per-territory pricing won't "resolve" (visible via `asc subscriptions pricing prices list --resolved`). Config supports a global default and per-product overrides:

```json
{
  "review_screenshot": "Assets/appstore/review-screenshot.png",  // global default
  "subscriptions": {
    "groups": [{
      "subscriptions": [{
        "ref_name": "Premium Weekly",
        "review_screenshot": "Assets/appstore/weekly-review.png"  // optional per-product override
      }]
    }]
  },
  "in_app_purchases": [{
    "product_id": "credit_pack_10_499_myapp",
    "review_screenshot": "Assets/appstore/iap-review.png"        // optional override
  }]
}
```

Upload uses `asc subscriptions review screenshots create --file <path>` for subscriptions and `asc iap review-screenshots create --file <path>` for IAPs (NOT `asc iap images` — that's a different category for promotional images; pre-1.9.1 incorrectly uploaded there). **Idempotent on re-runs** — both paths call `view --iap-id` / `view --subscription-id` before upload; if a screenshot is already attached, the upload is skipped. **Missing files silently skipped** — if the resolved path doesn't exist, KAppMaker logs an info message and continues (the product just stays in MISSING_METADATA until a screenshot is added).

**Required size**: Apple's recommended size for App Review screenshots is **1290 × 2796 px** (iPhone 6.7" Display, portrait — matches App Store listing screenshot dimensions). Minimum is 640 × 920 px. Format: PNG or JPG. Constants are at `src/services/review-screenshot.service.ts` (`REVIEW_SCREENSHOT_TARGET_WIDTH` / `REVIEW_SCREENSHOT_TARGET_HEIGHT`).

**Auto-resize prompt (1.7.3+, exact-crop in 1.9.1+)**: when a file's dimensions don't match 1290 × 2796, KAppMaker prompts: `Resize to exactly 1290×2796 (center-crop)? (Y/n)`. On Y, sharp resizes with `fit: 'cover'` + `position: 'center'` so the output is EXACTLY 1290 × 2796 (Apple's review surface rejects off-spec dimensions). Pre-1.9.1 used `fit: 'inside'` which preserved aspect ratio but produced under-sized outputs like 1290 × 726 for non-portrait sources — Apple wouldn't accept those. Some edge pixels may be cropped if the source aspect ratio differs from 1:2.166. On N, the original file is uploaded as-is. Same prompt fires in both `create-appstore-app`'s setup flow and the standalone replace commands. Files that are already 1290 × 2796 skip the prompt entirely.

**Standalone replace commands (1.7.3+ — appstore-prefixed)**: replace existing screenshots without running the full setup flow.

```bash
# Replace screenshot on every subscription using one file
kappmaker appstore-update-subscription-review-screenshot --file ./Assets/appstore/new-review.png

# Replace screenshot on every IAP using config's review_screenshot paths
kappmaker appstore-update-iap-review-screenshot

# Target a single product
kappmaker appstore-update-subscription-review-screenshot \
    --file ./Assets/appstore/weekly-review.png \
    --product-id forevly.premium.weekly.v1.699.v1
```

Both commands use **delete + create** under the hood (not `asc … update`, which empirically doesn't swap the binary — verified that subscription `screenshots update` only marks an out-of-band upload as complete via `--uploaded`/`--checksum`, and IAP `images update --file` returns success without actually replacing). The new screenshot record gets a fresh ID.

Options:
- `--file <path>` — apply to ALL matched products. Overrides per-product `review_screenshot` in the config.
- `--config <path>` — point at a different config file.
- `--product-id <id>` — target ONE product (matches by `product_id` or `ref_name`).

**Smoke test**: `npm run test:ppp` runs `src/services/ppp-pricing.service.test.ts` — 16 assertions covering multiplier lookup, .99 rounding, fan-out length, and exclusion-set behaviour.

**Re-run idempotency on existing products (1.6.1+)**: when `gpc subscriptions push` / `gpc iap push` finds a product that already exists on Play, the CLI no longer just skips — it PATCHes the existing product with the freshly-built body (full PPP region fan-out). This is the back-fill path: a user who upgraded from 1.5.x has products that are currently US-only; a single `kappmaker gpc setup` (or just `subscriptions push` + `iap push`) re-runs and applies PPP regional pricing to all 175 regions. Subscriptions go through `PATCH /subscriptions/{id}?updateMask=basePlans,listings`; one-time products use the existing `PATCH /onetimeproducts/{id}?allowMissing=true` (already upsert). Google may reject region-removal or price-decrease changes on active base plans — the CLI logs a tip suggesting a `v1 → v2` product_id bump if that happens.

**Billable region filter (1.6.2+)**: not every ISO region is billable on Google Play at a given `regionsVersion` — sanctioned countries (AF, IR, KP, SY, CU, BY, etc.) are rejected with HTTP 400 _"Region code X is not billable at the specified regions version 2022/02"_. The CLI calls `POST /applications/{pkg}/pricing:convertRegionPrices` once per (package, base USD price) tuple, and uses the response's region keys as the authoritative billable set.

**Native-currency PPP (1.6.3+)**: Google Play also rejects `regionalConfigs` entries whose currency doesn't match the region's native currency (HTTP 400 _"Invalid currency for region code AE: expected AED but got USD"_). 1.6.2's USD-everywhere approach was wrong. `fetchConvertedRegionPrices(packageName, baseUsdMoney)` in `gpc-monetization.service.ts` now returns a `Map<region, native Money>` covering both the billable filter AND the FX conversion in one API call. `expandPlayRegionsLocal()` then multiplies each native price by the region's PPP multiplier and charm-rounds: zero-decimal currencies (JPY/KRW/CLP/ISK/VND/etc. — `ZERO_DECIMAL_CURRENCIES` set) round to X99 / X9 / X integer; decimal currencies (USD/EUR/INR/etc.) get Spotify-style "floor + .99". `buildBasePlanBody`, `buildSubscriptionBody`, and `createInAppProduct` are now async. Cache is per (packageName, baseUsdPriceString) — typical apps with 5 distinct base prices make ~5 convertRegionPrices calls per setup run.

**Two pricing modes via `ppp_enabled` (1.6.4+)**: each subscription base plan and one-time product has an opt-out flag.

- `ppp_enabled !== false` (default): explicit per-region PPP via `convertRegionPrices` + native-currency entries in `regionalConfigs[]` / `regionalPricingAndAvailabilityConfigs[]`. Full PPP control, heavier payload, ~150 entries per product. `otherRegionsConfig` is ALSO included with USD/EUR anchors (covers any future region Google adds + satisfies the "must remain present once previously set" constraint on PATCHes).
- `ppp_enabled === false`: minimal user-listed regions + `otherRegionsConfig: { usdPrice, eurPrice, newSubscriberAvailability }` (subs) or `newRegionsConfig: { availability, usdPrice, eurPrice }` (one-time products). Google auto-fans-out the USD anchor to every billable region using its FX pricing template. Smaller payload (~1 entry), no PPP discounting in lower-income markets. The legacy 1.5.x behaviour, but with the required `usdPrice` + `eurPrice` fields actually populated (1.5.x silently sent partial blocks → Google dropped them → fan-out failed).

The default is the right pick for most apps; `ppp_enabled: false` is for users who explicitly want uniform USD-anchor pricing without PPP discounts.

**Proto3 partial-Money gotcha (1.6.6+)**: Google's JSON response omits Money fields with default values — i.e. `units` is missing when the price is `< 1 unit` (e.g. `convertRegionPrices` returns `{ currencyCode: "USD", nanos: 990000000 }` for $0.99, no `units` field). `parseInt(undefined, 10) === NaN`, and once `NaN` enters the multiplication pipeline it becomes the string `"NaN"` in the request body → HTTP 400 _"Invalid value at '...price.units' (TYPE_INT64), 'NaN'"_. 1.6.6 adds `normalizeMoney()` at the convertRegionPrices boundary (defaults missing `units` to `"0"` and missing `nanos` to `0`), hardens `moneyToFloat` to coerce non-numeric inputs to 0, and adds a non-finite guard inside `applyPppCharmRound` that falls back to the source Money rather than emitting NaN.

**regionsVersion=2022/02 drift handling (1.6.8+)**: `convertRegionPrices` returns "today's" currencies + billable set, but the subscription / one-time-product PATCH uses `regionsVersion=2022/02` (matches what AndroidPoet's `playconsole-cli` hardcodes — no documented newer version). The two surfaces disagree for a handful of regions. Five known drift cases as of 2026-05:
- **BG (Bulgaria, Eurozone 2025)**, **HR (Croatia, Eurozone 2023)** — `convertRegionPrices` → EUR, `2022/02` expects BGN/HRK.
- **CI (Côte d'Ivoire)**, **CM (Cameroon)** — `convertRegionPrices` → XOF/XAF (CFA), `2022/02` expects USD.
- **MN (Mongolia)** — `convertRegionPrices` lists as billable; `2022/02` says not billable at all (different error sentence).

Three defenses (all wired in `gpc-monetization.service.ts`):
- **`KNOWN_2022_02_DRIFT_REGIONS = {BG, HR, CI, CM, MN}`** — preseed skip-list filtered out of `expandPlayRegionsLocal` (fast path, no API roundtrip).
- **`extractDriftRegions(errorText)`** parses BOTH error sentence formats from a 400 response: `Invalid currency for region code (\w+)` AND `Region code (\w+) is not billable`. Used by the retry loop in all three PATCH paths.
- **`sessionDriftCache: Map<packageName, Set<region>>`** — when a region is discovered as drifted during a PATCH (e.g. RO joining Eurozone someday), it's added to this run-scoped cache. Subsequent products in the same `gpc setup` run skip it up front instead of re-paying the 3-call discovery cost.

The retry loop accumulates `extraExclude` across up to 5 attempts per product, rebuilds the body each pass, and stops on either success or a non-drift error. The session cache ensures product N+1 starts with all of product N's discovered drift regions already excluded.

The `Committing Play Console edit: 400 Only releases with status draft may be created on draft app` warning at step 7 is unrelated (about the listings edit / track-release pipeline, not monetization). Monetization steps 8-9 run independently and now succeed even if step 7 fails.

**Post-PATCH verification + diagnostic hint (1.6.9+)**: after every successful subscription / one-time-product PATCH, `verifySubscriptionRegions` / `verifyOneTimeProductRegions` GETs the product back and logs `Stored on Google: X/Y regions available` — the authoritative count of what's actually saved on Google's side, independent of Play Console UI lag. End of `setupSubscriptions` / `setupInAppProducts` prints a one-shot diagnostic checklist (UI lag, app-level country availability in the Production track, draft-app caveats) so users have something concrete to check when Play Console still shows "USA only" after a successful run. Also: `activateBasePlan` now includes the required `packageName` / `productId` / `basePlanId` / `latencyTolerance: LATENCY_SENSITIVE` fields in the request body per the v3 discovery doc — earlier versions sent `{}` and may have silently no-op'd on Google's side.

**Existing-region preservation on PATCH (1.6.10+)**: Google's "once added, never removed" rule applies at the per-region level too — once an active base plan (or purchase option) has a regional config for `X`, every subsequent PATCH must include `X` or Google rejects with HTTP 400 _"Regional configs were removed from the base plan: X, Y, Z"_. This bit users who had Forevly-style legacy subscriptions: Google had stored `BG, CI, CM, HR, SN` on the base plan years ago at the original currencies; the CLI's fresh `convertRegionPrices` fan-out now treats those as drift (BG/HR moved to EUR post-Eurozone, CI/CM moved to XOF/XAF, MN delisted), so they got skipped from the new body — Google then saw the omission as a removal request. Fixed in 1.6.10 by reading existing state first: `fetchExistingSubscriptionState` GETs `Map<basePlanId, Map<regionCode, ExistingRegionalConfig>>` before the retry loop; `buildBasePlanBody` then echoes every previously-stored region verbatim (currency + price + availability) for regions the fresh PPP fan-out doesn't already cover. Same pattern for one-time products via `fetchExistingOneTimeProductState`. Net effect on existing products: fresh PPP fan-out for ~150 healthy regions + verbatim echo of any pre-existing drift regions = no removal-rejection, full PPP coverage on subsequent re-runs.

**Currency override for regionsVersion 2022/02 drift (1.6.11+)**: 1.6.10's "skip drift regions and re-inject as unavailable" approach was suboptimal. The drift regions (except MN) are actually billable at 2022/02 — just under a different currency than the live `convertRegionPrices` API returns. 1.6.11+ replaces drop-and-mark-unavailable with a per-region currency override inside the fresh fan-out (`applyCurrencyOverrideFor2022_02` in `gpc-monetization.service.ts`):

| Region | Live API | 2022/02 expects | Resolution |
|---|---|---|---|
| BG (Bulgaria) | EUR | BGN | Convert via the 1 EUR = 1.95583 BGN currency-board peg |
| HR (Croatia) | EUR | EUR ✓ | No override (Google updated 2022/02 retroactively after HR's 2023 Eurozone entry) |
| CI / CM / SN | XOF / XAF | USD | Replace with the USD anchor (PPP multiplier still applies on top) |
| MN (Mongolia) | billable | NOT BILLABLE | Drop from fan-out; in `NEVER_BILLABLE_AT_2022_02` |

The override runs BEFORE the PPP multiplier, so per-tier discounts stay consistent regardless of currency representation. Surprising real-world finding: 2022/02 was retroactively patched for HR's Eurozone entry but NOT for BG's (BG joined Jan 2025). Verified via real 400 responses on Forevly's legacy subscriptions.

**Result**: products land with `173/173 regions available` on Play Console (vs 168/173 in 1.6.10 where 5 drift regions were force-unavailable). BG users see BGN-priced subs, CI/CM/SN users see USD with their PPP tier applied, AR/IN/PK get the steepest discounts, CH/NO pay the premium. Google's storage layer auto-converts our submitted currency to each region's actual current currency when displaying to end users (we send BG/BGN → Google displays EUR; we send CI/USD → Google displays XOF).

**`newRegionsConfig.availability: AVAILABLE` always (1.6.11+)**: for one-time products `newRegionsConfig` is now ALWAYS included when there's a USD anchor (was previously only set when `ppp_enabled: false`). Mirrors what subscriptions already do via `otherRegionsConfig`. In Play Console this surfaces as **"New countries and regions: Available"** — any region Google adds to its billable catalog in the future automatically gets USD/EUR-anchor pricing.

**`NEVER_BILLABLE_AT_2022_02` + `--recreate-stuck` (1.6.11+)**: regions like MN that 2022/02 removed entirely cannot coexist with the PATCH at all. The CLI detects this deadlock (region rejected even with NO_LONGER_AVAILABLE/forceUnavailable+correct-currency) and tracks the product in `stuckOneTimeProducts` / `stuckSubscriptions`. Final summary lists stuck products with three fix options:
1. **Recommended** — bump `product_id` in config (`v1` → `v2`). New product, full PPP fan-out, no downtime.
2. `--recreate-stuck` — opt-in flag that DELETEs the stuck product then recreates. WARNING: Google soft-deletes one-time products — the productId is reserved for a few minutes to a few hours after deletion. CLI catches the "Product ID already in use" error and tells the user to wait + re-run.
3. Manually delete on Play Console UI, wait, re-run.

**Refactor (1.6.12)**: extracted `handleSubscriptionRetry` + `handleOneTimeProductRetry` helpers to dedupe the retry/deadlock logic that was copy-pasted across the create-subscription, update-subscription, and create-IAP loops (~80 lines saved). Demoted internal-only exports (`priceToMoney`, `deriveAnchorPrices`, `activateBasePlan`) to private. Net file size: 1433 → 1320 lines.

**Three nasty PATCH gotchas debugged in 1.6.5**:
1. **`convertRegionPrices` response field is `price`, not `regionPrice`.** Earlier docs guessed `regionPrice` and got 0 regions back (empty fan-out → US-only PATCH → "Cannot remove region X" downstream).
2. **Subscriptions: `otherRegionsConfig` is sticky.** Once Google has stored an `otherRegionsConfig` on a base plan, every subsequent PATCH must include it again (HTTP 400 _"is missing the other regions config, which is now required since it has been previously set"_). `buildBasePlanBody` now always includes it when there's a USD anchor.
3. **One-time products: existing `purchaseOptionId` must be preserved.** Legacy products were created with `purchaseOptionId: "buy"`; KAppMaker-created ones use `"default"`. PATCH bodies must list ALL existing options or Google rejects with _"Product must list all of its existing purchase options. Missing: buy"_. `fetchExistingPurchaseOptionId` does a one-shot GET to read the actual ID and reuse it on the PATCH + the subsequent activate call.

### Subscription Product ID Alignment

Subscription IDs are auto-generated by `create-appstore-app`, `create-play-app` (`gpc setup`), and `adapty setup` so they all link automatically:

| Platform | Field | Format | Example ($6.99 weekly) |
|---|---|---|---|
| App Store Connect | `productId` | `{appname}.premium.{period}.v1.{price}.v1` | `myapp.premium.weekly.v1.699.v1` |
| Google Play | `productId` (subscription) | `{appname}.premium.{period}.v1` | `myapp.premium.weekly.v1` |
| Google Play | `basePlanId` | `autorenew-{period}-{priceDigits}-v1` | `autorenew-weekly-699-v1` |
| Adapty | `ios_product_id` | matches ASC `productId` | `myapp.premium.weekly.v1.699.v1` |
| Adapty | `android_product_id` | matches Play `productId` | `myapp.premium.weekly.v1` |
| Adapty | `android_base_plan_id` | matches Play `basePlanId` | `autorenew-weekly-699-v1` |

### Credit Pack (IAP) Product ID Alignment

Default consumable in-app purchases (credit packs) ship in all three templates and use the **same product ID across ASC, Google Play, and Adapty** so app code only needs one constant. The auto-fill kicks in for any IAP/product entry that has a `credits` numeric field (other custom IAPs are left untouched).

| Field | Format | Example (10 credits, $4.99) |
|---|---|---|
| Product ID (ASC, Play, Adapty iOS, Adapty Android) | `credit_pack_{credits}_{priceDigits}_{appname}` | `credit_pack_10_499_myapp` |
| ASC `ref_name` | `{AppName} {LocalizedName} v1 ({price})` | `MyApp Basic Credit Pack v1 (4.99)` |

**Default credit packs** ($USD): Basic — 10 credits / $4.99, Pro — 30 credits / $9.99, Ultimate — 80 credits / $19.99.

The Adapty template also adds a `Credits Paywall` (linking the three credit pack products) and a `credits_pack` placement (Adapty `developer_id`) so the app can fetch them with `Adapty.getPaywall("credits_pack")`.

### Quick-add commands (`subscription add` / `iap add`)

Shortcuts for adding a single new subscription or credit-pack IAP without editing config files. `subscription add` pushes to Google Play + App Store Connect only. `iap add` pushes to Play + ASC + Adapty (kept for the credit-pack flow that needs Adapty to bridge both stores into one product).

```bash
# Subscription: pushes to Play + ASC (Adapty intentionally NOT included)
kappmaker subscription add --period weekly --price 9.99

# Single platform
kappmaker subscription add --period monthly --price 19.99 --platform android

# Credit pack IAP — still pushes to Play + ASC + Adapty
kappmaker iap add --credits 50 --price 14.99
kappmaker iap add --credits 100 --price 24.99 --platform ios
```

**Behaviour:**
- **Push only, no config writes** — the local `Assets/*-config.json` files are read for context (app name, package, bundle ID, ASC subscription group) but never modified. Source of truth lives on the stores.
- **Per-platform graceful skip** — if any platform's prerequisites aren't met (missing config, no service-account key, no uploaded build, no ASC group), that platform is logged as skipped and the others still run. The command errors only if ALL selected platforms were skipped.
- **Adapty intentionally excluded from `subscription add`** — Adapty mirrors store prices at runtime via store integrations (per the existing "Adapty Prices Are Not Developer-Set" section), so creating a new subscription via `adapty.createProduct` adds noise without unlocking anything the SDK can't already fetch live from the stores. Adapty product entries remain managed via `kappmaker adapty setup` for the canonical product set. `iap add` still includes Adapty because credit packs use Adapty paywalls + `credit_pack_access` to gate consumable entitlements that have no store-side equivalent.
- **Auto-aligned IDs** — `subscription add --period weekly --price 9.99` produces:
  - ASC `product_id`: `{appname}.premium.weekly.v1.999.v1`, `ref_name`: `{AppName} Premium Weekly v1 (9.99)`
  - Play `product_id`: `{appname}.premium.weekly.v1`, base plan `autorenew-weekly-999-v1`
- **`--product-version <n>` for new product lines** — bumps every `v` marker in the IDs together. `--product-version 2` turns the above into `{appname}.premium.weekly.v2.999.v2` (ASC — both `v` markers bump), `{appname}.premium.weekly.v2` (Play), `autorenew-weekly-999-v2` (Play base plan), and `{AppName} Premium Weekly v2 (9.99)` (ref_name). Lets you stand up a fresh product family alongside the existing v1 — useful for stuck-product workarounds per the v3 PATCH constraints, or for relaunching pricing without disturbing v1 subscribers. For IAPs, `--product-version 2` appends `_v2` to the credit-pack ID (`credit_pack_10_499_myapp_v2`); v1 stays unsuffixed for back-compat with template defaults.
- **`--description <text>`** — explicit localized description (en-US). Defaults to a period-derived sentence: `weekly → "Full access for one week."`, `monthly → "Full access for one month."`, `twomonths → "Full access for two months."`, `quarterly → "Full access for three months."`, `semiannual → "Full access for six months."`, `yearly → "Full access for one year."`. Applied to BOTH the ASC localization `description` AND the Play listing `description` so the two stores stay in sync. (Previously both `name` and `description` shared a single value — fixed in this iteration.)
- **`--review-screenshot <path>`** — per-call override of the App Review screenshot. Defaults to the top-level `review_screenshot` from `Assets/appstore-config.json`. Set on the in-memory subscription / IAP object AND passed as `defaultReviewScreenshot` so `ascMoney.setupSubscriptions` / `setupInAppPurchases` will resize + upload it (subject to the existing 1290 × 2796 prompt). Missing files are silently skipped per existing convention.
- **`--group <ref>` + `--group-name <text>` for auto-creating ASC subscription groups** — when the group reference doesn't yet exist on App Store Connect, `subscription add` auto-creates it via `asc subscriptions setup --group-reference-name <ref>` AND attaches an en-US localization so the group has a proper App-Store-facing display name (Apple requires one). Resolution order for the localized name: `--group-name <text>` → matching group's existing `localizations[0].name` in `Assets/appstore-config.json` → fallback `"Premium Access"`. For pre-existing groups, the duplicate-create localization call gracefully fails (`allowFailure: true` in `setupSubscriptions`) so existing names stay intact. Lets users create entirely new groups like `myapp.premium.v3` without first running `create-appstore-app` or editing the config.
- **Idempotency** — Play and ASC pushes go through the same `setupSubscriptions` / `setupInAppProducts` paths as `gpc subscriptions push` and `create-appstore-app`, so re-running the same `subscription add` is safe (existing products get pricing refreshed with full PPP fan-out). For `iap add`, Adapty also pre-lists products by title and skips if already present.
- **`--platform` semantics** — for `subscription add`: `all` (default) = Play + ASC, `ios` = ASC only, `android` = Play only. For `iap add`: `all` = Play + ASC + Adapty (single Adapty product spans both `ios_product_id` and `android_product_id`), `ios` = ASC only, `android` = Play only.
- **No `--free-trial`** — intro offers / free trials aren't wired through these commands yet; for those, fall back to editing the config file and running `gpc subscriptions push` / `create-appstore-app`.

Source: [src/commands/subscription-add.ts](src/commands/subscription-add.ts), [src/commands/iap-add.ts](src/commands/iap-add.ts), [src/services/product-id.builder.ts](src/services/product-id.builder.ts).

### Adapty Access Levels (`access_levels[]`)

Adapty defaults ship two access levels: `Premium` (subs) and `credit_pack_access` (credit packs). Each entry in `products[]` carries an `access_level_sdk_id` so subscriptions and consumable credit packs unlock different entitlements. The orchestrator builds an `sdk_id → access-level UUID` map and routes each product accordingly.

Legacy configs with the singular `access_level` field are auto-migrated to `access_levels` on load (`migrateLegacyAccessLevel` in `adapty-setup.ts`). On first run for an app that previously had only `Premium`, the missing `credit_pack_access` is created automatically.

### Adapty Consumable Period Workaround

The Adapty CLI v0.1.5 (the current shipping version) hardcodes a period whitelist that does NOT include `consumable` — only `weekly|monthly|two_months|trimonthly|semiannual|annual|lifetime`. The Adapty REST API at `https://api-admin.adapty.io/api/v1/developer/apps/{appId}/products/` does accept `consumable` directly. `adapty.service.ts` routes any product with `period: "consumable"` through a direct REST call (`createProductViaApi`) using the cached token at `~/.config/adapty/config.json` (or `ADAPTY_TOKEN` env var). Subscriptions and lifetime products still go through the CLI. When/if a future Adapty CLI release adds `consumable` to its whitelist, the API workaround becomes a no-op transparently.

### Adapty Prices Are Not Developer-Set

Adapty's developer API **strips price-related fields** from product create/get responses (verified via OPTIONS metadata: "_Strips response to plan-specified fields (id, title, vendor_products)_" and confirmed against 7 price-field variants — `price`, `currency_code`, `localized_price`, `price_string`, `display_price`, `vendor_products.app_store.price`, `prices[]` — all silently dropped). Prices show up in the Adapty dashboard **only after** the user connects App Store Connect + Google Play integrations in the dashboard (Settings → Integrations) — those are dashboard-only steps; the CLI/API doesn't expose them.

The `price` field on each `AdaptyProduct` is therefore used only by KAppMaker for:
1. ID generation — embedded as `priceDigits` in subscription / credit-pack product IDs
2. Mirroring into ASC + GPC where prices ARE developer-set (we drive both via `create-appstore-app` and `gpc setup`)

`printPostSetupChecklist()` at the end of `adapty setup` prints a one-time reminder pointing the user to the Adapty dashboard integrations page. Mobile SDK behaviour is unaffected by the dashboard view — Adapty fetches live prices from native store APIs at runtime regardless.

### Adapty Idempotency

`adapty setup` is idempotent on re-run because the orchestrator pre-lists existing products / paywalls / placements (via `adapty products list`, `paywalls list`, `placements list`) and skips any matched by title (products / paywalls) or `developer_id` (placements). Saved IDs in `Assets/adapty-config.json` (`adapty_product_id`, `paywall_id`) are also reused as a fast path.

The subscription name (shown on Play's checkout sheet) is auto-filled as `{AppName} Premium {PeriodLabel}` (e.g. `Mangit Premium Weekly`).

**`priceDigits`** is the price with the decimal removed (e.g. `6.99` → `699`, `29.99` → `2999`). `{period}` is one of `weekly`, `monthly`, `twomonths`, `quarterly`, `semiannual`, `yearly` — derived from the App Store subscription period or the Google Play `billing_period` (ISO 8601: `P1W`, `P1M`, `P2M`, `P3M`, `P6M`, `P1Y`).

### Privacy Interactive Prompts

During interactive config setup (when no config file exists), `create-appstore-app` asks whether the app accesses user content (e.g., AI image/video wrapper). If yes, `PHOTOS_OR_VIDEOS` and `OTHER_USER_CONTENT` entries are added to privacy data usages (both as `APP_FUNCTIONALITY` / `DATA_NOT_LINKED_TO_YOU`).

### App Store Global Defaults

Stored at `~/.config/kappmaker/appstore-defaults.json`. Used by `create-appstore-app` as a base layer — shared fields like review contact, privacy, age rating, encryption, subscriptions, and credit-pack IAPs are loaded from here.

Config resolution: built-in template → global defaults → local `./Assets/appstore-config.json` → interactive prompts.

`kappmaker config appstore-defaults --init` backfills missing arrays (e.g. `in_app_purchases` on pre-1.4 saved defaults) from the built-in template. The `deepMerge` helper in `create-appstore-app.ts` also skips empty override arrays so a stale `in_app_purchases: []` in saved defaults doesn't wipe out the template's credit-pack entries during a regular `create-appstore-app` run.

### Adapty Global Defaults

Stored at `~/.config/kappmaker/adapty-defaults.json`. Used by `adapty setup` as a base layer — shared fields like access level, products (subs + credit packs), paywalls (Default / Onboarding / Credits), and placements (default / onboarding / `credits_pack`).

Config resolution: built-in template → global defaults → local `./Assets/adapty-config.json` → interactive prompts.

`kappmaker config adapty-defaults --init` snapshots the built-in template (with all default credit-pack entries baked in) into the global defaults file. Re-running `--init` against an existing file backfills any of `products`, `paywalls`, `placements` that are empty/missing from the template — useful when upgrading from pre-1.4 defaults that didn't have credit packs. The `deepMerge` helper in `adapty-setup.ts` similarly preserves template content when globals contain empty arrays.

### Google Play Console management (`kappmaker gpc`)

Talks directly to `androidpublisher.googleapis.com/v3` via a built-in service-account JWT → access-token flow (no external CLI, no new npm deps — uses Node's `crypto` and `fetch`). Auth shares `googleServiceAccountPath` with `publish --platform android`.

**Command tree:**

```
kappmaker gpc
├── setup                  # Full 11-step orchestrator (create-play-app is an alias)
├── app-check              # GET /subscriptions probe (migration-safe) — 0 if found, 2 if missing
├── listings
│   └── push               # Start edit → updateDetails → updateListing per locale → commit
├── subscriptions
│   ├── list               # GET /applications/{pkg}/subscriptions
│   └── push               # Idempotent create + base plan activate (new monetization API)
├── iap
│   ├── list               # GET /applications/{pkg}/oneTimeProducts (new monetization API)
│   └── push               # Idempotent create via PATCH /onetimeproducts/{id}?allowMissing=true + activate purchase option
└── data-safety
    └── push               # POST /applications/{pkg}/dataSafety (pass-through body)
```

**Setup flow (11 steps):**

1. Validate `googleServiceAccountPath` and obtain an access token
2. Load config (`./Assets/googleplay-config.json` or interactive prompts)
3. Review summary and confirm
4. Verify app exists on Play Console (fails fast with a deep link if not — Google does not allow app creation via the public API)
5. Update app details (default language + contact website/email/phone) inside an edit
6. Update store listings per locale (title, short/full description, video). Empty listing titles are auto-filled from `config.app.name`
7. Commit the edit
8. Create subscriptions via the new monetization API (`subscriptions` → base plans → activate). Base plans are made available to all ~175 Play regions; regions without explicit prices get auto-converted pricing from Google
9. Create one-time in-app products via the new monetization API (`monetization.onetimeproducts.*`) with an activated `default` purchase option
10. Update data safety declaration. Converts user-facing JSON (`data_safety.answers`) to Google's CSV format via `buildDataSafetyCsv()`, using a bundled canonical template at `src/templates/data-safety-template.json` (extracted from the [fastlane-plugin-google_data_safety](https://github.com/owenbean400/fastlane-plugin-google_data_safety) canonical helper). KAppMaker's default answers mirror the iOS App Store privacy set (USER_ID collected for app functionality + account management; DEVICE_ID collected for app functionality + advertising + account management; CRASH_DATA/PERFORMANCE_DATA/DIAGNOSTICS/USER_INTERACTION collected for analytics). Escape hatch: `data_safety_csv_path` → path to a Play-Console-exported CSV, uploaded verbatim.
    - **Account creation:** `PSL_ACM_NONE` (no account creation)
    - **Data deletion:** omitted (optional question)
    - **App activity:** only App interactions (`PSL_USER_INTERACTION`), NOT "Other app activity"
    - **Data handling for ALL types:** ephemeral=YES, user control=REQUIRED (can't turn off), collected only (not shared)
    - **Encrypted in transit:** YES
11. Print a full checklist of manual-only Play Console declarations that the Publisher API does NOT expose: content rating (IARC), target audience, ads, health apps, financial features, government apps, news apps, gambling, COVID-19 tracing, app access, advertising ID usage, families policy, and app pricing tier. Verified against the v3 discovery document — none of these have REST endpoints.

**Idempotency:** `subscriptions push` and `iap push` call `listSubscriptions`/`listInAppProducts` first and skip already-existing product IDs / SKUs. Safe to rerun.

**Individual push commands** reuse the same config file (`Assets/googleplay-config.json`) and operate on just one section — useful when iterating on listings copy or subscription prices without rerunning the full flow. All require the config to already exist (run `gpc setup` first or create it manually).

**`gpc app-check`** is a side-effect-free probe (GET, no edit created) — exits 0 if the app exists and 2 if it doesn't.

### Default Inputs

- `translate-screenshots` defaults to `MobileApp/distribution/ios/appstore_metadata/screenshots/en-US` when no source dir is provided. Output defaults to `MobileApp/distribution` if it exists, otherwise falls back to the parent of the source directory.

## Defaults

- Template repo: `git@github.com:KAppMaker/KAppMaker-All.git`
- Package pattern: `com.measify.<appname>` (when `bundleIdPrefix` is set to `com.measify`)
- After cloning, origin is renamed to upstream (user adds their own origin later)
