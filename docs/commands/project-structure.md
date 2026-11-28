# Development setup, credits and project structure

Moved here from the README. Index: [docs/commands](README.md).

## Installation

```bash
npm install -g kappmaker
```

Then use it anywhere:

```bash
kappmaker create <AppName>
```

<details>
<summary>Development setup</summary>

```bash
npm install
npx tsx src/index.ts create <AppName>
```

</details>

## Credits & Attribution

The per-region PPP pricing tier table (`src/data/ppp-tiers.ts`, `src/data/ppp-tiers.upstream.json`) is derived from **[iosdevmax/ppp-pricing](https://github.com/iosdevmax/ppp-pricing)** by [@iosdevmax](https://github.com/iosdevmax) (MIT License).

The methodology is intentionally Steam/Spotify/RevenueCat-inspired rather than raw World Bank PPP data: raw PPP under-prices markets prone to VPN arbitrage and misses high-cost-of-living "rich tourist" markets. KAppMaker uses the upstream tiers as-is and extends coverage to all Play-supported regions and ASC territories via geographic/economic-proximity neighbour lookups (see `FALLBACK_NEIGHBOUR` in `src/data/ppp-tiers.ts`).

If you're shipping global pricing for an app, **please ⭐ the upstream repo**: it's the source of the curated tier values that make this work.

Full third-party attribution is in [NOTICE.md](../../NOTICE.md).

---

## Project Structure

```
src/
  index.ts                  # Entry point
  cli.ts                    # Command registration (Commander.js)
  commands/
    create.ts               # Full app setup (13-step orchestrator: Firebase + logo + refactor + build + ASC + GPC + Adapty)
    clone.ts                # `kappmaker clone <AppName>`: step 1 of create as a standalone (also called by create.ts)
    git.ts                  # `kappmaker git setup-upstream`: step 10 of create as a standalone (also called by create.ts)
    firebase.ts             # `kappmaker firebase` subcommands: login, project, apps, auth-anonymous, configs (steps 2-6 as standalones)
    create-logo.ts          # AI logo generation (accepts --prompt or interactive)
    generate-image.ts       # Generic AI image generator (fal.ai nano-banana-2)
    create-appstore-app.ts  # App Store Connect setup (13-step orchestrator)
    appstore-monetization-push.ts  # Push subscriptions + IAPs from appstore config to ASC (step 10 of create-appstore-app as standalone)
    create-play-app.ts      # Google Play Console setup (11-step orchestrator, aliased by `gpc setup`)
    gpc.ts                  # kappmaker gpc subcommands (setup, listings, subscriptions, iap, data-safety, app-check)
    adapty-setup.ts         # Adapty setup (8-step orchestrator)
    split.ts                # Grid image splitter
    remove-bg.ts            # Background removal
    enhance.ts              # Image quality enhancement
    convert-webp.ts         # PNG/JPG/BMP/TIFF/GIF to WebP conversion
    translate-screenshots.ts # Screenshot translation
    generate-screenshots.ts # AI screenshot generation
    fastlane-configure.ts   # Set up Fastlane (Gemfile + Fastfile + bundle install)
    publish.ts              # Build and upload to Play Store / App Store
    generate-keystore.ts    # Generate Android signing keystore
    android-release-build.ts # Build signed Android release AAB
    refactor.ts             # Package/app name refactoring
    update-version.ts       # Bump Android + iOS version codes and version name
    config.ts               # Config management
  services/
    firebase.service.ts     # Firebase CLI wrapper + anonymous auth
    fal.service.ts          # fal.ai API (generation, translation, screenshots)
    openai.service.ts       # OpenAI API (prompt generation)
    asc.service.ts          # App Store Connect CLI wrapper
    asc-monetization.service.ts  # ASC pricing, subscriptions, IAP
    gpc.service.ts          # Google Play Publisher API wrapper (JWT auth, edits, listings, data safety): no external CLI
    gpc-monetization.service.ts  # Play new monetization API (subscriptions + base plans + onetimeproducts, NOT legacy inappproducts)
    gpc-data-safety.service.ts   # JSON → CSV converter for Play Data Safety form (uses bundled canonical template)
    adapty.service.ts       # Adapty CLI wrapper
    git.service.ts          # Git operations
    fastlane-setup.service.ts # Fastlane scaffolding (Gemfile + Fastfile)
    publish.service.ts      # Android/iOS publishing via Fastlane
    keystore.service.ts     # Android keystore generation
    gradle.service.ts       # Gradle build helpers (local.properties, clean & build)
    ios.service.ts          # CocoaPods setup
    fastlane.service.ts     # Android release build (keystore + gradle) + AAB finder
    logo.service.ts         # Logo prompt builder + image extraction
    screenshot.service.ts   # Screenshot grid operations + Fastlane output
    screenshot-styles.ts    # Screenshot style prompts (8 styles)
    refactor.service.ts     # Package/app name refactoring logic
    version.service.ts      # Android + iOS version reading/writing
  utils/
    logger.ts               # Chalk-based logging
    exec.ts                 # Command execution (execa + ora)
    validator.ts            # Dependency and input validation
    config.ts               # User config management
    prompt.ts               # Interactive prompts
  templates/
    appstore-config.json    # Default App Store Connect config
    googleplay-config.json  # Default Google Play Console config
    data-safety-template.json  # Canonical Play Data Safety form schema (783 rows, 217 Q IDs)
    adapty-config.json      # Default Adapty config
  types/
    index.ts                # Shared interfaces
    appstore.ts             # App Store Connect types
    googleplay.ts           # Google Play Console types
    adapty.ts               # Adapty types
```
