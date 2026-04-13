---
sidebar_position: 7
title: Screenshot Generation & Translation
---

# Screenshot Generation & Translation

Generate marketing screenshots from a text description and translate existing screenshots to 48+ locales — all powered by AI.

## translate-screenshots

Translates app screenshots into multiple locales using fal.ai and saves to Fastlane distribution directories.

```bash
kappmaker translate-screenshots                                        # Uses default source dir
kappmaker translate-screenshots ./screenshots/en-US                    # Custom source dir
kappmaker translate-screenshots ./screenshots/en-US --locales de-DE ja-JP  # Specific locales
```

### Flow

1. Combines source images into a 2x4 grid
2. Submits grid to fal.ai for each locale (all in parallel)
3. Downloads translated grids, splits back into individual screenshots
4. Saves to Fastlane iOS/Android directory structure

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--output <path>` | Distribution directory root | Auto-detected |
| `--locales <codes...>` | Target locale codes (space-separated) or `all` | All 48 locales |
| `--rows <n>` | Grid rows | `2` |
| `--cols <n>` | Grid columns | `4` |
| `--resolution <res>` | AI resolution (`1K`, `2K`, `4K`) | `2K` |
| `--poll-interval <seconds>` | Seconds between status checks | `10` |

### Supported Locales (48 total)

<details>
<summary>Click to expand locale list</summary>

| Play Store | App Store | | Play Store | App Store |
|------------|-----------|---|------------|-----------|
| `ar` | `ar-SA` | | `lt-LT` | — |
| `bg-BG` | — | | `lv-LV` | — |
| `bn-BD` | — | | `ms` | `ms` |
| `ca` | `ca` | | `nl-NL` | `nl-NL` |
| `cs-CZ` | `cs` | | `no-NO` | `no` |
| `da-DK` | `da` | | `pl-PL` | `pl` |
| `de-DE` | `de-DE` | | `pt-BR` | `pt-BR` |
| `el-GR` | `el` | | `pt-PT` | `pt-PT` |
| `en-AU` | `en-AU` | | `ro` | `ro` |
| `en-GB` | `en-GB` | | `ru-RU` | `ru` |
| `es-ES` | `es-ES` | | `sk` | `sk` |
| `es-419` | `es-MX` | | `sl-SI` | — |
| `et-EE` | — | | `sr` | — |
| `fi-FI` | `fi` | | `sv-SE` | `sv` |
| `fil` | — | | `sw` | — |
| `fr-FR` | `fr-FR` | | `ta-IN` | — |
| `fr-CA` | `fr-CA` | | `te-IN` | — |
| `he-IL` | `he` | | `th` | `th` |
| `hi-IN` | `hi` | | `tr-TR` | `tr` |
| `hr` | `hr` | | `uk` | `uk` |
| `hu-HU` | `hu` | | `vi` | `vi` |
| `id` | `id` | | `zh-CN` | `zh-Hans` |
| `it-IT` | `it` | | `zh-TW` | `zh-Hant` |
| `ja-JP` | `ja` | | | |
| `ko-KR` | `ko` | | | |

Locales marked with **—** are Android-only (no App Store equivalent).

</details>

---

## generate-screenshots

Generates marketing screenshots using OpenAI (prompt generation) + fal.ai (image generation).

```bash
kappmaker generate-screenshots --prompt "A fitness tracking app with workout plans"
kappmaker generate-screenshots --prompt "A meditation app" --input ./my-screenshots
kappmaker generate-screenshots --prompt "A recipe app" --style 3 --resolution 4K
```

### Flow

1. OpenAI (GPT-4.1) generates a detailed screenshot specification from your description
2. fal.ai generates a grid of 8 screenshots
3. Grid is split into individual screenshots

### Output

`Assets/screenshots/appstore/` + `Assets/screenshots/playstore/` (+ Fastlane dirs if `MobileApp/distribution` exists)

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
