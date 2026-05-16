---
sidebar_position: 9
title: iOS Icon Generation
---

# iOS Icon Generation

Generate the full `AppIcon.appiconset` directory (all PNG sizes Apple needs + `Contents.json`) from a single source logo. **Sharp-only — no AI, no API keys, no network calls.** Same output as [appicon.co](https://appicon.co), but local and instant.

## generate-ios-icons

```bash
# Auto-detect logo in Assets/ and write to MobileApp/iosApp/*/Assets.xcassets/AppIcon.appiconset
kappmaker generate-ios-icons

# Explicit source + output
kappmaker generate-ios-icons --source ./Assets/logo.png --output ./path/to/AppIcon.appiconset

# Dark background for transparent logos
kappmaker generate-ios-icons --background "#000000"
```

### Flow

1. Resolves source — `--source <path>` if given; otherwise auto-detects in `Assets/` looking for `logo.png`, `logo_no_bg.png`, `app_logo.png`, `app_logo_no_bg.png`, `icon.png` (in that order). Prompts interactively if none found.
2. Center-crops to a square (warns if source is non-square) and flattens alpha onto `--background` color.
3. Resizes via sharp Lanczos to all 11 pixel sizes: `29`, `40`, `57`, `58`, `60`, `80`, `87`, `114`, `120`, `180`, `1024`.
4. Writes `Contents.json` matching appicon.co's schema (12 entries — `120.png` is shared by 40pt@3x and 60pt@2x — covering the `iphone` idiom @1x/2x/3x plus the `ios-marketing` 1024).
5. Overwrites existing files silently.

### Output

Default path follows the KAppMaker convention:

```
MobileApp/iosApp/<AppName>/Assets.xcassets/AppIcon.appiconset/
├── 29.png
├── 40.png
├── 57.png
├── 58.png
├── 60.png
├── 80.png
├── 87.png
├── 114.png
├── 120.png
├── 180.png
├── 1024.png
└── Contents.json
```

Falls back to `Assets/AppIcon.appiconset/` outside a KAppMaker project. Override with `--output <dir>`.

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--source <path>` | Source logo PNG (≥ 1024×1024 recommended) | Auto-detect in `Assets/` |
| `--output <dir>` | Output `AppIcon.appiconset` directory | Auto-detect under `MobileApp/iosApp/` |
| `--background <hex>` | Flatten color used for transparent logos | `#FFFFFF` |

### Requirements

None — no API keys, no network. Just a source PNG.

### Tips

- Chain with [`create-logo`](./create-logo.md) — generate the logo first, then run `generate-ios-icons` to mint the full iconset.
- Source should be at least **1024×1024** for crisp icons at all sizes. Smaller sources are upscaled (with a warning) and look blurry on iPhone 6.7" displays.
- Apple's App Store requires no transparency on the 1024×1024 marketing icon — the default `#FFFFFF` flatten satisfies this regardless of source alpha. Use `--background "#000000"` (or any hex) for a dark fill if your brand calls for it.
