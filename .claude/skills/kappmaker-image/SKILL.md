---
name: kappmaker-image
description: Generate any AI image for a KAppMaker app — illustrations, empty-state and error-state art, onboarding graphics, backgrounds, placeholders, or one-off artwork from a prompt. Use when the user asks for an image, an illustration, a picture, or artwork that is not the app logo (that is kappmaker-logo) and not store screenshots (kappmaker-screenshots).
---

# KAppMaker — AI Images

Any picture the app or its store presence needs, other than the two assets that have their own
skills: the **logo** (kappmaker-logo) and **store screenshots** (kappmaker-screenshots).

Typical asks: onboarding illustrations, empty-state and error-state art, feature graphics inside
the app, backgrounds, placeholder imagery.

## Before running any command

1. **Prerequisites** — `kappmaker --version` (install: `npm i -g kappmaker`). Missing credential?
   Re-run `kappmaker config init`.
2. **Match the app's look** — `AiGuidelines/` holds the UI spec and design direction; read it so a
   generated image does not fight the design system.

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
