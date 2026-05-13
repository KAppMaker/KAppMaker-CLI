---
sidebar_position: 7
title: Screenshot Generation
---

# Screenshot Generation

Generate marketing screenshots from a text description using OpenAI (prompt generation) and fal.ai (image generation).

> Looking for screenshot **translation** to other locales? That moved to the ASO section — see [Screenshot Translation](../aso/translate-screenshots.md).

## generate-screenshots

```bash
kappmaker generate-screenshots --prompt "A fitness tracking app with workout plans"
kappmaker generate-screenshots --prompt "A meditation app" --input ./my-screenshots
kappmaker generate-screenshots --prompt "A recipe app" --style 3 --resolution 4K
```

### Flow

1. OpenAI (GPT-4.1) generates a detailed screenshot specification from your description.
2. fal.ai generates a grid of 8 screenshots (`nano-banana-2`, or `nano-banana-2/edit` with reference images).
3. The grid is split into individual screenshots.

### Output

`Assets/screenshots/appstore/` + `Assets/screenshots/playstore/` (+ Fastlane dirs if `MobileApp/distribution` exists).

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--prompt <text>` | App description (required) | — |
| `--input <dir>` | Reference screenshot directory | Auto-detect `Assets/screenshots` |
| `--style <id>` | Style preset (1-8) | `1` |
| `--output <dir>` | Output base directory | `Assets/screenshots` |
| `--resolution <res>` | AI resolution (`1K`, `2K`, `4K`) | `2K` |

### Screenshot Styles

| Style | Description |
|-------|-------------|
| `1` | Rich multi-device marketing (bold text, shadows & reflections) |
| `2` | Minimal Apple-style (single centered device, clean whitespace) |
| `3` | SaaS conversion-focused (feature bullet callouts) |
| `4` | Bold geometric color blocks (vibrant split backgrounds) |
| `5` | Full-bleed UI, no device frames (edge-to-edge with blur overlay) |
| `6` | Cinematic depth (layered devices, depth-of-field) |
| `7` | Editorial lifestyle (soft neutral backgrounds, serif type) |
| `8` | Floating product reveal (Apple keynote aesthetic) |

### Requirements

Requires `falApiKey`, `openaiApiKey`, and `imgbbApiKey` (if using reference images).

## Next: translate and localize

Once you have generated screenshots, run [Screenshot Translation](../aso/translate-screenshots.md) to fan them out to 48+ locales, and [Metadata Localization](../aso/metadata-localization.md) to write the matching text metadata.
