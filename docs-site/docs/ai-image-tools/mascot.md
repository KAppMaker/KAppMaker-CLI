---
sidebar_position: 4
title: AI Mascot Generation
---

# AI Mascot Generation

Generate an app mascot and its emotional states using fal.ai. A mascot personifies your app — it reacts on loading, empty, success and error screens, carries onboarding and streaks, and measurably boosts engagement and shareability.

The flow mirrors [logo generation](./create-logo.md): a 4×4 grid of 16 different mascot concepts → you pick one → that exact character is rendered in 16 emotional states, sliced into individual files, backgrounds removed automatically.

## create-mascot

```bash
kappmaker create-mascot --prompt "A plant care app for busy people" --tone "playful and cozy"
```

Or from pre-authored specs (what the Claude Code skill does):

```bash
kappmaker spec-template mascot --output Assets/mascot/mascot-spec.json
kappmaker spec-template mascot-states --output Assets/mascot/mascot-states-spec.json
# fill the skeletons, then:
kappmaker create-mascot --spec Assets/mascot/mascot-spec.json --states-spec Assets/mascot/mascot-states-spec.json
```

### Flow

1. **Concept grid** — generates a 4×4 grid of 16 distinct mascot concepts (cartoon, chibi, 3D, flat vector, …), opens a preview, and asks you to pick (1-16, or `R` to regenerate; optional `5 --zoom 1.1 --gap 3`).
2. **Extraction** — the chosen mascot is cut out to `Assets/mascot/mascot.png`, plus a background-removed `mascot_no_bg.png`.
3. **Emotional states** — the chosen mascot is passed as a reference image (edit mode) so its identity stays consistent, and a second 4×4 grid renders it in 16 states. Each sliced file is named after its state — `states/happy.png`, `states/loading.png`, `states/error.png`, … — and every background is removed.

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--prompt <text>` | App idea (skips the interactive prompt) | — |
| `--tone <text>` | App tone woven into the concept grid | — |
| `--spec <path>` | Pre-authored concept-grid spec JSON (`spec-template mascot`) | — |
| `--states-spec <path>` | Pre-authored states-grid spec JSON (`spec-template mascot-states`) — its `states` list also names the output files | — |
| `--states <names...>` | Custom state names (topped up to 16 with defaults) | 16 defaults |
| `--output <dir>` | Output directory | `Assets/mascot` |
| `--resolution <res>` | AI resolution for the states grid (`1K`, `2K`, `4K`) | `2K` |
| `--skip-states` | Stop after the mascot is chosen | — |
| `--skip-remove-bg` | Keep original backgrounds | — |

**Default states**: happy, sad, excited, thinking, loading, success, error, idle, celebrating, confused, proud, curious, sleeping, encouraging, waving, love.

## mascot-add-state

Add one more state later, without regenerating anything:

```bash
kappmaker mascot-add-state --state "shopping"
kappmaker mascot-add-state --state "level up" --mascot ./Assets/mascot/mascot_no_bg.png
```

Uses the existing mascot as the reference image (default: `Assets/mascot/mascot_no_bg.png`, falling back to `mascot.png`), generates a single centered illustration of the requested state, saves it to `Assets/mascot/states/<slug>.png`, and removes the background.

| Flag | Description | Default |
|------|-------------|---------|
| `--state <text>` | The emotional/situational state to generate | — |
| `--mascot <path>` | Mascot reference image | Auto-detect in `Assets/mascot` |
| `--spec <path>` | Pre-authored single-state spec JSON used as the prompt | — |
| `--output <path>` | Output file path | `<mascot dir>/states/<slug>.png` |
| `--skip-remove-bg` | Keep the original background | — |

## Requirements

Requires `falApiKey` only (prompted on first use). No OpenAI key. Background removal uses fal.ai's bria model — one call per image, so a full 16-state run makes ~18 fal.ai calls; pass `--skip-remove-bg` to halve that.
