---
name: kappmaker-screenshots
description: Generate and translate App Store and Play Store screenshots for a KAppMaker app. Use when the user asks for store screenshots, marketing screenshots, or screenshots in other languages or locales.
---

# KAppMaker — Screenshots

## Before running any command

1. **Prerequisites** — `kappmaker --version` (install: `npm i -g kappmaker`). If a credential is
   missing the CLI says so; re-run `kappmaker config init`.
2. **Read `AiGuidelines/` first** — the PRD, user flow and UI spec already answer most product
   questions. Do not invent decisions they cover.

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
