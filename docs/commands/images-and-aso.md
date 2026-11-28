# Logos, images, screenshots, icons and ASO

Moved here from the README. Index: [docs/commands](README.md).

## `create-logo`

Generates an app logo using fal.ai's nano-banana-2 model.

```bash
kappmaker create-logo
kappmaker create-logo --prompt "A minimalist fitness tracker for runners"
kappmaker create-logo --output ./custom/path/logo.png
```

**Flow:**
1. Reads app idea from `--prompt` (or prompts interactively if omitted)
2. Generates a 4x4 grid of 16 logo variations (2K, 1:1)
3. Opens grid in Preview.app for review
4. Pick a logo (1-16) or R to regenerate: optional: `5 --zoom 1.1 --gap 3`
5. Extracts chosen logo at 512x512

**Output:** `Assets/app_logo.png` + `Assets/logo_variations.png`

Requires a fal.ai API key (prompted on first use if not set, or set manually: `kappmaker config set falApiKey <your-key>`)

| Flag | Description | Default |
|------|-------------|---------|
| `--prompt <text>` | App idea / concept (skips the interactive prompt) | - |
| `--output <path>` | Custom output path | `Assets/app_logo.png` |

---

## `generate-image`

Generic AI image generator: a thin wrapper around fal.ai's `nano-banana-2` (text-to-image) and `nano-banana-2/edit` (with reference images). Use this any time you need a one-off image without the logo-grid selection flow.

```bash
kappmaker generate-image --prompt "A minimalist mountain landscape at sunset"
kappmaker generate-image --prompt "Hero banner for a meditation app" --aspect-ratio 16:9 --resolution 4K
kappmaker generate-image --prompt "Product render" --num-images 4 --output Assets/hero
kappmaker generate-image --prompt "Put this logo on a black t-shirt" --reference Assets/app_logo.png
kappmaker generate-image --prompt "Blend these into a single composition" --reference Assets/moodboard
kappmaker generate-image --prompt "Match this product shot" --reference https://example.com/ref.jpg
```

**Reference images (edit mode):** Passing `--reference` switches the endpoint from `nano-banana-2` (text-to-image) to `nano-banana-2/edit` (reference-guided). Each entry can be a **file path**, a **directory** (all png/jpg/jpeg/webp inside are picked up, sorted, non-recursive), or an **HTTP(S) URL**. Max 10 references total. If `imgbbApiKey` is configured, local files are uploaded to imgbb for reliable URLs; otherwise they are sent inline as data URIs (fine for small images, can fail on very large ones).

**Output path behavior:**
- No `--output` → `Assets/generated.png` (single) or `Assets/generated_1.png`, `_2.png`… (multi)
- `--output <dir>` (no extension) → saves into that directory
- `--output <file.png>` → single image uses path verbatim; multi-image appends `_1`, `_2` before extension

Requires a fal.ai API key (prompted on first use if not set).

| Flag | Description | Default |
|------|-------------|---------|
| `--prompt <text>` | Text description of the image (required) | - |
| `--output <path>` | Output file or directory | `Assets/generated.png` |
| `--num-images <n>` | Number of images to generate (1 to 8) | `1` |
| `--aspect-ratio <ratio>` | `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, `21:9`, `9:21`, `auto` | `1:1` |
| `--resolution <res>` | `1K`, `2K`, `4K` | `2K` |
| `--output-format <fmt>` | `png`, `jpg`, `webp` | `png` |
| `--reference <paths...>` | Reference images: file paths, directories, or HTTP URLs (edit mode, max 10) | - |

---

## Image Tools

AI-powered image commands. A fal.ai API key is prompted on first use if not already configured.

### `image-split <source>`

Splits a grid image into individual tiles.

```bash
kappmaker image-split grid.png --rows 4 --cols 4 --zoom 1.1 --gap 3
kappmaker image-split grid.png --keep 1,5    # Keep only tiles 1 and 5
```

| Flag | Description | Default |
|------|-------------|---------|
| `--rows <n>` | Number of rows | `4` |
| `--cols <n>` | Number of columns | `4` |
| `--zoom <factor>` | Zoom factor to crop edges | `1.07` |
| `--gap <pixels>` | Gap pixels at each tile edge | `0` |
| `--width <pixels>` | Output tile width | `512` |
| `--height <pixels>` | Output tile height | `512` |
| `--output-dir <path>` | Directory to save tiles | `.` |
| `--keep <indices>` | Comma-separated tile indices to keep | All |

### `image-remove-bg <source>`

Removes background using fal.ai bria model. Outputs PNG with transparency.

```bash
kappmaker image-remove-bg logo.png
kappmaker image-remove-bg photo.jpg --output clean.png
```

| Flag | Description | Default |
|------|-------------|---------|
| `--output <path>` | Custom output path | `<filename>_no_bg.png` |

### `image-enhance <source>`

Upscales and improves image quality using fal.ai nano-banana-2 edit model.

```bash
kappmaker image-enhance logo.png
kappmaker image-enhance photo.jpg --output improved.png
```

| Flag | Description | Default |
|------|-------------|---------|
| `--output <path>` | Custom output path | `<filename>_enhanced.png` |

---

## `convert-webp <source>`

Converts images (PNG, JPG, JPEG, BMP, TIFF, GIF) to WebP format using sharp: similar to Android Studio's built-in PNG-to-WebP converter. No API key needed; runs entirely locally.

```bash
kappmaker convert-webp icon.png                                      # Single file
kappmaker convert-webp app/src/main/res/drawable --recursive         # Entire directory tree
kappmaker convert-webp assets/ --quality 90 --recursive              # Custom quality
kappmaker convert-webp assets/ --recursive --delete-originals        # Remove originals after conversion
kappmaker convert-webp assets/ --output converted/                   # Output to a different directory
```

Shows before/after file sizes and percentage saved for each file, with a total at the end.

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--quality <n>` | WebP quality (0 to 100) | `75` |
| `--recursive` | Search directories recursively | `false` |
| `--delete-originals` | Delete original files after conversion | `false` |
| `--output <dir>` | Output directory (default: same directory as source) | - |

---

## `translate-screenshots [source-dir]`

Translates app screenshots into multiple locales using fal.ai and saves to Fastlane distribution directories.

```bash
kappmaker translate-screenshots                                        # Uses default: MobileApp/distribution/.../en-US
kappmaker translate-screenshots ./screenshots/en-US                    # Custom source dir
kappmaker translate-screenshots ./screenshots/en-US --locales de-DE ja-JP  # Specific locales
```

**Flow:**
1. Combines source images into a 2x4 grid
2. Submits grid to fal.ai for each locale (all in parallel)
3. Downloads translated grids, splits back into individual screenshots
4. Saves to Fastlane iOS/Android directory structure

**Output auto-detection:** If source is inside a distribution structure, the root is detected automatically. Otherwise defaults to `./MobileApp/distribution`.

| Flag | Description | Default |
|------|-------------|---------|
| `--output <path>` | Distribution directory root | Auto-detected |
| `--locales <codes...>` | Target locale codes (space-separated) or `all` | All 48 locales |
| `--rows <n>` | Grid rows | `2` |
| `--cols <n>` | Grid columns | `4` |
| `--resolution <res>` | AI resolution (`1K`, `2K`, `4K`) | `2K` |
| `--poll-interval <seconds>` | Seconds between status checks | `10` |

<details>
<summary>Supported locales (48 total)</summary>

| Play Store | App Store | | Play Store | App Store |
|------------|-----------|---|------------|-----------|
| `ar` | `ar-SA` | | `lt-LT` | - |
| `bg-BG` | - | | `lv-LV` | - |
| `bn-BD` | - | | `ms` | `ms` |
| `ca` | `ca` | | `nl-NL` | `nl-NL` |
| `cs-CZ` | `cs` | | `no-NO` | `no` |
| `da-DK` | `da` | | `pl-PL` | `pl` |
| `de-DE` | `de-DE` | | `pt-BR` | `pt-BR` |
| `el-GR` | `el` | | `pt-PT` | `pt-PT` |
| `en-AU` | `en-AU` | | `ro` | `ro` |
| `en-GB` | `en-GB` | | `ru-RU` | `ru` |
| `es-ES` | `es-ES` | | `sk` | `sk` |
| `es-419` | `es-MX` | | `sl-SI` | - |
| `et-EE` | - | | `sr` | - |
| `fi-FI` | `fi` | | `sv-SE` | `sv` |
| `fil` | - | | `sw` | - |
| `fr-FR` | `fr-FR` | | `ta-IN` | - |
| `fr-CA` | `fr-CA` | | `te-IN` | - |
| `he-IL` | `he` | | `th` | `th` |
| `hi-IN` | `hi` | | `tr-TR` | `tr` |
| `hr` | `hr` | | `uk` | `uk` |
| `hu-HU` | `hu` | | `vi` | `vi` |
| `id` | `id` | | `zh-CN` | `zh-Hans` |
| `it-IT` | `it` | | `zh-TW` | `zh-Hant` |
| `ja-JP` | `ja` | | | |
| `ko-KR` | `ko` | | | |

Locales marked with **: ** are Android-only (no App Store equivalent).

</details>

---

## `generate-screenshots`

Generates marketing screenshots using OpenAI (prompt generation) + fal.ai (image generation).

```bash
kappmaker generate-screenshots --prompt "A fitness tracking app with workout plans"
kappmaker generate-screenshots --prompt "A meditation app" --input ./my-screenshots
kappmaker generate-screenshots --prompt "A recipe app" --style 3 --resolution 4K
```

**Flow:**
1. OpenAI (GPT-4.1) generates a detailed screenshot specification from your description
2. fal.ai generates a grid of 8 screenshots (`nano-banana-2`, or `nano-banana-2/edit` with reference images)
3. Grid is split into individual screenshots

**Output:** `Assets/screenshots/appstore/` + `Assets/screenshots/playstore/` (+ Fastlane dirs if `MobileApp/distribution` exists)

Requires: `falApiKey`, `openaiApiKey`, and `imgbbApiKey` (if using reference images)

| Flag | Description | Default |
|------|-------------|---------|
| `--prompt <text>` | App description (required) | - |
| `--input <dir>` | Reference screenshot directory | Auto-detect `Assets/screenshots` |
| `--style <id>` | Style preset (1-8) | `1` |
| `--output <dir>` | Output base directory | `Assets/screenshots` |
| `--resolution <res>` | AI resolution (`1K`, `2K`, `4K`) | `2K` |

<details>
<summary>Screenshot styles (1-8)</summary>

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

</details>

---

## `generate-feature-image`

Generate a **Google Play feature graphic** (1024×500 banner shown at the top of the Play Store listing) using OpenAI (prompt generation) + fal.ai (image generation). Optionally include the app logo and screenshots: fal.ai places them inside realistic phone device frames.

```bash
kappmaker generate-feature-image \
    --prompt "A cute AI mascot generator" \
    --app-name "Masclet" \
    --subtitle "Generate mascots, emotions, and expressions" \
    --primary-color "#E63946"
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

**Flow:**
1. OpenAI (GPT-4.1) refines the inputs into a detailed banner specification.
2. fal.ai generates one wide image (`nano-banana-2`, or `nano-banana-2/edit` with reference images) at 16:9.
3. `sharp` resizes/crops the result to EXACTLY 1024×500 px (Play Store feature graphic spec) via center cover.

**Output:** Default follows the Fastlane Supply convention so `kappmaker publish --upload-images` picks it up automatically:

```
MobileApp/distribution/android/playstore_metadata/<locale>/images/featureGraphic.png
```

Falls back to `Assets/playstore/featureGraphic.png` outside a KAppMaker project. Override with `--output <path>`.

Requires: `falApiKey`, `openaiApiKey`, and `imgbbApiKey` (recommended when passing `--logo` or `--reference`; falls back to inline base64 data URIs otherwise).

| Flag | Description | Default |
|------|-------------|---------|
| `--prompt <text>` | App concept / description (required) | - |
| `--app-name <name>` | App name rendered on the banner (required) | - |
| `--primary-color <hex>` | Brand color in hex (required, e.g. `#FF3B30`) | - |
| `--subtitle <text>` | Tagline rendered below the app name | - |
| `--logo <path>` | App logo PNG; rendered pixel-faithfully on the brand panel | - |
| `--reference <paths...>` | Screenshot paths to place inside device frames (max 10) | - |
| `--output <path>` | Custom output file path | Fastlane Supply path |
| `--resolution <res>` | AI resolution (`1K`, `2K`, `4K`) | `2K` |
| `--locale <code>` | Play Store locale for the default output path | `en-US` |

**Tips**:
- The logo (image #1) is rendered exactly as-is: the model is instructed not to redraw or recolor it. Pass a clean transparent-background PNG for best results.
- Reference screenshots are placed inside modern phone device frames at a slight angle. Order matters: the first reference becomes the most prominent device on the banner.
- The primary color visibly dominates the brand panel background or accents.
- Only the app name and subtitle appear as text: no AI-generated lorem copy.

---

## `generate-ios-icons`

> **2.2.0:** also writes the launch screen logo (`Assets.xcassets/ic_logo.imageset`, 1x/2x/3x); `--splash-background <hex>` / `--splash-background-dark <hex>` set `SplashBackground`; `--no-splash` skips it.

Generate the full iOS `AppIcon.appiconset` (all 11 PNG sizes Apple needs + `Contents.json`) from a single source logo. **Sharp-only: no AI, no API keys, no network calls.** Same output as appicon.co, but local and instant.

```bash
# Auto-detect logo in Assets/ and write to MobileApp/iosApp/*/Assets.xcassets/AppIcon.appiconset
kappmaker generate-ios-icons

# Explicit source + output
kappmaker generate-ios-icons --source ./Assets/logo.png --output ./path/to/AppIcon.appiconset

# Dark background for transparent logos
kappmaker generate-ios-icons --background "#000000"
```

**Flow:**
1. Resolves source: `--source <path>` if given; otherwise auto-detects in `Assets/` looking for `logo.png`, `logo_no_bg.png`, `app_logo.png`, `app_logo_no_bg.png`, `icon.png` (in that order). Prompts interactively if none found.
2. Center-crops to a square (warns if source is non-square) and flattens alpha onto `--background` color (App Store rejects icons with transparency).
3. Resizes via sharp Lanczos to all 11 pixel sizes: **29, 40, 57, 58, 60, 80, 87, 114, 120, 180, 1024**.
4. Writes `Contents.json` matching appicon.co's schema (12 entries, `120.png` is shared by 40pt@3x and 60pt@2x, covering `iphone` idiom @1x/2x/3x plus the `ios-marketing` 1024).
5. Overwrites existing files silently.

**Output:** Default is auto-detected `MobileApp/iosApp/*/Assets.xcassets/AppIcon.appiconset/` (the KAppMaker convention). Falls back to `Assets/AppIcon.appiconset/` outside a KAppMaker project. Override with `--output <dir>`.

| Flag | Description | Default |
|------|-------------|---------|
| `--source <path>` | Source logo PNG (≥ 1024×1024 recommended) | Auto-detect in `Assets/` |
| `--output <dir>` | Output `AppIcon.appiconset` directory | Auto-detect under `MobileApp/iosApp/` |
| `--background <hex>` | Flatten color for transparent logos | `#FFFFFF` |

**Tips:**
- Chain with `create-logo`: generate the logo first, then run `generate-ios-icons` to mint the full iconset.
- Source should be at least **1024×1024** for crisp icons at all sizes. Smaller sources are upscaled (with a warning) and will look blurry on iPhone 6.7" displays.
- Apple's App Store requires no transparency on the 1024×1024 marketing icon: the default `#FFFFFF` flatten satisfies this regardless of source alpha.

---

## `generate-android-icons`

> **2.2.0:** also points the Android 12+ splash (`windowSplashScreenAnimatedIcon`) at the new icon, sets `windowBackgroundColor` with `--splash-background`, and writes a themed monochrome icon when the logo is transparent. `--no-splash` skips the splash.

Generate the full Android launcher icon set: all five mipmap density buckets, both legacy and adaptive variants, plus the adaptive icon XML files and the `ic_launcher_background` color entry in `values/colors.xml`; from a single source logo. **Sharp-only: no AI, no API keys.** Same output as Android Studio's Asset Studio, but local and instant.

```bash
# Auto-detect logo in Assets/ and write to MobileApp/composeApp/src/androidMain/res
kappmaker generate-android-icons

# Explicit source + brand-colored adaptive background
kappmaker generate-android-icons --source ./Assets/logo.png --background "#0F0A0D"

# Tighter foreground (logo fills more of the adaptive canvas)
kappmaker generate-android-icons --foreground-padding 0.1
```

**Flow:**
1. Resolves source: `--source <path>` if given; otherwise auto-detects in `Assets/` looking for `logo.png`, `logo_no_bg.png`, `app_logo.png`, `app_logo_no_bg.png`, `icon.png` (in that order). Prompts interactively if none found.
2. Center-crops to a square (warns if source is non-square or smaller than 432×432).
3. For each of 5 density buckets: `mdpi` / `hdpi` / `xhdpi` / `xxhdpi` / `xxxhdpi`:
   - Writes `ic_launcher.webp` and `ic_launcher_round.webp` at legacy size (**48 / 72 / 96 / 144 / 192 px**).
   - Writes `ic_launcher_foreground.webp` at adaptive size (**108 / 162 / 216 / 324 / 432 px**) with the logo centered in the inner safe zone and transparent surround.
4. Writes `mipmap-anydpi-v26/ic_launcher.xml` and `ic_launcher_round.xml`: adaptive-icon definitions referencing `@color/ic_launcher_background` and `@mipmap/ic_launcher_foreground`.
5. Upserts `<color name="ic_launcher_background">` in `values/colors.xml`: creates the file if missing, replaces the value if present, inserts the entry alongside any other colors otherwise.
6. Overwrites existing files silently.

**Output:** Default is auto-detected `MobileApp/composeApp/src/androidMain/res/` (the KMM template convention). Falls back to `MobileApp/androidApp/src/main/res/` → `app/src/main/res/` → `Assets/android/res/`. Override with `--output <dir>`.

| Flag | Description | Default |
|------|-------------|---------|
| `--source <path>` | Source logo PNG (≥ 432×432 recommended) | Auto-detect in `Assets/` |
| `--output <dir>` | Output Android `res/` directory | Auto-detect under `MobileApp/` |
| `--background <hex>` | Adaptive icon backdrop color (written to `colors.xml`) | `#FFFFFF` |
| `--foreground-padding <ratio>` | Padding each side of the adaptive foreground (`0`-`0.5`) | `0.25` |

**Tips:**
- Chain with `create-logo` then `generate-android-icons` to mint the full Android iconset right after generating the logo.
- The default `--foreground-padding 0.25` matches Android Asset Studio's default; drop to `0.1` if your logo is small and you want it to fill more of the adaptive frame.
- The adaptive `--background` is referenced by the XML: Android renders this color behind the foreground on Android 8+ devices. On legacy launchers, the legacy `ic_launcher.webp` is used as-is.
- `AndroidManifest.xml` should already reference `@mipmap/ic_launcher` and `@mipmap/ic_launcher_round`: this command doesn't touch the manifest.

---

## ASO Keyword Research (skill-driven)

Discover high-value sub-niche keywords for your app, scored by popularity and difficulty, clustered by theme, and save them to `AiGuidelines/keywords.md`. Uses the [Astro MCP](https://tryastro.app/docs/mcp/) tools for real-time App Store data when they're connected; falls back to a manual brainstorm without scores when they aren't.

This is a **skill-driven workflow**: no `kappmaker` binary. Runs through the [Claude Code skill](army-and-mcp.md#claude-code-skill).

### Usage

```
Using kappmaker, research keywords for AI image generator
Using kappmaker, find aso keywords around manga translation
Using kappmaker, keyword research drift coaching competitors="Driftbox, RaceChrono"
Using kappmaker, find sub-niche keywords for photo editor min_popularity=40 max_difficulty=35
```

Short forms (`/kappmaker keyword research <topic>`, `find aso keywords for <topic>`) route to the same workflow.

### Arguments

| Arg | Default | Notes |
|---|---|---|
| `base` (the keyword) | _(required)_ | Can be derived from `AiGuidelines/prd.md`, `AiGuidelines/app-idea.md`, or your existing `en-US` name/subtitle if omitted: the workflow confirms before proceeding. |
| `competitors` | _(auto-discovered)_ | Comma-separated app names or App Store IDs. Auto-discovered via `search_app_store` if not given. |
| `min_popularity` | `30` | Keywords below this go to the "Discarded" list. |
| `max_difficulty` | `45` | Keywords above this go to the "Discarded" list. |
| `target_count` | `30 to 50` | Approximate pool size after filtering. Relaxes `max_difficulty` by +5 once if the count is too low. |
| `output` | `AiGuidelines/keywords.md` | Prompts before overwriting an existing file. |

### Output

`AiGuidelines/keywords.md` with five sections:

1. **Header**: base keyword, date, filter thresholds, competitor sources.
2. **Recommended primary keywords (top 5)**: the highest-value picks for your iOS `name` / `subtitle` and as front-loaded entries in `keywords.txt`.
3. **Sub-niche clusters**: keyword groups by semantic theme, scored and described. Each cluster maps cleanly to one of the 9 US-indexed locales in Mode 1 of metadata localization.
4. **Discarded**: keywords that hit the filter cutoff, so you can sanity-check the threshold.
5. **Ready-to-paste command**: a one-liner for `localize metadata mode=keyword-expansion` using the top ~10 keywords.

### Workflow (with Astro MCP)

1. `search_app_store` → discover competitor apps ranking for the base keyword.
2. `add_app` / `list_apps` → track competitors in Astro (free-tier quota errors are surfaced but don't abort).
3. `extract_competitors_keywords` / `get_app_keywords` → pull every keyword + popularity + difficulty score from each competitor.
4. `get_keyword_suggestions` → expand the pool with AI variations.
5. Filter by thresholds, dedupe (case-insensitive, singular/plural-aware), cluster by sub-niche.
6. Write `AiGuidelines/keywords.md`.

### Project convention: `AiGuidelines/`

KAppMaker's ASO workflows treat `AiGuidelines/` as the home for AI-facing planning docs (`prd.md`, `app-idea.md`, and the `keywords.md` this workflow writes). When you omit `base=`, the workflow scans `AiGuidelines/*.md` for a product description first, then falls back to your `README.md`, then your `en-US` name + subtitle. Keeping a 1 to 2 paragraph `AiGuidelines/app-idea.md` (or `prd.md`) means subsequent runs auto-derive their base keyword instead of asking you each time. The folder is created on first write if it doesn't exist.

### Without Astro MCP

If Astro MCP isn't connected, the workflow tells you upfront and offers a manual brainstorm path: 30 to 50 candidates from category knowledge, clustered the same way, with `?` in the popularity/difficulty columns. The output is still useful for the next step (metadata localization): you just need to validate the scores on Astro / AppTweak / Sensor Tower before going to production.

To connect Astro MCP, follow the setup guide at [tryastro.app/docs/mcp/](https://tryastro.app/docs/mcp/) and add the MCP server to your Claude Code config.

### Chain into metadata localization

The whole point of keyword research is feeding good keywords into Mode 1 of `localize-metadata`. The output file ends with a ready-to-paste line:

```
Using kappmaker, localize metadata mode=keyword-expansion keywords="ai art generator, text to image ai, prompt to picture, style transfer, ai avatar, ai portrait, ai bedroom designer, ai car designer, ai hairstyle, ai logo maker"
```

Run that next to fan those keywords across the 9 US-indexed locales.

---

## ASO Metadata Localization (skill-driven)

Generates per-locale App Store and Google Play **text** metadata (`name`, `subtitle`, `keywords`, `description` on iOS; `title`, `short_description`, `full_description` on Android): the text counterpart to `translate-screenshots`. The two together let you ship a fully-localized listing in one session.

This is a **skill-driven workflow**: it has no `kappmaker` binary because it doesn't need one. The [Claude Code skill](army-and-mcp.md#claude-code-skill) (`kappmaker:kappmaker`) reads your base-locale source files, applies the ASO strategy you pick, and writes the localized output files using the Read/Write tools directly. No AI API key required.

### Two modes

```
Using kappmaker, localize metadata mode=keyword-expansion keywords="drift coach, lap timer, ai car tuner, ..."
Using kappmaker, localize metadata mode=market-localization base=en-US locales="de-DE, fr-FR, ja, es-ES"
```

| Mode | Output language | Locales | Use case |
|---|---|---|---|
| `keyword-expansion` | **English** in all 9 folders | Fixed 9 US-indexed locales (`ar-SA`, `fr-FR`, `ko`, `pt-BR`, `ru`, `vi`, `zh-Hans`, `zh-Hant`, `es-MX`) | Multiply unique indexed keyword surface in the US App Store. The US store indexes those 9 locales alongside `en-US`: by writing different keywords into each, you ~9× the searchable terms. |
| `market-localization` | **Native** per locale | Whatever locales you pass in `locales=` | Adapt copy to local search behavior and culture. Not literal translation. |

### Output layout

| Platform | Path |
|---|---|
| iOS | `MobileApp/distribution/ios/appstore_metadata/texts/<iosLocale>/{name,subtitle,keywords,description}.txt` |
| Android | `MobileApp/distribution/android/playstore_metadata/<playLocale>/{title,short_description,full_description}.txt` |

The iOS layout uses a literal `texts/` subfolder (KAppMaker convention: bridge to Fastlane `deliver` with a sync step in your release pipeline if needed).

### Enforced ASO rules

Every generated file passes these checks before being written to disk:

- **iOS field limits**: `name` ≤ 30, `subtitle` ≤ 30, `keywords` ≤ 100 (comma-separated, **no spaces after commas**), `description` ≤ 4000
- **Android field limits**: `title` ≤ 30, `short_description` ≤ 80, `full_description` ≤ 4000
- **No word overlap** across `name` / `subtitle` / `keywords` within a single iOS locale (Apple wastes the slot if you repeat a name/subtitle word in keywords)
- **No brand name or filler** (`app`, `best`, `free`, etc.) in iOS keywords
- **Front-loaded primary keyword** in `name` / `title` (position-weighted ranking)
- **Native-feel test** in Mode 2: no machine-translated phrasing

### Behavior

- **Base-locale bootstrap**: if `en-US` (or whatever `base=` you pass) doesn't exist yet, the workflow asks for a 1 to 2 sentence app description and writes the base locale first. Never fails because the base is missing.
- **Mode 1 overwrite**: always overwrites the 9 indexed locales without prompting (only `en-US` is protected).
- **Mode 2 overwrite**: prompts once ("Found existing metadata in N locale(s) ... Overwrite ALL? \[y/N]") if any target locale already has files. `N` skips those locales and continues with the rest.
- **Summary table**: prints per-field character counts for every locale at the end, flagging any cell at ≥ 95% of cap.

### Supported locales

Mode 1 uses a fixed set of 9. Mode 2 accepts ~30 locale codes covering both platforms: the workflow holds the iOS↔Play mapping (e.g. iOS `ko` ↔ Play `ko-KR`, iOS `zh-Hans` ↔ Play `zh-CN`). See [the skill file](../../skills/kappmaker-aso-metadata/SKILL.md#localize-aso-metadata--per-locale-name--subtitle--keywords--description) for the full table.

### Pair with screenshot translation

`translate-screenshots` (image side) + ASO metadata localization (text side) together produce a fully-localized App Store and Play Store listing. Typical sequence:

```
kappmaker translate-screenshots --locales de-DE ja
# then, in a Claude Code session:
Using kappmaker, localize metadata mode=market-localization locales="de-DE, ja"
```

---
