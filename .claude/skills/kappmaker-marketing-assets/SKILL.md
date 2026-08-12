---
name: kappmaker-marketing-assets
description: Produce store marketing assets — AI App Store and Play Store screenshots, the Play feature graphic, and screenshot translation into other locales. Use when the user asks for store screenshots, marketing screenshots, a feature graphic, or translated screenshots.
---

# KAppMaker — Marketing Assets

## Before running any command

1. **Prerequisites** — `kappmaker --version` (install: `npm i -g kappmaker`). If a credential is
   missing the CLI says so; re-run `kappmaker config init` to add it.
2. **Read the project's own docs first** — `AiGuidelines/` holds the PRD, user flow and UI spec for
   this app. Never invent product decisions the docs already answer.
3. **In-project work has its own playbook** — check `<project>/.claude/skills/README.md` before
   hand-rolling anything.


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

**Where the reference screenshots come from**: `--input` / `--reference` want plain captures of the app's real screens — no headlines, no device frames. In a KMPStarterKit-based project those are produced by the `capture-app-screens` skill (`MobileApp/./scripts/generate_store_screenshots.sh`), which renders `@Preview @StoreScreenshot` composables at storefront pixel sizes into `distribution/store_screenshots/<locale>/<device>/`. Point `--input` there rather than asking the user to screenshot a simulator by hand. That skill only produces the bare screen art; the design pass — marketing copy, brand panel, device frames — is this command's job, so the two are complementary, not alternatives.

---

### generate-feature-image — AI Feature Graphic Generation

**Syntax**: `kappmaker generate-feature-image --prompt "<concept>" --app-name "<Name>" --primary-color "#RRGGBB" [options]`

**Options**:
- `--prompt <text>` (required) — App concept / description
- `--app-name <name>` (required) — App name rendered on the banner (e.g. "FitTrack")
- `--primary-color <hex>` (required) — Brand color in hex (e.g. `#FF3B30`)
- `--subtitle <text>` — Tagline shown under the app name
- `--logo <path>` — App logo PNG to render on the brand panel (rendered pixel-faithfully)
- `--reference <paths...>` — App screenshot paths to place inside device frames (max 10)
- `--output <path>` — Custom output file path
- `--resolution <res>` — AI resolution: 1K, 2K, 4K (default: 2K)
- `--locale <code>` — Play Store locale for the default output path (default: en-US)

**Prerequisites**: `openaiApiKey`, `falApiKey` (prompted on first use). `imgbbApiKey` recommended when passing `--logo` or `--reference` (falls back to inline data URIs otherwise).

**What it does**:
1. OpenAI (GPT-4.1) refines the inputs into a detailed banner specification.
2. fal.ai (`nano-banana-2`, or `/edit` when references are provided) generates one wide image.
3. `sharp` resizes/crops the result to EXACTLY 1024×500 px (Google Play feature graphic spec) via center cover.
4. Saves to `MobileApp/distribution/android/playstore_metadata/<locale>/images/featureGraphic.png` so the existing Fastlane publish flow picks it up automatically — falls back to `Assets/playstore/featureGraphic.png` outside a KAppMaker project.

**Tips**: Pass `--logo` to keep the exact app icon (the model will reproduce, not redraw, image #1). Pass `--reference` screenshots in the order they should appear inside the device mockups.

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
