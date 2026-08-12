---
name: kappmaker-image
description: Generate any other AI image for a KAppMaker app — illustrations, empty-state and error art, onboarding graphics, backgrounds, one-off artwork from a prompt. Use when the user asks for an image, illustration or artwork that is not the logo (kappmaker-logo) and not store screenshots (kappmaker-screenshots).
---

# KAppMaker — Image

## Before running any command

1. **Prerequisites** — `kappmaker --version` (install: `npm i -g kappmaker`). If a credential is
   missing the CLI says so; re-run `kappmaker config init`.
2. **Read `AiGuidelines/` first** — the PRD, positioning and UI spec already answer most questions.


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
