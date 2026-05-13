---
sidebar_position: 4
title: Screenshot Translation
---

# Screenshot Translation

Translates app marketing screenshots into 48+ locales in parallel using fal.ai and saves the results to Fastlane-compatible distribution directories for both stores.

```bash
kappmaker translate-screenshots                                        # Uses default source dir
kappmaker translate-screenshots ./screenshots/en-US                    # Custom source dir
kappmaker translate-screenshots ./screenshots/en-US --locales de-DE ja-JP  # Specific locales
```

This is the image counterpart to [Metadata Localization](metadata-localization.md). Pair the two for fully-localized App Store and Play Store listings.

## Flow

1. Combines source screenshots into a 2×4 grid (configurable rows / cols).
2. Submits the grid to fal.ai for every target locale **in parallel** — the request runs concurrently across locales, not sequentially.
3. Downloads the translated grids and splits each one back into individual screenshots.
4. Writes the results to the Fastlane iOS and Android directory structure under `MobileApp/distribution/`.

## Default source path

If you don't pass a source directory, the command defaults to:

```
MobileApp/distribution/ios/appstore_metadata/screenshots/en-US
```

If that path doesn't exist, the command falls back to scanning the parent of whatever source directory you supplied. For custom templates (i.e. anything other than the KAppMaker boilerplate), pass an explicit source path.

## Output auto-detection

If the source directory is somewhere inside a `distribution` tree, the distribution root is auto-detected (the command walks upward looking for the marker `/ios/appstore_metadata/screenshots/` or `/android/playstore_metadata/`). Otherwise it defaults to `./MobileApp/distribution`. Override with `--output`.

## Options

| Flag | Description | Default |
|---|---|---|
| `--output <path>` | Distribution directory root | Auto-detected |
| `--locales <codes...>` | Target locale codes (space-separated) or `all` | All 48 locales |
| `--rows <n>` | Grid rows | `2` |
| `--cols <n>` | Grid columns | `4` |
| `--resolution <res>` | AI resolution (`1K`, `2K`, `4K`) | `2K` |
| `--poll-interval <seconds>` | Seconds between status checks | `10` |

## Requirements

- `falApiKey` — see [External Services](../guides/external-services.md). Prompted on first use if not set.
- `imgbbApiKey` — used to upload the source grid for fal.ai to fetch. Prompted on first use if not set.

## Supported locales (48 total)

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

## See also

- [Metadata Localization](metadata-localization.md) — the text-side ASO companion. Generate localized `name` / `keywords` / `description` files for the same locales you translate screenshots into.
- [Screenshot Generation](../ai-image-tools/screenshots.md) — generate the source screenshots from a text prompt before translating them.
- [ASO Guidelines](guidelines.md) — character limits and ranking rules that apply to your text metadata.
