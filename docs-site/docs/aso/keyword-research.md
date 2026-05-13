---
sidebar_position: 2
title: Keyword Research
---

# Keyword Research

Generate a curated list of high-value ASO keywords for your app — clustered by sub-niche, scored by popularity and difficulty — and write the result to `AiGuidelines/keywords.md`. The output is designed to feed directly into [Metadata Localization](metadata-localization.md) (Mode 1: keyword expansion).

This is a **skill-driven workflow** running through the [Claude Code skill](../guides/claude-code-skill.md). It uses the [Astro MCP](https://tryastro.app/docs/mcp/) tools when they're connected for real-time App Store data; without Astro it falls back to a manual brainstorm.

## Triggers

```
Using kappmaker, research keywords for AI image generator
Using kappmaker, find aso keywords around manga translation
Using kappmaker, keyword research drift coaching competitors="Driftbox, RaceChrono"
Using kappmaker, find sub-niche keywords for photo editor min_popularity=40 max_difficulty=35
```

Short forms like `kappmaker keyword research <topic>` and `find aso keywords for <topic>` route here too.

## What it produces

`AiGuidelines/keywords.md` — a single Markdown file with:

1. **Header** — base keyword, generation date, filter thresholds, and competitor sources.
2. **Recommended primary keywords (top 5)** — highest-value picks across all sub-niches. These are the ones to use in your iOS `name` and `subtitle`, and to front-load in `keywords.txt`.
3. **Sub-niche clusters** — groups of related keywords with their popularity and difficulty scores, plus a one-line description of the user intent each one captures.
4. **Discarded** — keywords that hit the filter cutoff, so you can sanity-check the threshold and see what was rejected.
5. **Ready-to-paste command** — a one-liner you can drop straight into `localize metadata mode=keyword-expansion`.

Example structure:

```markdown
# ASO Keyword Research

**Base keyword:** AI image generator
**Generated:** 2026-05-13
**Filters:** popularity ≥ 30, difficulty ≤ 45

## Recommended primary keywords (top 5)

| Keyword | Popularity | Difficulty | Why |
|---------|-----------:|-----------:|-----|
| ai art generator    | 72 | 28 | High volume, low competition relative to "ai photo" |
| text to image ai    | 68 | 34 | Direct search intent for the core feature |
| ...

## Sub-niche clusters

### Cluster 1 — AI text-to-image
| Keyword | Popularity | Difficulty | Description |
|---|---:|---:|---|
| ai text to image    | 65 | 38 | Main user search intent for text-to-image |
| prompt to picture   | 42 | 22 | Long-tail variant, very low competition |
| ai art from text    | 38 | 31 | Casual user phrasing |

### Cluster 2 — Style transfer
...
```

## Arguments

| Argument | Default | Notes |
|---|---|---|
| `base` / base keyword | _(required)_ | The anchor topic. Can be derived from `AiGuidelines/prd.md` / `AiGuidelines/app-idea.md` (or any product-description `*.md` under `AiGuidelines/`), then the project `README.md`, or the existing `en-US` name + subtitle as a last resort. The workflow confirms the inferred base with you before proceeding. |
| `competitors` | _(auto-discovered)_ | Comma-separated list of competitor app names or App Store IDs. Auto-discovered via `search_app_store` if omitted. |
| `min_popularity` | `30` | Keywords below this are dropped from the main lists (still appear in "Discarded"). |
| `max_difficulty` | `45` | Keywords above this are dropped (still appear in "Discarded"). |
| `target_count` | `30–50` | Approximate size of the final filtered pool. The workflow relaxes `max_difficulty` by +5 once if it can't hit the target. |
| `output` | `AiGuidelines/keywords.md` | If the file already exists, the workflow asks once before overwriting; on decline, writes to `AiGuidelines/keywords-<date>.md`. |

## Workflow

1. **Discover competitors** — `search_app_store({ query: <base> })` to find live apps ranking for the base keyword. Top 5–10 most relevant become the competitor set (or use the explicit `competitors=` list).
2. **Track competitors in Astro** — `list_apps` to check what's already tracked, then `add_app` for any missing ones. Free-tier quota errors are surfaced but don't abort the run.
3. **Extract competitor keywords** — `extract_competitors_keywords` / `get_app_keywords` on each tracked competitor; collect every returned keyword along with its `popularity` and `difficulty` scores.
4. **Expand with AI suggestions** — `get_keyword_suggestions({ base_keyword: <base> })` to broaden the candidate pool with variations the competitor scan didn't surface.
5. **Filter and dedupe** — apply `popularity ≥ min_popularity` and `difficulty ≤ max_difficulty`, drop case-insensitive duplicates, prefer the higher-popularity entry for near-duplicates (singular/plural).
6. **Cluster into sub-niches** — group remaining keywords by semantic theme. Each cluster maps cleanly to one of the 9 indexed locales when you run Mode 1 keyword expansion next.
7. **Write `AiGuidelines/keywords.md`** with the structure above.

## Project convention: the `AiGuidelines/` folder

KAppMaker's ASO workflows treat `AiGuidelines/` as the home for AI-facing planning docs:

- `AiGuidelines/prd.md` — Product Requirements Document
- `AiGuidelines/app-idea.md` — short app concept / value prop
- `AiGuidelines/keywords.md` — output of this workflow
- Any other `*.md` you keep there that describes the app's purpose, target users, or competitors

When this workflow needs to derive a base keyword from your project, it scans `AiGuidelines/` first, then falls back to the project `README.md`, then your existing `en-US` ASO metadata. You don't have to use this folder — but if you do, the workflow finds your context automatically and you skip the "describe your app" prompt.

If `AiGuidelines/` doesn't exist yet, the workflow creates it on first write.

## Astro MCP not available?

If Astro MCP isn't connected in your session, the workflow falls back to a **manual brainstorm**: it generates 30–50 sub-niche candidates from category knowledge, marks `popularity` / `difficulty` columns as `?` (unknown), and adds a header warning that you need to validate the numbers on [Astro](https://tryastro.app/docs/mcp/), App Store Connect, AppTweak, or Sensor Tower before using the keywords in production listings.

The cluster structure and the "Recommended primary keywords" section still get filled in, so you still get the same downstream value — just without the scoring confidence.

To connect Astro MCP, follow the setup guide at [tryastro.app/docs/mcp/](https://tryastro.app/docs/mcp/) and add the MCP server to your Claude Code config.

## The full ASO chain

```
1. Using kappmaker, research keywords for <topic>
   → produces AiGuidelines/keywords.md

2. Pick 10–15 keywords from the Recommended + top-cluster entries

3. Using kappmaker, localize metadata mode=keyword-expansion keywords="<picks>"
   → writes English copy across the 9 US-indexed locales
      with each locale holding a different cluster of keywords

4. kappmaker translate-screenshots --locales ar-SA fr-FR ko pt-BR ru vi zh-CN zh-TW es-MX
   → matches the image-side to the text-side
```

End-to-end: research → text → images.

## See also

- [ASO Guidelines](guidelines.md) — character limits, keyword field rules, US-indexed locale strategy explained.
- [Metadata Localization](metadata-localization.md) — the natural next step. Feed the keywords from this workflow into Mode 1 keyword expansion.
- [Screenshot Translation](translate-screenshots.md) — image-side ASO companion.
- [Astro MCP](https://tryastro.app/docs/mcp/) — the data source for popularity / difficulty scores.
