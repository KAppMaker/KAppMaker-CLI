---
sidebar_position: 6
title: Image Processing (Split, Remove BG, Enhance, WebP)
---

# Image Processing

Split grid images, remove backgrounds, enhance image quality, and convert images to WebP. AI-powered tools require a fal.ai API key (prompted on first use); the WebP converter runs entirely locally.

## image-split

Splits a grid image into individual tiles.

```bash
kappmaker image-split grid.png --rows 4 --cols 4 --zoom 1.1 --gap 3
kappmaker image-split grid.png --keep 1,5    # Keep only tiles 1 and 5
```

### Options

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

---

## image-remove-bg

Removes background using fal.ai bria model. Outputs PNG with transparency.

```bash
kappmaker image-remove-bg logo.png
kappmaker image-remove-bg photo.jpg --output clean.png
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--output <path>` | Custom output path | `<filename>_no_bg.png` |

---

## image-enhance

Upscales and improves image quality using fal.ai nano-banana-2 edit model.

```bash
kappmaker image-enhance logo.png
kappmaker image-enhance photo.jpg --output improved.png
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--output <path>` | Custom output path | `<filename>_enhanced.png` |

---

## convert-webp

Converts images (PNG, JPG, JPEG, BMP, TIFF, GIF) to WebP format — similar to Android Studio's built-in converter. Runs entirely locally using sharp, no API key needed.

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
| `--quality <n>` | WebP quality (0–100) | `75` |
| `--recursive` | Search directories recursively | `false` |
| `--delete-originals` | Delete original files after conversion | `false` |
| `--output <dir>` | Output directory (default: same as source) | — |
