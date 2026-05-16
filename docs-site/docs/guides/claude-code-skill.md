---
sidebar_position: 3
title: Claude Code Skill
---

# Claude Code Skill

If you use [Claude Code](https://claude.ai/code), you can install the `/kappmaker` skill to run any CLI command through natural language — with automatic prerequisite checks, guided setup, and inline error recovery.

## Install

```bash
npx skills add KAppMaker/KAppMaker-CLI --skill kappmaker
```

Or via the Claude Code plugin system:

```
/plugin marketplace add KAppMaker/KAppMaker-CLI
/plugin install kappmaker@KAppMaker-CLI
```

## Usage

Once installed, just describe what you want in plain English. Claude will check your config, verify API keys are set, and walk you through any missing prerequisites before running the command.

**Context-aware**: when a command needs inputs you didn't pass (app description, app name, brand color, tagline, keywords, etc.), the skill reads your project's `AiGuidelines/` folder first (`app-idea.md`, `prd.md`, `keywords.md`, `brand.md`), then `README.md`, then existing ASO metadata under `MobileApp/distribution/`, and fills in what it finds. You're only prompted for things that aren't already written down. State the source briefly when an inference is made so you can correct it.

### App Setup

```
/kappmaker create MyApp
/kappmaker create MyApp using my custom template at github.com/me/my-template
/kappmaker refactor package name to com.example.myapp and app name to MyApp
/kappmaker bump the app version
/kappmaker bump version to 2.0.0
```

### AI Image Tools

```
/kappmaker create a logo for my fitness tracking app
/kappmaker create a logo with prompt "minimalist dumbbell icon, blue gradient"
/kappmaker generate an image with prompt "a cozy coffee shop illustration"
/kappmaker generate iOS app icons from my logo                    # Mints all 11 sizes for AppIcon.appiconset + Contents.json
/kappmaker generate Android app icons from my logo                # Mints mipmap-* webps (5 densities × 3 files) + adaptive XML + colors.xml entry
/kappmaker generate Android icons with background "#0F0A0D"       # Custom adaptive backdrop color
/kappmaker generate a Play Store feature graphic                  # 1024×500 banner with app name, subtitle, brand color
/kappmaker generate a feature graphic with primary color "#FF3B30" and subtitle "Your daily workout partner"
/kappmaker remove background from logo.png
/kappmaker enhance image quality of banner.png
/kappmaker split this 2x2 grid image and keep images 1 and 3
/kappmaker convert all images in assets/ to webp
/kappmaker convert logo.png to webp with quality 90
```

### Screenshots

**Generate** marketing screenshots from a text prompt (OpenAI prompt → fal.ai image grid → split into 8 individual screenshots):

```
/kappmaker generate screenshots for my fitness app
/kappmaker generate screenshots for "a meditation app with sleep stories" using style 3
/kappmaker generate screenshots for a recipe app with reference images at ./Assets/screenshots
/kappmaker generate screenshots at 4K resolution with style 5 (full-bleed UI)
```

**Translate** existing screenshots to other locales (combines into grid, sends to fal.ai per locale in parallel, splits back into individual images):

```
/kappmaker translate screenshots to German and Japanese
/kappmaker translate screenshots to de-DE, fr-FR, ja-JP, ko-KR, zh-CN
/kappmaker translate screenshots from ./Assets/screenshots/en-US to all supported locales
/kappmaker translate screenshots to all Spanish variants  # es-ES, es-419 (es-MX), pt-BR if relevant
/kappmaker translate the screenshots in MobileApp/distribution/ios/appstore_metadata/screenshots/en-US to pt-BR, ru-RU, tr-TR
```

For text-side localization (App Store metadata fields), see [ASO Metadata Localization](#aso-metadata-localization) below — translate screenshots and localize metadata together for fully-localized listings.

### ASO Keyword Research

Skill-driven workflow that finds high-value keywords for your app — clustered by sub-niche, scored by popularity and difficulty — and saves them to `AiGuidelines/keywords.md`. Uses the [Astro MCP](https://tryastro.app/docs/mcp/) tools (`search_app_store`, `extract_competitors_keywords`, `get_keyword_suggestions`, etc.) when they're connected; falls back to a manual brainstorm when they aren't. The output is the natural input to **ASO Metadata Localization** (Mode 1) below — research first, then expand the chosen keywords across the 9 US-indexed locales.

See the [Keyword Research](../aso/keyword-research.md) reference for the full procedure, output format, and Astro MCP setup.

**Basic** (auto-discovers competitors from the App Store, default filters `popularity ≥ 30`, `difficulty ≤ 45`):

```
Using kappmaker, research keywords for AI image generator
Using kappmaker, find aso keywords around manga translation
Using kappmaker, keyword research for drift coaching
Using kappmaker, find sub-niche keywords for photo editor

# Short forms — router picks these up too
/kappmaker keyword research drift coaching
/kappmaker find aso keywords for ai car designer
```

**With explicit competitors** (skip auto-discovery, target specific apps you already know rank well):

```
Using kappmaker, keyword research for drift coaching competitors="Driftbox, RaceChrono, Harry's LapTimer"
Using kappmaker, find aso keywords for photo editor competitors="PicsArt, Lightroom, Snapseed, VSCO"
Using kappmaker, research keywords for ai image generator competitors="DALL-E, Midjourney, Lensa, Wonder"
```

**Stricter filters** (when the base topic is competitive and you want only low-difficulty long-tails):

```
Using kappmaker, find aso keywords for fitness app min_popularity=40 max_difficulty=35
Using kappmaker, keyword research for "ai photo" min_popularity=50 max_difficulty=30  # high-volume, low-competition only
```

**No base keyword given** (workflow derives from the project itself):

```
Using kappmaker, research keywords for my app
# → reads AiGuidelines/prd.md, AiGuidelines/app-idea.md, or the en-US name/subtitle and proposes a base keyword
# → confirms with you before proceeding
```

**Astro MCP not connected** — the workflow tells you upfront. You can either install Astro MCP (https://tryastro.app/docs/mcp/), or reply `brainstorm without astro` and the workflow produces 30–50 candidate keywords from category knowledge with `?` in the popularity/difficulty columns — same cluster structure, no scoring confidence:

```
Using kappmaker, research keywords for "manga translator"
# → "Astro MCP is not connected. Either install/connect it, or say 'brainstorm without astro' to continue."
brainstorm without astro
# → writes AiGuidelines/keywords.md with unscored candidates clustered by sub-niche
```

**Chain into metadata localization** — `AiGuidelines/keywords.md` ends with a ready-to-paste command line that uses the top picks:

```
# After keyword research, the file's last section shows something like:
#   Using kappmaker, localize metadata mode=keyword-expansion keywords="ai art generator, text to image ai, ..."
# Just paste that into the next message to fan the keywords across the 9 US-indexed locales.
```

### ASO Metadata Localization

Skill-driven workflow that generates per-locale text metadata (`name`/`subtitle`/`keywords`/`description` on iOS, `title`/`short_description`/`full_description` on Android) directly into Fastlane-compatible folders. No `kappmaker` binary command — the skill reads your `en-US` source files, applies the ASO strategy you pick, and writes the localized output files using the Read/Write tools.

Pick the strategy explicitly — the workflow never mixes the two. See the [ASO Guidelines](../aso/guidelines.md) page for the trade-off and [Metadata Localization](../aso/metadata-localization.md) for the full reference.

**Mode 1 — keyword expansion** (English content in 9 US-indexed locales, different keywords in each → multiplies indexed keyword surface in the US App Store):

```
Using kappmaker, localize metadata mode=keyword-expansion keywords="drift coach, lap timer, ai car tuner, ghost lap, apex finder, suspension setup, racing line, telemetry analyzer, sector times, track day app"

Using kappmaker, localize metadata mode=keyword-expansion keywords="manga translator, comic translator, panel scan, ocr manga, raw manga, scanlation, japanese manga, korean manhwa, chinese manhua, webtoon translate"

Using kappmaker, localize metadata mode=keyword-expansion keywords="ai fitness coach, workout planner, gym tracker, hiit timer, calorie counter, macro tracker, weight log, progress photos, home workout, push-up counter, plank timer, rep counter"

# Short form — the skill router picks this up too
/kappmaker aso keyword expansion with keywords: photo editor, ai filters, portrait blur, background remover, color grading, beauty retouch, selfie editor, raw photo support
```

**Mode 2 — market localization** (native per-locale copy adapted to local search behavior and culture — not literal translation):

```
# Single locale — useful when iterating on one market's copy
Using kappmaker, localize metadata mode=market-localization locales="ja"

# Hand-picked locale list
Using kappmaker, localize metadata mode=market-localization base=en-US locales="de-DE, fr-FR, ja, es-ES"
```

**Locale presets** — natural-language shortcuts the skill recognizes so you don't have to memorize codes:

```
# Tier 1 — 10 essential ASO markets (Western Europe + East Asia + LATAM giants)
# Locales: de-DE, fr-FR, es-ES, es-MX, ja, ko, zh-Hans, pt-BR, ru, it
Using kappmaker, localize metadata to the top 10 locales
Using kappmaker, localize metadata to essential locales
Using kappmaker, localize aso for tier 1 markets

# Tier 2 — 15 locales (Tier 1 + Italy/NL extras + MENA + Eastern Europe)
# Locales: de-DE, fr-FR, es-ES, es-MX, ja, ko, zh-Hans, pt-BR, ru, it, nl-NL, tr-TR, ar-SA, pl, zh-Hant
Using kappmaker, localize metadata to the top 15 locales
Using kappmaker, localize aso for the top 15 markets
Using kappmaker, localize to tier 1 plus tier 2 markets

# Tier 3 — 20 locales (Tier 2 + South / Southeast Asia)
# Locales: + hi, id, vi, th, fr-CA
Using kappmaker, localize metadata to the top 20 locales
Using kappmaker, localize aso to the top 20 markets including South and Southeast Asia

# Everything supported — all 30 locales from the Mode 2 table
Using kappmaker, localize metadata to all supported locales
Using kappmaker, localize aso to every locale
Using kappmaker, localize metadata for every market
```

**Region presets** — pick locales by geography or language family:

```
# European markets
Using kappmaker, localize metadata to all European locales
# → de-DE, fr-FR, es-ES, it, nl-NL, pt-BR (Portuguese), pl, ru, tr-TR, sv, da, no, fi, el, cs, hu, ro, uk

# East Asia
Using kappmaker, localize metadata to East Asian locales
# → ja, ko, zh-Hans, zh-Hant

# Southeast Asia
Using kappmaker, localize aso to Southeast Asian markets
# → id, ms, th, vi

# Spanish-speaking markets (both variants)
Using kappmaker, localize metadata for Spanish locales
# → es-ES, es-MX

# Chinese-speaking markets (both scripts)
Using kappmaker, localize aso for Chinese locales
# → zh-Hans (Mainland), zh-Hant (Taiwan / HK)

# Arabic / MENA
Using kappmaker, localize metadata for MENA
# → ar-SA (single locale; Apple and Google both use one Arabic folder)
```

**Hand-picked subsets**:

```
# Pass codes directly — the workflow accepts iOS or Play form
Using kappmaker, localize metadata mode=market-localization locales="pt-BR, ru, tr, pl, id, vi, th"

# Natural-language list
Using kappmaker, localize metadata to German, Japanese, Korean, and Brazilian Portuguese

# Mix presets with extras
Using kappmaker, localize to the top 10 locales plus hi and id
Using kappmaker, localize aso for tier 1 markets but skip ru and zh-Hans

# Short forms
/kappmaker localize aso to German, Japanese, and Brazilian Portuguese
/kappmaker localize metadata for de-DE and fr-FR using native market copy
```

> **Tier guidance**: The "top 10 essentials" presets are tuned for revenue + install volume on both stores combined. If your app is Android-only and India / Southeast Asia heavy, the Tier 3 (top 20) preset is a better default than Tier 1. If you're a paid utility / productivity app, Tier 1 is the right default. When in doubt, start with `top 10`, ship, look at Apple Search Ads + Google Play Console country breakdowns, then expand.

**Bootstrap (works even when `en-US` doesn't exist yet)**:

If you haven't filled in `MobileApp/distribution/ios/appstore_metadata/texts/en-US/` and the Android counterpart yet, the workflow asks for a 1–2 sentence app description and writes `en-US` first — then runs the rest of the procedure. Never fails because the base is missing.

```
Using kappmaker, localize metadata mode=keyword-expansion keywords="drift coach, lap timer, ai car tuner, ..."
# When prompted: "Briefly describe the app and its core value (1–2 sentences):"
# You reply: "Drift Coach is a real-time track-day app that scores your drift lines,
# tunes your suspension, and gives AI feedback after every lap."
# The skill writes en-US first, then fans out to the 9 US-indexed locales.
```

**What gets enforced automatically**:

- iOS char limits: `name` ≤ 30, `subtitle` ≤ 30, `keywords` ≤ 100 (no spaces after commas), `description` ≤ 4000
- Android char limits: `title` ≤ 30, `short_description` ≤ 80, `full_description` ≤ 4000
- No word repeats across iOS `name`/`subtitle`/`keywords` within a locale
- No brand name or filler words (`app`, `best`, `free`, etc.) in iOS keywords
- Front-loaded primary keyword in `name` / `title` (position-weighted ranking)
- Mode 2 only: native-feel test — no machine-translated phrasing

A summary table is printed at the end showing per-field character counts for every locale, with any cell at ≥ 95% of cap flagged.

**Pair with screenshot translation**:

Text-side ASO + image-side ASO together produce a fully-localized App Store and Play Store listing. Typical sequence:

```
/kappmaker translate screenshots to de-DE and ja
# Then in the same session:
Using kappmaker, localize metadata mode=market-localization locales="de-DE, ja"
```

### Store Publishing Setup

```
/kappmaker set up App Store Connect
/kappmaker set up Google Play Console
/kappmaker set up Adapty subscriptions and paywalls
```

### Google Play Console

```
/kappmaker push store listings to Google Play
/kappmaker push subscriptions to Google Play
/kappmaker push in-app purchases to Google Play
/kappmaker push data safety to Google Play
/kappmaker list subscriptions on Google Play
/kappmaker check if my app exists on Google Play
```

### Build & Publish

```
/kappmaker configure Fastlane
/kappmaker generate Android signing keystore
/kappmaker build Android release
/kappmaker publish to Android
/kappmaker publish to iOS
/kappmaker publish to both stores
```

## End-to-End: from idea to production

A complete sequence to take an app from "I have an idea" to "live on both stores". The sequence has two halves with **app development in between** — kappmaker handles the bookends, and you (and Claude) write the actual app features in between.

```
Pre-development                  →  [ you build the app ]  →  Post-development
─────────────────                                             ────────────────
1. Scaffold project                                           6. Generate screenshots (needs real UI)
2. ASO keyword research                                       7. Generate Play Store feature graphic
3. Logo                                                       8. Localize metadata
4. iOS app icons (from logo)                                  9. Translate screenshots
5. Android app icons (from logo)                              10. Store setup (ASC, Play, Adapty)
                                                              11. Build & sign
                                                              12. Version & publish
```

A few things worth knowing about this order:

- **Keyword research is pre-development, not post.** Searching for what users actually type ("ai car designer", "drift coach", "hairstyle try-on") usually surfaces sub-niches you hadn't considered — and those findings should shape the PRD, the feature list, and the value prop you're about to build. Run `Using kappmaker, research keywords ...` early; the resulting `AiGuidelines/keywords.md` becomes input to refining your PRD / app-idea documents in `AiGuidelines/` before development starts.
- **Logo is also pre-development** — it gets baked into the app icon, splash screen, and in-app branding. The app code itself references it. Generating it after keyword research means the brand can reflect the niche the research surfaced.
- **iOS app icons come right after the logo** — `generate-ios-icons` is a pure resize step (sharp, no AI) that consumes the logo and writes the full `AppIcon.appiconset/` directory the iOS app's Asset Catalog references. Run it once after the logo settles; re-run if the logo changes.
- **Android app icons come right after iOS icons** — `generate-android-icons` is the same kind of pure resize step, writing all `mipmap-*` density variants + the adaptive icon XML files + the `ic_launcher_background` color entry in `values/colors.xml`. Run it alongside the iOS icons so both platforms ship with the same brand.
- **Feature graphic is post-development** — even though it doesn't show actual UI, it needs the brand color, final app name, and subtitle that you typically lock in only after the product takes shape. Generating it alongside screenshots also lets you reuse the same screenshot files inside the banner's device frames.
- **Screenshots, feature graphic, ASO metadata, store listings, build, and publish are all post-development** — they all describe or depict a real product. Doing them before the app exists just creates work you'll redo.

### Copy-paste prompt

If you want Claude to drive the whole sequence in one shot, paste this single message into a Claude Code session. Replace the four `<UPPERCASE_PLACEHOLDERS>` with your specifics — everything else is reusable as-is. The skill will pause between phases for your confirmation.

```
Hey, I want to ship a new app end-to-end using the kappmaker skill. Please walk
through it in phases and pause between each so I can confirm before you continue.

App name:    <MyApp>
App idea:    <A one or two sentence description of what the app does and who it's for>
Base ASO keyword:  <ai fitness coach>          # the main search term I want to rank for
Locale strategy:   <keyword-expansion>         # or "market-localization" with top 10 markets

Run these in order, skipping any step that obviously doesn't apply:

  --- PRE-DEVELOPMENT (kappmaker scaffolds, researches the niche, generates brand) ---

  1. Scaffold the project with `kappmaker create <MyApp>` (use my configured template,
     fall back to default). Stop and show me what got created.
  2. Run keyword research for the base keyword via Astro MCP. Save the result to
     AiGuidelines/keywords.md. If Astro MCP isn't connected, do a manual brainstorm
     and tell me to validate the scores later. After writing the file, briefly
     summarize the top sub-niche clusters you found — they may change what I
     decide to build, so I want to see them before coding starts.
  3. Generate the app logo from the app idea (now refined by the keyword findings
     above). Auto-remove the background and save it where the template expects
     (Assets/app_logo.png).
  4. Mint the iOS AppIcon.appiconset from the logo with `kappmaker generate-ios-icons`
     (sharp-only, no AI — generates all 11 PNG sizes Apple needs + Contents.json
     into MobileApp/iosApp/*/Assets.xcassets/AppIcon.appiconset/). Re-run later if
     the logo changes.
  5. Mint the Android launcher icon set with `kappmaker generate-android-icons`
     (sharp-only, no AI — writes mipmap-mdpi…xxxhdpi webps for both legacy and
     adaptive variants, plus mipmap-anydpi-v26/ic_launcher.xml and an
     ic_launcher_background entry in values/colors.xml). Use the brand color as
     --background. Re-run later if the logo changes.

  --- STOP HERE — APP DEVELOPMENT ---

  After step 5, STOP and tell me: "Scaffold + keyword research + brand + iOS/Android
  icons are ready. The keywords surfaced these sub-niches: <list>. Use them to refine
  your PRD or AiGuidelines docs if needed, then start coding the app features.
  Ping me when the app is functionally complete and ready for store assets." Don't
  run any of the steps below until I explicitly say I'm ready to move on (e.g.
  "okay, the app is built, continue with screenshots and store setup").

  --- POST-DEVELOPMENT (run only once the app is functionally complete) ---

  6. Generate 8 marketing screenshots that show the real app — ask me for a brief
     description of the actual features that landed, pick a style that fits, 2K
     resolution. Save them to Assets/screenshots/.
  7. Generate a Google Play feature graphic (1024×500 banner) using the app name,
     brand color, and a short subtitle. Pass a couple of the screenshots from step 6
     as --reference so they appear inside device frames on the banner. Saves to
     MobileApp/distribution/android/playstore_metadata/en-US/images/featureGraphic.png.
  8. Localize my App Store + Play Store metadata using the locale strategy I chose,
     reusing the keywords from AiGuidelines/keywords.md (step 2):
       - keyword-expansion → fan the top ~10 keywords across the 9 US-indexed
         locales.
       - market-localization → write native per-market copy for the top 10 markets
         (de-DE, fr-FR, es-ES, es-MX, ja, ko, zh-Hans, pt-BR, ru, it).
  9. Translate the screenshots into the same locale set you used in step 8.
  10. Set up App Store Connect.
  11. Set up Google Play Console (assume the app already exists in Play Console —
      remind me to create it manually if you hit a 404).
  12. Set up Adapty subscriptions, paywalls, and placements.
  13. Configure Fastlane, generate the Android keystore (organization: <MyCompany>),
      and build the signed Android release AAB.
  14. Bump the app version to 1.0.0.
  15. Publish to both stores.

If anything fails partway, stop and tell me what went wrong before continuing.
Don't run anything destructive without asking. Don't skip the confirmation prompts.
```

If you'd rather hand-walk it, the phase-by-phase breakdown below is the same sequence in granular form — copy individual blocks as you go.

### Shorter prompt — ship a release of an existing app

For follow-on releases (the app and stores are already set up), the sequence collapses to a few lines:

```
Using kappmaker, ship the next release: bump the patch version, build the signed
Android AAB, and publish to both stores. If anything fails on either platform,
stop and tell me which one.
```

### Shorter prompt — refresh just the ASO copy

If you only want to re-localize text + screenshots without rebuilding:

```
Using kappmaker, refresh my ASO. Re-run keyword research for "<base keyword>",
then localize metadata with mode=keyword-expansion using the new top keywords,
then translate screenshots to the same 9 locales. Don't touch the build or the
store binaries — just push the new listings to Google Play with
`gpc listings push` when you're done. Walk me through it.
```

### Phase 1 — Project scaffolding

```
# 1. Bootstrap the project (clone template, set up Firebase, refactor package, generate logo, build, configure stores)
/kappmaker create MyApp

# OR pick the minimal subset if you only want scaffolding:
/kappmaker clone MyApp                                              # clone template only
cd MyApp-All/MobileApp
/kappmaker refactor package name to com.example.myapp and app name to MyApp
```

The full `create` command runs Phases 1–4 end-to-end with prompts at each step. The granular path is for when you want to inspect intermediate state or pause between stages.

### Phase 2 — ASO keyword research (pre-development)

Run this BEFORE you start coding. The keywords surface sub-niches users actually search for, and those findings should feed back into your PRD / app-idea documents in `AiGuidelines/` and the feature list you're about to build.

```
# 2. Discover high-value keywords (writes AiGuidelines/keywords.md with popularity + difficulty scores)
Using kappmaker, research keywords for "ai fitness coach"
```

Open `AiGuidelines/keywords.md` after the run completes. The "Recommended primary keywords (top 5)" and "Sub-niche clusters" sections are the most useful inputs to refine your value proposition before development starts. You might discover, for example, that "ai workout planner" has 3× the search volume of your original "fitness journal" idea — that's a feature-list signal.

### Phase 3 — Brand identity (logo + iOS/Android icons)

The logo is generated AFTER keyword research so it can reflect the niche the research surfaced. It's the only pre-development asset that gets baked into the app code itself (icon, splash, in-app branding). Both platforms' icon sets are then one-shot resize steps from that logo.

```
# 3. Generate the app logo (auto-removes background; saves to Assets/app_logo.png)
/kappmaker create a logo for my fitness tracking app with prompt "minimalist dumbbell icon, blue gradient"

# 4. Mint the full iOS AppIcon.appiconset from the logo (sharp-only, no AI, no API keys)
# Writes 11 PNG sizes + Contents.json into MobileApp/iosApp/*/Assets.xcassets/AppIcon.appiconset/
/kappmaker generate iOS app icons from my logo

# 5. Mint the full Android launcher icon set from the same logo (sharp-only, no AI)
# Writes 5 mipmap-* density buckets (legacy + adaptive foreground + round) + mipmap-anydpi-v26/ic_launcher.xml + ic_launcher_background in values/colors.xml
/kappmaker generate Android app icons from my logo with background "#0F0A0D"

# (Optional, pre or post-dev) Convert assets to WebP for smaller app size
/kappmaker convert all images in Assets/ to webp with quality 90
```

Re-run `generate-ios-icons` and `generate-android-icons` whenever the logo changes — both overwrite existing files silently.

### ⏸ App development happens here

Stop the kappmaker sequence after the iOS and Android icons and actually build the app. Use Claude Code (or your normal workflow) to implement the features, UI, business logic, and integrations. Use the keywords from `AiGuidelines/keywords.md` to inform your PRD or feature list. Resume the sequence below only when the app is functionally complete enough to screenshot and submit to stores — otherwise your marketing screenshots will show placeholder UI and your store listings will describe a product that doesn't exist yet.

### Phase 4 — Marketing assets (post-development)

Screenshots and the Play Store feature graphic. Both reflect what the finished app actually looks like.

```
# 6. Generate 8 marketing screenshots reflecting the actual app you built
/kappmaker generate screenshots for "a fitness tracking app with HIIT timers, macro logging, and AI workout plans" using style 3 at 2K resolution

# 7. Generate the Play Store feature graphic (1024×500 banner — app name + subtitle + brand color)
# Pass --logo to keep the icon pixel-faithful, --reference to put real screenshots inside device frames.
/kappmaker generate feature image with prompt "AI fitness coach with daily workouts" \
    --app-name "FitTrack" --subtitle "Your daily workout partner" --primary-color "#FF3B30" \
    --logo ./Assets/app_logo.png \
    --reference ./Assets/screenshots/playstore/1.png ./Assets/screenshots/playstore/2.png
```

For higher-fidelity screenshots, capture real screen recordings from a build first and pass them to `generate-screenshots` as `--input <dir>` — the AI uses them as reference and the result matches your actual UI instead of a generic mockup. The same screenshots then double as `--reference` inputs to the feature graphic.

### Phase 5 — ASO: localize text + screenshots

The text and image sides of ASO localization. Both feed off the keyword research you did in Phase 2 (the keyword list in `AiGuidelines/keywords.md`) and the screenshots from Phase 4.

```
# 8. Pick ONE of the two ASO strategies — see ASO Guidelines doc for the trade-off

# Option A — Keyword expansion: English copy across 9 US-indexed locales
# Use the keywords AiGuidelines/keywords.md suggested in its last section
Using kappmaker, localize metadata mode=keyword-expansion keywords="ai fitness coach, hiit timer, ai workout planner, gym tracker, push-up counter, plank timer, rep counter, home workout, calorie counter, macro tracker"

# Option B — Market localization: native per-locale copy
Using kappmaker, localize metadata mode=market-localization locales="top 10 markets"

# 9. Localize the screenshots into the same locales (use the same locale set as step 8)
# After Option A → fan out to the 9 US-indexed locales:
/kappmaker translate screenshots to ar-SA, fr-FR, ko, pt-BR, ru, vi, zh-Hans, zh-Hant, es-MX

# After Option B → match the same locales you used for metadata:
/kappmaker translate screenshots to de-DE, fr-FR, es-ES, es-MX, ja, ko, zh-Hans, pt-BR, ru, it
```

### Phase 6 — Store setup

```
# 10. App Store Connect (creates the app, sets metadata, categories, age rating, subscriptions, IAPs, privacy, review info)
/kappmaker set up App Store Connect

# 11. Google Play Console (push listings, subscriptions, IAPs, data safety; app must exist on Play Console first — Google blocks API-based app creation)
/kappmaker set up Google Play Console

# 12. Adapty (creates subscription products, paywalls, placements; product IDs auto-align with ASC + Play)
/kappmaker set up Adapty subscriptions and paywalls
```

### Phase 7 — Build & sign

```
# 13. (One-time per machine) Configure Fastlane (creates Gemfile + Fastfile + runs bundle install)
/kappmaker configure Fastlane

# 14. (One-time per app) Generate the Android signing keystore
/kappmaker generate Android signing keystore for organization "MyCompany"

# 15. Build the signed Android AAB
/kappmaker build Android release
```

### Phase 8 — Version & publish

```
# 16. Bump the version (auto-increments patch + versionCode; or pass an explicit version name)
/kappmaker bump the app version
# OR
/kappmaker bump version to 1.0.0

# 17. Upload to both stores via Fastlane (--upload-images includes the feature graphic from step 7)
/kappmaker publish to both stores
# OR one at a time:
/kappmaker publish to Android
/kappmaker publish to iOS
```

### Phase 9 — Iteration (subsequent releases)

For releases after the first, you typically run a much shorter subset:

```
# Bump version → build → publish
/kappmaker bump the app version
/kappmaker build Android release
/kappmaker publish to both stores

# If you change ASO copy: just re-push listings without rebuilding
/kappmaker push store listings to Google Play
# (ASC metadata pushes via Fastlane when `--upload-metadata` is passed to publish, or via asc CLI directly)
```

### Pick-and-choose menu

If you're not running the full sequence, here are the shortest useful subsets:

| Goal | Run only |
|---|---|
| **Just scaffold a new app skeleton** | Step 1 (`create` or `clone` + `refactor`) |
| **Just do keyword research** | Step 2 |
| **Just generate the brand logo** | Step 3 |
| **Just regenerate the iOS app iconset (logo changed)** | Step 4 |
| **Just regenerate the Android launcher iconset (logo changed)** | Step 5 |
| **Regenerate both platforms' icons after a logo change** | Steps 4–5 |
| **Just generate screenshots for a finished app** | Step 6 |
| **Just generate a Play Store feature graphic** | Step 7 |
| **Just localize an existing app's listing** | Steps 8–9 |
| **Just set up the stores for an app you already built** | Steps 10–12 |
| **Just ship a new release of an existing app** | Steps 16–17 |
| **Refresh just the ASO copy without a rebuild** | Step 2 (optional re-research) → Step 8 (Option A or B) → `push store listings to Google Play` |
| **Refresh just the screenshots without a rebuild** | Step 6 → Step 9 → `publish --upload-screenshots` |
| **Refresh just the feature graphic without a rebuild** | Step 7 → `publish --upload-images` (Android) |

### Why this order?

A few sequencing constraints worth knowing about:

- **Keyword research (step 2) before app development** — the keyword findings shape the PRD, feature list, and value prop. Researching after coding means you've potentially built around the wrong sub-niche.
- **Keyword research (step 2) before logo (step 3)** — the brand should reflect the niche the research surfaced. If keywords reveal "ai car designer" is a stronger pull than "car tuning app", the logo aesthetic might shift.
- **Logo (step 3) before iOS icons (step 4) and Android icons (step 5)** — both icon-generation commands are deterministic resizes of the logo. Run them once the logo is final; re-run anytime the logo changes (both iconsets are overwritten silently).
- **Scaffold (step 1), logo (step 3), platform icons (steps 4–5) before app development** — refactor renames package directories, the logo gets referenced from app code, and the iconsets are what Xcode and Gradle bundle into the IPA/AAB. Doing them first means dev work starts with stable paths and final brand assets.
- **App development before screenshots (step 6), feature graphic (step 7), and everything after** — screenshots and the feature graphic depict the real product, ASO copy describes real features, store listings sell a real product. Doing these too early just creates work you'll redo.
- **Screenshots (step 6) before feature graphic (step 7)** — the feature graphic uses real screenshots as `--reference` inputs so fal.ai can place them inside device frames on the banner. Generating screenshots first means the banner shows actual UI, not generic mockups.
- **Metadata localization (step 8) before screenshot translation (step 9)** — not strictly required, but lets you pick the same locale set for both so the listings stay aligned.
- **App Store Connect / Play Console / Adapty (steps 10–12)** can run in any order, but Adapty needs the product IDs from the other two to link automatically. Run Adapty last.
- **Keystore (step 14) before build (step 15)** — the build pulls the keystore for signing. KAppMaker auto-generates one if missing, but you can also do it explicitly to control the organization name.
- **Build (step 15) before publish (step 17)** — `publish` uploads what's in the build output. Without a fresh build, you'll re-upload the previous AAB / IPA.

> As more `kappmaker` capabilities ship, this sequence will grow. The pattern stays the same: **scaffold → keyword research → logo → iOS icons → Android icons → [build the app] → screenshots → feature graphic → ASO text + image → stores → build → publish**. New skills slot into whichever phase they belong to — pre-development workflows (research, planning, branding, icons) join Phases 1–3, post-development workflows (assets, ASO, stores, publish) join Phase 4+.
