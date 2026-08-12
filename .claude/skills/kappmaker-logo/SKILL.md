---
name: kappmaker-logo
description: Generate the app's logo with AI for a KAppMaker app — the brand mark used for icons, splash and store art. Use when the user asks for a logo, a brand mark, or to redo the app's logo. For any other image (illustrations, empty states, onboarding art, backgrounds) use kappmaker-image.
---

# KAppMaker — Logo

## Before running any command

1. **Prerequisites** — `kappmaker --version` (install: `npm i -g kappmaker`). If a credential is
   missing the CLI says so; re-run `kappmaker config init`.
2. **Read `AiGuidelines/` first** — the PRD, user flow and UI spec already answer most product
   questions. Do not invent decisions they cover.

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

## Only the logo lives here

Need any *other* picture — an illustration, an empty-state graphic, onboarding art, a background?
That is **kappmaker-image**. Turning a finished logo into platform icon sets is **kappmaker-app-icons**.

