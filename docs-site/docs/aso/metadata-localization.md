---
sidebar_position: 3
title: Metadata Localization
---

# Metadata Localization

Generate localized ASO text metadata — `name`, `subtitle`, `keywords`, `description` for iOS and `title`, `short_description`, `full_description` for Android — directly into Fastlane-compatible locale folders.

This is a **skill-driven workflow**: it runs through the [Claude Code skill](../guides/claude-code-skill.md) (`kappmaker:kappmaker`), not as a `kappmaker` shell command. Claude reads your `en-US` source files, applies the ASO strategy you pick, and writes the localized output files directly. No API key is required — all generation happens in the model conversation.

## Two modes

You pick the mode explicitly; the workflow never mixes them. See [ASO Guidelines](guidelines.md) for the strategy trade-off.

| Mode | Output language | Locales | Use case |
|---|---|---|---|
| `keyword-expansion` | English in all 9 folders | Fixed set of 9 US-indexed locales | Maximize unique keyword surface in the US App Store |
| `market-localization` | Native per locale | Whatever locales you list | Adapt copy for users in each target market |

## Triggers

Invoke from any Claude Code session by mentioning the skill in your message. Examples:

```
Using kappmaker, localize metadata mode=keyword-expansion keywords="drift coach, lap timer, ai car tuner, ghost lap, apex finder, suspension setup, track day app, racing line, telemetry analyzer, sector times"

Using kappmaker, localize metadata mode=market-localization base=en-US locales="de-DE, fr-FR, ja, es-ES"

Using kappmaker, localize metadata mode=market-localization
```

The skill router also picks up shorter phrasings like "localize aso", "localize metadata", and "aso keyword expansion".

## Output layout

| Platform | Path |
|---|---|
| iOS | `MobileApp/distribution/ios/appstore_metadata/texts/<iosLocale>/{name,subtitle,keywords,description}.txt` |
| Android | `MobileApp/distribution/android/playstore_metadata/<playLocale>/{title,short_description,full_description}.txt` |

The iOS layout uses a literal `texts/` subfolder. This is intentional — it's KAppMaker's chosen convention and is NOT standard Fastlane `deliver` layout (Fastlane expects `<locale>/` directly under `appstore_metadata/`). Bridge to Fastlane with a small sync step in your release pipeline, or upload the text files via the App Store Connect API directly.

`en-US` (or your chosen base locale) is **never** overwritten once it exists.

## Mode 1 — Keyword Expansion

```
Using kappmaker, localize metadata mode=keyword-expansion keywords="<10–15 target keywords, comma-separated>"
```

### Locale set (fixed)

The 9 US-indexed locales. You don't choose these — they're the locales the US App Store indexes alongside `en-US`.

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

### Behavior

- Reads `en-US` as the source of truth (app voice, value prop, tone). If `en-US` doesn't exist, the workflow prompts for a 1–2 sentence app description and bootstraps `en-US` first — see [Bootstrap behavior](#bootstrap-behavior) below. Never fails because the base is missing.
- Distributes your target keywords across the 9 locales by semantic cluster (e.g. "design" keywords to one locale, "AI" keywords to another) so each locale stays coherent and searchable.
- Generates fresh **English** content in each locale's 4 iOS files and 3 Android files (63 files total).
- The iOS `description.txt` per locale is freshly written to naturally embed that locale's assigned keywords — it's not translated and not copy-pasted from `en-US`.
- Always overwrites the 9 locales without prompting (only `en-US` is protected).

### Uniqueness rules

- **Within a locale** (hard): zero word overlap across `name`, `subtitle`, and `keywords`. Apple does not re-index a word from name/subtitle when it also appears in keywords — it's wasted space.
- **Across the 9 locales** (preferred): every keyword appears in exactly one locale, so each one indexes a different surface. When the strong-keyword pool is exhausted, high-value keywords may repeat across locales rather than padding with weak filler.

### Summary table

After the run completes, the workflow prints a table:

```
| Locale (iOS / Play) | name | sub | kw | desc | title | short | full |
|---------------------|-----:|----:|---:|-----:|------:|------:|-----:|
| ar-SA / ar          | 28   | 27  | 96 | 712  | 29    | 78    | 1840 |
| fr-FR / fr-FR       | 27   | 29  | 99 | 685  | 28    | 80    | 1925 |
| ...
```

Any cell at ≥ 95% of its cap is flagged.

## Mode 2 — Market Localization

```
Using kappmaker, localize metadata mode=market-localization base=en-US locales="de-DE, fr-FR, ja, es-ES"
```

### Required arguments

- `mode=market-localization`
- `locales=` — comma- or space-separated list of locale codes, OR a named preset (see below). No silent autodetect.
- `base=` — optional, defaults to `en-US`. The base locale is the source of truth for app voice and value prop.

### Locale presets

Instead of typing locale codes, you can use named presets and the workflow expands them:

| Preset (any phrase containing these words) | Locales |
|---|---|
| `top 10` / `tier 1` / `essential` / `essentials` | `de-DE, fr-FR, es-ES, es-MX, ja, ko, zh-Hans, pt-BR, ru, it` |
| `top 15` / `tier 2` | Tier 1 + `nl-NL, tr-TR, ar-SA, pl, zh-Hant` |
| `top 20` / `tier 3` | Tier 2 + `hi, id, vi, th, fr-CA` |
| `all` / `every locale` / `all supported locales` | All 30 entries from the [supported codes table](#supported-locale-codes) below |
| `European` / `EU markets` | `de-DE, fr-FR, es-ES, it, nl-NL, pt-BR, pl, ru, tr-TR, sv, da, no, fi, el, cs, hu, ro, uk` |
| `East Asia` | `ja, ko, zh-Hans, zh-Hant` |
| `Southeast Asia` / `SEA` | `id, ms, th, vi` |
| `Spanish` | `es-ES, es-MX` |
| `Chinese` | `zh-Hans, zh-Hant` |
| `MENA` / `Arabic` | `ar-SA` |

Combiners are recognized too — e.g. `top 10 plus hi and id`, `tier 1 markets but skip ru and zh-Hans`. The workflow shows you the expanded list and asks for confirmation before generating, so you can sanity-check it.

**Which preset?** `top 10` is the right default for paid utilities and B2C SaaS — those markets concentrate App Store / Play Store revenue. `top 15` adds the next EU + MENA + Eastern Europe layer. `top 20` is the better default if you're Android-heavy and target South / Southeast Asia. `all` is rarely the right call unless you're a free game with very broad appeal — localizing well costs effort even when the workflow handles the typing.

### Behavior

- Reads the base locale and adapts each target locale's copy to local search behavior, locally trending keywords, and the cultural framing of the value proposition.
- The output is **NOT** a literal translation. Word order, idioms, and the lead value claim may differ entirely between locales when local search intent differs.
- Front-loads the primary keyword in `name` / `title` (left = stronger ranking weight).
- iOS `keywords.txt` per locale never repeats words from that locale's `name` or `subtitle`.

### Existing-files protection

If any target locale already has any of the expected files on disk, the workflow prompts ONCE:

```
Found existing metadata in N locale(s): de-DE, fr-FR.
Overwrite ALL existing metadata? [y/N]
```

- `N` (or Enter) → skips those locales, continues with the rest (or exits with `"No locales to generate, exiting."` if the list becomes empty).
- `y` → regenerates all targeted locales.

### Supported locale codes

Pass any of these in `locales=`. The workflow accepts either the iOS or Play form and writes to both stores using the canonical folder names below.

| iOS folder | Play folder | Language |
|---|---|---|
| `ar-SA`   | `ar`      | Arabic |
| `cs`      | `cs-CZ`   | Czech |
| `da`      | `da-DK`   | Danish |
| `de-DE`   | `de-DE`   | German |
| `el`      | `el-GR`   | Greek |
| `es-ES`   | `es-ES`   | Spanish (Spain) |
| `es-MX`   | `es-MX`   | Spanish (Mexico) |
| `fi`      | `fi-FI`   | Finnish |
| `fr-CA`   | _(none)_  | French (Canada, iOS only) |
| `fr-FR`   | `fr-FR`   | French |
| `hi`      | `hi-IN`   | Hindi |
| `hu`      | `hu-HU`   | Hungarian |
| `id`      | `id`      | Indonesian |
| `it`      | `it-IT`   | Italian |
| `ja`      | `ja-JP`   | Japanese |
| `ko`      | `ko-KR`   | Korean |
| `ms`      | `ms`      | Malay |
| `nl-NL`   | `nl-NL`   | Dutch |
| `no`      | `no-NO`   | Norwegian |
| `pl`      | `pl-PL`   | Polish |
| `pt-BR`   | `pt-BR`   | Portuguese (Brazil) |
| `ro`      | `ro`      | Romanian |
| `ru`      | `ru-RU`   | Russian |
| `sv`      | `sv-SE`   | Swedish |
| `th`      | `th`      | Thai |
| `tr`      | `tr-TR`   | Turkish |
| `uk`      | `uk`      | Ukrainian |
| `vi`      | `vi`      | Vietnamese |
| `zh-Hans` | `zh-CN`   | Chinese (Simplified) |
| `zh-Hant` | `zh-TW`   | Chinese (Traditional) |

A code not in this table is rejected upfront — the workflow aborts with the full list printed before creating any folders. If you need a locale that's not here, ask in the skill conversation and Claude can add it.

## Bootstrap behavior

If the base locale (`en-US` by default) doesn't have its 4 iOS files and 3 Android files filled in, the workflow does **not** fail. It enters bootstrap mode:

1. Asks you to describe the app in 1–2 sentences.
2. For Mode 1, uses that description plus your `keywords=` list to compose the base locale files.
3. For Mode 2, uses just the description.
4. Writes the missing base files first, holding them to the same field rules as the localized output (char limits, no spaces after commas, front-loaded primary keyword, etc.).
5. Continues into the regular mode procedure with the freshly-written base as the source.

This makes the workflow usable on a fresh project where no `en-US` content exists yet.

## What gets enforced

Every file written passes the [ASO Guidelines](guidelines.md) checks:

- All character limits (iOS: 30/30/100/4000, Android: 30/80/4000)
- No spaces after commas in iOS `keywords.txt`
- No word overlap across iOS `name`/`subtitle`/`keywords` within a locale
- No brand name or filler words in iOS `keywords.txt`
- Native-feel test in Mode 2 (no machine-translated phrasing)

If any output would exceed a limit, the workflow shortens it (preferring synonyms or cutting filler) and surfaces it in the summary table. The workflow never writes over-limit content.

## See also

- [ASO Guidelines](guidelines.md) — character limits, keyword field rules, and the strategy trade-off explained.
- [Screenshot Translation](translate-screenshots.md) — the image-side ASO tool. Pair the two for end-to-end localized listings.
- [Claude Code Skill](../guides/claude-code-skill.md) — how the `kappmaker:kappmaker` skill is installed and invoked.
