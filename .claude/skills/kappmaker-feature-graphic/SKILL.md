---
name: kappmaker-feature-graphic
description: Generate the Google Play feature graphic for a KAppMaker app. Use when the user asks for a feature graphic, Play Store banner or store header image.
---

# KAppMaker — Feature Graphic

## Before running any command

1. **Prerequisites** — `kappmaker --version` (install: `npm i -g kappmaker`). If a credential is
   missing the CLI says so; re-run `kappmaker config init`.
2. **Read `AiGuidelines/` first** — the PRD, user flow and UI spec already answer most product
   questions. Do not invent decisions they cover.

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
