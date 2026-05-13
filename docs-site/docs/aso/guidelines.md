---
sidebar_position: 1
title: ASO Guidelines
---

# ASO Guidelines

App Store Optimization (ASO) is the practice of tuning your app's metadata so it ranks for the right searches and converts the right users. KAppMaker's ASO tools (text localization and screenshot translation) all enforce the rules on this page. If you write your own metadata by hand, follow them too.

## Field character limits

### iOS (App Store Connect / Fastlane `texts/<locale>/`)

| File | Limit | Notes |
|---|---:|---|
| `name.txt` | **30 chars** | App name shown on the store. Front-load your strongest keyword (left = stronger ranking weight). |
| `subtitle.txt` | **30 chars** | Single line under the name. Use it for secondary keywords or the value proposition. |
| `keywords.txt` | **100 chars** | Comma-separated, **NO spaces after commas**. Each comma-separated token is one indexed search term. |
| `description.txt` | **4000 chars** | Conversion copy. Less weighted for search than name/subtitle/keywords. |

### Android (Google Play / Fastlane `playstore_metadata/<locale>/`)

| File | Limit | Notes |
|---|---:|---|
| `title.txt` | **30 chars** | App title shown on the store. Primary keyword goes here. |
| `short_description.txt` | **80 chars** | Below the title in the store listing. Both indexed AND visible — has to read well AND contain keywords. |
| `full_description.txt` | **4000 chars** | Heavily indexed on Google Play. Use the primary keyword 3–5 times naturally. Bullet lists welcome. |

## iOS keyword field rules

The `keywords.txt` file on iOS is special — it's a comma-separated list of indexable tokens that's never shown to users. Optimizing it well is the single highest-ROI ASO win.

1. **No word repeats across `name`, `subtitle`, and `keywords` within the same locale.** Apple already indexes every word in your name and subtitle. Repeating them in the keywords field wastes your 100-char budget.
2. **No spaces after commas.** `photo,editor,filter` is correct; `photo, editor, filter` wastes 2 chars and produces the same indexing.
3. **No brand or app name.** Apple indexes the brand from the `name` field automatically — duplicating it in keywords is wasted space.
4. **Avoid plural/singular pairs** (`runner`, `runners`) unless they unlock genuinely distinct searches.
5. **No filler words** (`app`, `best`, `free`, `new`, `pro`, `the`, `for`, `with`, `and`). Every slot must be a searchable term users actually type.

## Android description rules

1. **Primary keyword in `title` AND `short_description`.** Both fields contribute to ranking; only one of them is visible above the fold on the store page.
2. **`full_description` uses the primary keyword 3–5 times** naturally distributed across paragraphs, with 5–10 secondary keywords woven in. Never keyword-stuff — Google penalizes it and users notice.
3. **Lead with the user's problem**, then the value, then the feature list, then social proof if relevant. Bullet lists are fine and tend to convert well.

## Native-feel test (for market localization)

When localizing for a specific market (Mode 2 of `localize-metadata`), every locale must read as if written by a native marketer in that country. Apply this test to every output:

- Would a native speaker think this was originally written in their language?
- If translated literally from English, are there idioms or word orders that read awkwardly? Rewrite them.
- Are there English loan-words you used? They're fine ONLY if they're standard for that market in your app's category. Otherwise replace them with the native equivalent.
- Does the value proposition resonate with that market's culture? (E.g. "save money" lands harder in some markets, "save time" in others, "look good" in others.)

A literal translation is worse than nothing. It signals "this is a foreign app" and tanks conversion.

## Two distribution strategies

### Strategy 1 — Keyword Expansion (US-indexed locales)

The US App Store indexes 9 additional locales beyond `en-US` even when the user's device is set to English. By writing **English** content into those 9 locale folders with **different keywords in each**, you multiply the indexed keyword surface — roughly 9× the searchable terms for the same app.

The 9 indexed locales:

| iOS folder | Play folder |
|---|---|
| `ar-SA`   | `ar` |
| `fr-FR`   | `fr-FR` |
| `ko`      | `ko-KR` |
| `pt-BR`   | `pt-BR` |
| `ru`      | `ru-RU` |
| `vi`      | `vi` |
| `zh-Hans` | `zh-CN` |
| `zh-Hant` | `zh-TW` |
| `es-MX`   | `es-MX` |

Trade-off: users in those countries see English copy. For most utility / productivity / global SaaS apps that's acceptable; for B2C consumer apps targeting specific local markets, use Strategy 2 instead.

### Strategy 2 — Market Localization (native per-locale)

Write per-locale **native** copy adapted to local search behavior, locally trending keywords, and the culture's framing of the value proposition. The goal is discoverability + conversion in each individual market — not English-keyword surface in the US.

Use this when you genuinely target multiple countries and want users in each one to see copy that feels written for them.

### Pick one, not both

The two strategies conflict — if you've assigned `fr-FR` to hold "drift coach, lap timer, telemetry" English keywords (Strategy 1), you can't also have it hold native French copy targeting French search terms (Strategy 2). Decide per-app which strategy fits.

KAppMaker's `localize metadata` skill workflow makes both strategies one-shot operations — see [Metadata Localization](metadata-localization.md).

## See also

- [Metadata Localization](metadata-localization.md) — generate localized `name`/`subtitle`/`keywords`/`description` (iOS) and `title`/`short_description`/`full_description` (Android) files for both strategies above.
- [Screenshot Translation](translate-screenshots.md) — translate marketing screenshots into 48+ locales using fal.ai.
