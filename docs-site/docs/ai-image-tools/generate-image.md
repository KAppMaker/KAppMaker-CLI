---
sidebar_position: 3
title: AI Image Generation
---

# AI Image Generation

Generate arbitrary images using fal.ai's nano-banana-2 model. A generic wrapper — use this any time you need a one-off image without the logo-grid selection flow.

**Command:** `kappmaker generate-image`

```bash
kappmaker generate-image --prompt "A minimalist mountain landscape at sunset"
kappmaker generate-image --prompt "Hero banner for a meditation app" --aspect-ratio 16:9 --resolution 4K
kappmaker generate-image --prompt "Product render" --num-images 4 --output Assets/hero
kappmaker generate-image --prompt "Put this logo on a black t-shirt" --reference Assets/app_logo.png
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--prompt <text>` | Text description of the image (required) | — |
| `--output <path>` | Output file or directory | `Assets/generated.png` |
| `--num-images <n>` | Number of images to generate (1–8) | `1` |
| `--aspect-ratio <ratio>` | `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, `21:9`, `9:21`, `auto` | `1:1` |
| `--resolution <res>` | `1K`, `2K`, `4K` | `2K` |
| `--output-format <fmt>` | `png`, `jpg`, `webp` | `png` |
| `--reference <paths...>` | Reference images — file paths, directories, or HTTP URLs (edit mode, max 10) | — |

## Output path behavior

- **No `--output`** → `Assets/generated.png` (single) or `Assets/generated_1.png`, `_2.png`… (multi)
- **`--output <dir>`** (no extension) → saves into that directory
- **`--output <file.png>`** → single image uses the path verbatim; for multiple images, `_1`, `_2`, … are appended before the extension

## Reference images (edit mode)

Passing `--reference` switches the endpoint from `nano-banana-2` (text-to-image) to `nano-banana-2/edit` (reference-guided generation).

Each reference entry can be any of:

- **A file path** — `Assets/logo.png`
- **A directory** — all `.png` / `.jpg` / `.jpeg` / `.webp` inside are picked up, sorted alphabetically, non-recursive
- **An HTTP(S) URL** — used as-is without re-upload

Up to **10** references are used (extras are dropped with a warning). Multiple entries can be mixed and matched:

```bash
# Single local file
kappmaker generate-image --prompt "..." --reference Assets/logo.png

# Whole directory of refs (sorted, max 10)
kappmaker generate-image --prompt "..." --reference Assets/moodboard

# Mix of files, directories, and URLs
kappmaker generate-image \
  --prompt "Combine these into a single product mockup" \
  --reference Assets/logo.png Assets/frames https://example.com/backdrop.jpg
```

### How local files are sent to fal.ai

| Condition | How it's sent |
|-----------|---------------|
| `imgbbApiKey` configured | Uploaded to imgbb; the resulting public URL is passed to fal.ai |
| `imgbbApiKey` not set | Read locally and sent inline as a base64 data URI |

Data URIs work fine for small images but can fail on very large ones — configure an imgbb key for more reliable large-image handling:

```bash
kappmaker config set imgbbApiKey <your-key>
```

Get a free key at [api.imgbb.com](https://api.imgbb.com/).

## Requirements

Requires a fal.ai API key. Prompted on first use if not set, or configure manually:

```bash
kappmaker config set falApiKey <your-key>
```

Get a key at [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys).
