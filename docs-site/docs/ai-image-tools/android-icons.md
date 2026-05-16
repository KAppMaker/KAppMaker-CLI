---
sidebar_position: 10
title: Android Icon Generation
---

# Android Icon Generation

Generate the full Android launcher icon set — five mipmap density buckets, both legacy and adaptive variants, the adaptive icon XML files, and the `ic_launcher_background` color entry in `values/colors.xml` — from a single source logo. **Sharp-only — no AI, no API keys.** Same output as Android Studio's Asset Studio, but local and instant.

## generate-android-icons

```bash
# Auto-detect logo in Assets/ and write to MobileApp/composeApp/src/androidMain/res
kappmaker generate-android-icons

# Explicit source + brand-colored adaptive background
kappmaker generate-android-icons --source ./Assets/logo.png --background "#0F0A0D"

# Tighter foreground padding (logo fills more of the adaptive canvas)
kappmaker generate-android-icons --foreground-padding 0.1
```

### Flow

1. Resolves source — `--source <path>` if given; otherwise auto-detects in `Assets/` looking for `logo.png`, `logo_no_bg.png`, `app_logo.png`, `app_logo_no_bg.png`, `icon.png` (in that order). Prompts interactively if none found.
2. Center-crops to a square (warns if source is non-square or smaller than 432×432).
3. For each of 5 density buckets — `mdpi`, `hdpi`, `xhdpi`, `xxhdpi`, `xxxhdpi`:
   - Writes `ic_launcher.webp` and `ic_launcher_round.webp` at legacy size (`48` / `72` / `96` / `144` / `192` px).
   - Writes `ic_launcher_foreground.webp` at adaptive size (`108` / `162` / `216` / `324` / `432` px) with the logo centered in the inner safe zone and transparent surround.
4. Writes `mipmap-anydpi-v26/ic_launcher.xml` and `ic_launcher_round.xml` — adaptive-icon definitions referencing `@color/ic_launcher_background` and `@mipmap/ic_launcher_foreground`.
5. Upserts `<color name="ic_launcher_background">` in `values/colors.xml` — creates the file if missing, replaces the value if present, inserts the entry alongside any other colors otherwise.
6. Overwrites existing files silently.

### Output

Default path follows the KAppMaker KMM convention:

```
MobileApp/composeApp/src/androidMain/res/
├── mipmap-mdpi/
│   ├── ic_launcher.webp           (48×48)
│   ├── ic_launcher_round.webp     (48×48)
│   └── ic_launcher_foreground.webp (108×108)
├── mipmap-hdpi/
│   ├── ic_launcher.webp           (72×72)
│   ├── ic_launcher_round.webp     (72×72)
│   └── ic_launcher_foreground.webp (162×162)
├── mipmap-xhdpi/
│   ├── ic_launcher.webp           (96×96)
│   ├── ic_launcher_round.webp     (96×96)
│   └── ic_launcher_foreground.webp (216×216)
├── mipmap-xxhdpi/
│   ├── ic_launcher.webp           (144×144)
│   ├── ic_launcher_round.webp     (144×144)
│   └── ic_launcher_foreground.webp (324×324)
├── mipmap-xxxhdpi/
│   ├── ic_launcher.webp           (192×192)
│   ├── ic_launcher_round.webp     (192×192)
│   └── ic_launcher_foreground.webp (432×432)
├── mipmap-anydpi-v26/
│   ├── ic_launcher.xml
│   └── ic_launcher_round.xml
└── values/
    └── colors.xml                  (← ic_launcher_background entry)
```

Falls back to `MobileApp/androidApp/src/main/res/` → `app/src/main/res/` → `Assets/android/res/`. Override with `--output <dir>`.

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--source <path>` | Source logo PNG (≥ 432×432 recommended) | Auto-detect in `Assets/` |
| `--output <dir>` | Output Android `res/` directory | Auto-detect under `MobileApp/` |
| `--background <hex>` | Adaptive icon backdrop color (written to `colors.xml`) | `#FFFFFF` |
| `--foreground-padding <ratio>` | Padding each side of the adaptive foreground (`0`–`0.5`) | `0.25` |

### Requirements

None — no API keys, no network. Just a source PNG.

### Tips

- Chain with [`create-logo`](./create-logo.md) — generate the logo, then run `generate-android-icons` (and `generate-ios-icons`) to mint both platforms' icon sets right after.
- Source should be at least **432×432** for crisp adaptive foregrounds on xxxhdpi devices. Smaller sources are upscaled (with a warning).
- The default `--foreground-padding 0.25` matches Android Asset Studio's default — content occupies the inner 50% of the foreground frame, leaving 25% margin on each side (Android's adaptive icon safe zone). Drop to `0.1` if your logo is small and should fill more of the adaptive frame; raise to `0.4` if it's busy and you want more breathing room.
- The adaptive `--background` is referenced by the generated XML — Android renders this color behind the foreground on Android 8+ devices. On legacy launchers (pre-API 26), the legacy `ic_launcher.webp` is used directly.
- `AndroidManifest.xml` should already reference `@mipmap/ic_launcher` and `@mipmap/ic_launcher_round`. This command doesn't touch the manifest.
