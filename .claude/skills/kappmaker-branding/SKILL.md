---
name: kappmaker-branding
description: Generate an app's visual identity with the KAppMaker CLI — AI logos, generic AI images, iOS and Android app icon sets, and WebP conversion. Use when the user asks for a logo, an app icon, an AI-generated image, icon assets, or to convert or optimise images.
---

# KAppMaker — Branding

## Before running any command

1. **Prerequisites** — `kappmaker --version` (install: `npm i -g kappmaker`). If a credential is
   missing the CLI says so; re-run `kappmaker config init` to add it.
2. **Read the project's own docs first** — `AiGuidelines/` holds the PRD, user flow and UI spec for
   this app. Never invent product decisions the docs already answer.
3. **In-project work has its own playbook** — check `<project>/.claude/skills/README.md` before
   hand-rolling anything.


### create-logo — AI Logo Generation

**Syntax**: `kappmaker create-logo [--prompt <text>] [--output <path>]`

**Prerequisites**: `falApiKey` (prompted on first use if not set).

**What it does**:
1. Reads app idea from `--prompt`, or asks the user interactively if omitted
2. Generates a 4x4 grid of 16 logo variations via fal.ai
3. Opens preview image
4. User selects a logo (1-16) with optional zoom/gap adjustments
5. Extracts selected logo to 512x512 PNG
6. Saves to `Assets/app_logo.png` (or custom `--output` path)

**Interactive**: Always interactive for the grid selection (number prompt). The initial app-idea prompt can be skipped by passing `--prompt "..."` up front.

---

### generate-image — Generic AI Image Generator

**Syntax**: `kappmaker generate-image --prompt <text> [options]`

**Options**:
- `--prompt <text>` (required) — Text description of the image
- `--output <path>` — Output file or directory (default: `Assets/generated.png`)
- `--num-images <n>` — Number of images, 1–8 (default: 1)
- `--aspect-ratio <ratio>` — `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, `21:9`, `9:21`, `auto` (default: `1:1`)
- `--resolution <res>` — `1K`, `2K`, `4K` (default: `2K`)
- `--output-format <fmt>` — `png`, `jpg`, `webp` (default: `png`)
- `--reference <paths...>` — Reference inputs; switches to fal.ai's `nano-banana-2/edit` endpoint. Each entry can be a file path, a directory (all `.png`/`.jpg`/`.jpeg`/`.webp` inside are auto-picked, sorted, non-recursive), or an HTTP(S) URL. Capped at 10 references total.

**Prerequisites**: `falApiKey` (prompted on first use if not set). `imgbbApiKey` is optional but recommended when using `--reference` with local files — if set, refs are uploaded to imgbb for reliable URLs; if not, they are sent inline as data URIs.

**What it does**: Thin wrapper around fal.ai's `nano-banana-2` (text-to-image) or `nano-banana-2/edit` (if any reference images are supplied). Submits the request, polls until complete, and downloads the result(s).

**Output path rules**:
- No `--output` → defaults to `Assets/generated.png` (or `generated_1.png`, `_2.png`… for multi)
- `--output` without a file extension → treated as a directory
- `--output` with a file extension → used verbatim for single image; for multi, `_1`, `_2`, … are appended before the extension

**When to use this vs `create-logo`**: Use `create-logo` when the user specifically wants an app logo (grid selection, background removal flow). Use `generate-image` for one-off marketing images, hero shots, backgrounds, illustrations, mockups, or any other general-purpose image task.

---

### generate-ios-icons — iOS AppIcon.appiconset Generator

**Syntax**: `kappmaker generate-ios-icons [--source <logo>] [--output <dir>] [--background <hex>]`

**Options**:
- `--source <path>` — Path to source logo PNG. **Default**: auto-detect in `Assets/` (`logo.png`, `logo_no_bg.png`, `app_logo.png`, `app_logo_no_bg.png`, `icon.png`). If none found, prompts interactively.
- `--output <dir>` — Output AppIcon.appiconset directory. **Default**: auto-detect `MobileApp/iosApp/*/Assets.xcassets/AppIcon.appiconset`.
- `--background <hex>` — Flatten color for transparent logos (App Store rejects icons with alpha). **Default**: `#FFFFFF`.

**Prerequisites**: None — sharp-only, no AI, no API keys.

**What it does**:
1. Loads the source logo (warns if smaller than 1024×1024 or non-square).
2. Center-crops to a square + flattens alpha onto the background color.
3. Resizes to all 11 unique pixel sizes Apple needs: 29, 40, 57, 58, 60, 80, 87, 114, 120, 180, 1024.
4. Writes `Contents.json` mapping each PNG to its idiom (`iphone` / `ios-marketing`) + scale (`1x` / `2x` / `3x`) — same schema appicon.co produces.
5. Overwrites existing files silently (you're regenerating from a new logo).

**Tips**: Run after `create-logo` to mint the full iconset in one shot. If your logo has transparency, the default `#FFFFFF` flatten matches Apple's App Store requirement; pass `--background "#000000"` (or any hex) for a dark fill.

---

### generate-android-icons — Android Launcher Icon Generator

**Syntax**: `kappmaker generate-android-icons [--source <logo>] [--output <res-dir>] [--background <hex>] [--foreground-padding <ratio>]`

**Options**:
- `--source <path>` — Path to source logo PNG. **Default**: auto-detect in `Assets/` (`logo.png`, `logo_no_bg.png`, `app_logo.png`, `app_logo_no_bg.png`, `icon.png`). If none found, prompts interactively.
- `--output <dir>` — Output Android `res/` directory. **Default**: auto-detect `MobileApp/composeApp/src/androidMain/res` (KAppMaker KMM convention) → `MobileApp/androidApp/src/main/res` → `app/src/main/res`.
- `--background <hex>` — Adaptive icon background color (referenced by the generated XML). **Default**: `#FFFFFF`.
- `--foreground-padding <ratio>` — Padding each side of the adaptive foreground (0 = no padding, 0.25 = Android Asset Studio default). **Default**: `0.25`.

**Prerequisites**: None — sharp-only, no AI, no API keys.

**What it does**:
1. Loads the source logo (warns if smaller than 432×432, the xxxhdpi foreground size; warns if non-square — center-crops).
2. For each of 5 density buckets (`mdpi`, `hdpi`, `xhdpi`, `xxhdpi`, `xxxhdpi`):
   - Writes `ic_launcher.webp` and `ic_launcher_round.webp` at the legacy launcher size (48 / 72 / 96 / 144 / 192 px).
   - Writes `ic_launcher_foreground.webp` at the adaptive size (108 / 162 / 216 / 324 / 432 px), with the logo centered in the inner safe zone and transparent surround.
3. Writes `mipmap-anydpi-v26/ic_launcher.xml` and `ic_launcher_round.xml` — adaptive-icon definitions referencing `@color/ic_launcher_background` and `@mipmap/ic_launcher_foreground`.
4. Upserts the `ic_launcher_background` color in `values/colors.xml` (creates the file if missing, updates the value if present, adds the entry if other colors exist).
5. Overwrites existing files silently.

**Tips**: Run after `create-logo` to mint the full Android iconset in one shot. The default `--foreground-padding 0.25` matches Android Asset Studio's behavior — drop it to `0.1` for icons that fill more of the adaptive frame, or up to `0.4` for very small logo content. Pass `--background "#0F0A0D"` (or any brand hex) to set the adaptive icon backdrop.

---

### convert-webp — Image to WebP Conversion

**Syntax**: `kappmaker convert-webp <source> [options]`

**Options**:
- `--quality <n>` — WebP quality, 0–100 (default: 75)
- `--recursive` — Search directories recursively (default: false)
- `--delete-originals` — Delete original files after conversion (default: false)
- `--output <dir>` — Output directory (default: same directory as source)

**Prerequisites**: None (uses local sharp library, no API key needed).

**What it does**: Converts PNG, JPG, JPEG, BMP, TIFF, and GIF images to WebP format — similar to Android Studio's built-in converter. Shows before/after file sizes and percentage saved for each file. Works on single files or entire directories (with `--recursive`).

---
