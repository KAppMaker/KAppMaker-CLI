---
sidebar_position: 8
title: Feature Image Generation
---

# Feature Image Generation

Generate a Google Play feature graphic (1024×500 banner) from a JSON spec (or a text description via OpenAI) using fal.ai for image generation. Optionally include the app logo and screenshots that fal.ai places inside device frames.

## generate-feature-image

```bash
kappmaker generate-feature-image \
    --prompt "A cute AI mascot generator for kids" \
    --app-name "Masclet" \
    --subtitle "Generate mascots, emotions, and expressions" \
    --primary-color "#E63946"
```

Or from a pre-authored spec (no OpenAI key needed):

```bash
kappmaker spec-template feature-graphic --output Assets/playstore/feature-graphic-spec.json
# fill the skeleton, then:
kappmaker generate-feature-image --spec Assets/playstore/feature-graphic-spec.json \
    --logo ./Assets/logo.png --reference ./screenshots/home.png
```

With logo + screenshots:

```bash
kappmaker generate-feature-image \
    --prompt "AI fitness coach with daily workouts" \
    --app-name "FitTrack" \
    --subtitle "Your daily workout partner" \
    --primary-color "#FF3B30" \
    --logo ./Assets/logo.png \
    --reference ./screenshots/home.png ./screenshots/profile.png
```

### Flow

1. A detailed banner spec (JSON) is obtained — from your `--spec` file, or refined by OpenAI (GPT-4.1) from the inputs (app name, subtitle, primary color, concept, reference image positions). `--print-prompt` prints the spec-authoring instructions and exits, so you (or an AI agent) can write the spec without any API call. `--logo`/`--reference` still apply with `--spec` — they control the uploaded images.
2. fal.ai generates one wide image (`nano-banana-2`, or `nano-banana-2/edit` with reference images) at 16:9.
3. `sharp` resizes/crops to EXACTLY 1024×500 px (Google Play feature graphic spec) via center cover.

### Output

Default path follows the Fastlane Supply convention so the existing publish flow picks it up automatically:

```
MobileApp/distribution/android/playstore_metadata/<locale>/images/featureGraphic.png
```

Falls back to `Assets/playstore/featureGraphic.png` outside a KAppMaker project. Override with `--output <path>`.

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--spec <path>` | Pre-authored banner spec JSON — skips OpenAI entirely | — |
| `--print-prompt` | Print the spec-authoring instructions and exit (no API calls) | — |
| `--prompt <text>` | App concept / description (required unless `--spec` is given) | — |
| `--app-name <name>` | App name rendered on the banner (required unless `--spec` is given) | — |
| `--primary-color <hex>` | Brand color in hex, e.g. `#FF3B30` (required unless `--spec` is given) | — |
| `--subtitle <text>` | Tagline rendered below the app name | — |
| `--logo <path>` | App logo PNG; rendered pixel-faithfully on the brand panel | — |
| `--reference <paths...>` | Screenshot paths to place inside device frames (max 10) | — |
| `--output <path>` | Custom output file path | Fastlane Supply path |
| `--resolution <res>` | AI resolution (`1K`, `2K`, `4K`) | `2K` |
| `--locale <code>` | Play Store locale for the default output path | `en-US` |

### Requirements

Requires `falApiKey` (prompted and saved on first use). `openaiApiKey` is only needed for the `--prompt`-without-`--spec` flow. `imgbbApiKey` is recommended when passing `--logo` or `--reference` — it speeds up uploads. Without it, the CLI falls back to inline base64 data URIs.

### Tips

- The logo (image #1) is rendered exactly as-is — the model is instructed not to redraw or recolor it. Pass a clean transparent-background PNG for best results.
- Reference screenshots are placed inside modern phone device frames at a slight angle. Order matters: the first reference becomes the most prominent device on the banner.
- The primary color visibly dominates the brand panel background or accents.
- Only the app name and subtitle appear as text — no AI-generated lorem copy.
