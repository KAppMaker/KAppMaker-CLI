---
name: kappmaker-logo
description: Generate the app's logo with AI — the brand mark used for icons, splash and store art. Use when the user asks for a logo or brand mark. For any other picture use kappmaker-image; for platform icon sets use kappmaker-app-icons.
---

# KAppMaker — Logo

## Before running any command

1. **Prerequisites** — `kappmaker --version` (install: `npm i -g kappmaker`). If a credential is
   missing the CLI says so; re-run `kappmaker config init`.
2. **Read `AiGuidelines/` first** — the PRD, positioning and UI spec already answer most questions.


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

## Where this sits in the flow

- **Before this:** **kappmaker-new-app**.
- **After this:** **kappmaker-app-icons** — turn the finished logo into iOS and Android icon sets.
