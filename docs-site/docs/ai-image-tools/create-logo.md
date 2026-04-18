---
sidebar_position: 2
title: AI Logo Generation
---

# AI Logo Generation

Generate an app logo using fal.ai's nano-banana-2 model.

**Command:** `kappmaker create-logo`

```bash
kappmaker create-logo
kappmaker create-logo --prompt "A minimalist fitness tracker for runners"
kappmaker create-logo --output ./custom/path/logo.png
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--prompt <text>` | App idea / concept (skips the interactive prompt) | — |
| `--output <path>` | Custom output path | `Assets/app_logo.png` |

## Flow

1. Reads app idea from `--prompt` (or prompts interactively if omitted)
2. Generates a 4x4 grid of 16 logo variations (2K, 1:1)
3. Opens grid in Preview.app for review
4. Pick a logo (1-16) or R to regenerate — optional: `5 --zoom 1.1 --gap 3`
5. Extracts chosen logo at 512x512

## Output

- `Assets/app_logo.png` — the selected logo
- `Assets/logo_variations.png` — the full grid for reference

## Requirements

Requires a fal.ai API key. Prompted on first use if not set, or configure manually:

```bash
kappmaker config set falApiKey <your-key>
```
