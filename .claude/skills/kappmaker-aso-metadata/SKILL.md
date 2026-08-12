---
name: kappmaker-aso-metadata
description: Write the per-locale App Store metadata for a KAppMaker app — name, subtitle, keywords and description across locales, plus the rules that decide what goes where: no word repeated within a locale, uniqueness across locales, and quality over uniqueness. Use when the user asks what to call the app in the stores, or to write or fix the title, subtitle, keyword field or localized listing.
---

# KAppMaker — ASO Metadata (per locale)

## Before running any command

1. **Prerequisites** — `kappmaker --version` (install: `npm i -g kappmaker`). If a credential is
   missing the CLI says so; re-run `kappmaker config init`.
2. **Read `AiGuidelines/` first** — the PRD and positioning already answer most questions.

### Localize ASO Metadata — Per-locale Name / Subtitle / Keywords / Description

This is a **skill-driven procedure**, not an external CLI command. Claude (you) executes the prompts in this section directly using the Read/Write tools — there is no shell binary to invoke and no AI API key required. All text generation and ASO-rule enforcement happens in-conversation.

**Trigger phrases** (any of these in the user's message routes here):
- `Using kappmaker, localize metadata mode=keyword-expansion ...`
- `Using kappmaker, localize metadata mode=market-localization ...`
- "localize aso", "localize metadata", "aso keyword expansion", "aso keywords"

**Argument parsing** (extract from the user message):
- `mode` — required, one of `keyword-expansion` | `market-localization`
- `keywords` — required for `keyword-expansion`; comma-separated list (strip surrounding quotes, trim each entry, drop empties)
- `base` — optional for `market-localization`; defaults to `en-US`
- `locales` — required for `market-localization`; comma- or space-separated codes (no autodetect)
- `distribution_dir` — optional override. Default resolution: search upward from cwd for a directory containing `MobileApp/distribution/`; if not found, use `./MobileApp/distribution`. If neither exists, create `./MobileApp/distribution/` and use that.

If `mode` is missing or invalid, stop and ask the user to pick one of the two modes and provide its required args.

#### Output layout (strict — same for both modes)

- **iOS**: `<distribution_dir>/ios/appstore_metadata/texts/<iosLocale>/{name,subtitle,keywords,description}.txt`
  - The `texts/` subfolder IS literal and intentional. Not standard Fastlane `deliver` layout.
- **Android**: `<distribution_dir>/android/playstore_metadata/<playLocale>/{title,short_description,full_description}.txt`

`en-US` (or the user-chosen base) is **never** modified once it exists. No images, screenshots, or other files are touched.

#### Preflight checklist (run BEFORE either mode procedure)

1. Resolve `<distribution_dir>` (see argument parsing above).
2. **Base-locale bootstrap (NEVER fail when missing)**: read the base-locale folders:
   - iOS: `<distribution_dir>/ios/appstore_metadata/texts/<base>/{name,subtitle,keywords,description}.txt`
   - Android: `<distribution_dir>/android/playstore_metadata/<base>/{title,short_description,full_description}.txt`
   
   If either folder is missing entirely, OR any of the expected files is missing OR empty (zero bytes), enter **bootstrap mode**:
   - Ask the user (single prompt): `"Base locale '<base>' is missing some metadata. Briefly describe the app and its core value (1–2 sentences):"` Wait for the reply.
   - For Mode 1 (`keyword-expansion`), use the user's app description + the `keywords=` list to compose the base-locale files. For Mode 2 (`market-localization`), use just the app description.
   - Apply the **ASO Guidelines** (see bottom of this section) to the bootstrapped output: front-load the strongest keyword in `name`/`title`, no spaces after commas in keywords, no word repetition across `name`/`subtitle`/`keywords` in the iOS folder, respect every char limit.
   - Write the missing base files first (only those that were missing or empty — preserve any non-empty siblings as the source for the rest).
3. After bootstrap (or directly if everything was present), read all 7 base-locale files into local variables you can reference as `<BASE_NAME>`, `<BASE_SUBTITLE>`, `<BASE_KEYWORDS>`, `<BASE_DESCRIPTION>`, `<BASE_TITLE>`, `<BASE_SHORT_DESC>`, `<BASE_FULL_DESC>`.
4. For Mode 2: validate every code in `locales=` resolves in the **Mode 2 Locale Table** (below). If any code is unknown, abort with the full supported-codes list printed and do NOT create any folders.

#### Mode 1 — keyword-expansion procedure

**Locale set (FIXED)** — the 9 US-indexed locales:

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

**Overwrite behavior**: always overwrite these 9 locales without prompting. The base locale (`en-US`) is the only protected folder and is never touched (except by the bootstrap step above, which writes it once if missing).

**Reasoning script** (execute this prompt yourself — do NOT print it to the user; you ARE the senior ASO strategist):

```
# ROLE
You are a senior ASO strategist specialized in App Store keyword indexing
mechanics and Google Play metadata optimization.

# CONTEXT
The US App Store indexes keywords from `name`, `subtitle`, and `keywords`
fields across these 9 additional locales (beyond en-US):

INDEXED_LOCALES = {
  iOS folder → Play Store folder
  "ar-SA"    → "ar"
  "fr-FR"    → "fr-FR"
  "ko"       → "ko-KR"
  "pt-BR"    → "pt-BR"
  "ru"       → "ru-RU"
  "vi"       → "vi"
  "zh-Hans"  → "zh-CN"
  "zh-Hant"  → "zh-TW"
  "es-MX"    → "es-MX"
}

More unique indexed keywords = more ranking surface = more organic installs.

# OBJECTIVE
Maximize unique keyword coverage in the US App Store by distributing
English keywords (NOT translations) across these 9 locales.

# INPUTS
- Existing en-US iOS metadata:
    name:        <BASE_NAME>
    subtitle:    <BASE_SUBTITLE>
    keywords:    <BASE_KEYWORDS>
    description: <BASE_DESCRIPTION>
- Existing en-US Android metadata:
    title:             <BASE_TITLE>
    short_description: <BASE_SHORT_DESC>
    full_description:  <BASE_FULL_DESC>
- Target keywords to rank for:
    <LIST_KEYWORDS_HERE>

# HARD RULES
1. DO NOT modify en-US. Leave it untouched.
2. Generate ENGLISH content in all 9 locale folders (this is intentional —
   Apple indexes them regardless of declared language).
3. ZERO keyword duplication WITHIN a locale:
   - title ≠ subtitle ≠ keywords (no word overlap inside one locale)
4. PREFER zero duplication ACROSS the 9 locales, but allow strategic repetition
   when the keyword pool is exhausted (see KEYWORD DISTRIBUTION STRATEGY below).
5. Apple character limits (enforce strictly):
   - name (title):    ≤ 30 chars
   - subtitle:        ≤ 30 chars
   - keywords field:  ≤ 100 chars, comma-separated, NO spaces after commas
6. No brand name in the iOS keywords field.
7. Avoid plural/singular duplication unless it unlocks a distinct search.
8. Avoid generic filler ("app", "best", "free", "new") — wasted slots.
9. Front-load highest-volume keywords in the iOS name (left = stronger).
10. For Android (Play Store), write NATURALLY phrased English short/full
    descriptions in each locale folder, embedding the same locale's keywords.
    title ≤ 30 chars, short_description ≤ 80 chars, full_description ≤ 4000 chars.
11. For iOS `description.txt` (per locale): write a fresh English description
    that naturally embeds that locale's assigned keywords. Same length range
    as the en-US description. NOT a translation; NOT a verbatim copy.

# PROCESS
1. Read en-US metadata to understand the app's purpose, tone, and primary value.
2. Cluster the target keywords by semantic theme (e.g., "design", "tuning",
   "customization", "AI", "mechanic").
3. Assign each cluster to one locale to keep them coherent and discoverable.
4. Draft title/subtitle/keywords per locale, then verify with the checklist below.

# KEYWORD DISTRIBUTION STRATEGY

## Language rule
Generate ENGLISH content in all 9 locale folders. This is intentional —
the US App Store indexes these fields regardless of the folder's declared
language. Localization is NOT the goal here; keyword surface area is.

## Uniqueness rules (in priority order)

### Rule A — Within a single locale: ZERO repetition (hard rule)
Inside ONE locale, no word may appear in more than one field.
- title ∩ subtitle = ∅
- title ∩ keywords = ∅
- subtitle ∩ keywords = ∅
Apple does not re-index a word that already appears in title/subtitle when
it also appears in the keywords field — it's wasted space.

### Rule B — Across the 9 locales: PREFER uniqueness, allow strategic repetition
The goal is to maximize TOTAL unique keywords indexed across all 9 locales.
So the default is: every keyword appears in exactly ONE locale.

But do not force uniqueness at the cost of relevance:
1. Build a ranked list of candidates (user-provided keywords + tight synonyms
   + adjacent relevant terms), ordered by relevance × search-volume potential.
2. Distribute across the 9 locales, filling them with UNIQUE keywords first.
3. If you run out of strongly-relevant unique keywords before all 9 locales
   are filled, DO NOT invent weak, generic, or off-topic terms to maintain
   uniqueness. Instead: reuse strongest keywords in remaining locales paired
   with different secondary/long-tail terms so the title + subtitle + keywords
   COMBINATION still differs.
4. NEVER produce two locales with identical title AND subtitle AND keywords.

## Quality-over-uniqueness principle
A relevant keyword indexed twice is more valuable than an irrelevant keyword
indexed once. When in doubt, choose relevance.

# SELF-VERIFICATION CHECKLIST (run before writing any file)
- [ ] Every target keyword appears in at least one locale (ideally exactly one).
- [ ] No word repeats across title/subtitle/keywords within a single locale.
- [ ] All character limits satisfied (run mental wc -c on each field).
- [ ] No spaces after commas in any iOS keywords field.
- [ ] en-US is not in the write list.
- [ ] No two locales have identical title + subtitle + keywords combination.
- [ ] Every keyword used is genuinely relevant to the app (no filler).
- [ ] If any keyword repeats across locales, it's because it's high-value
      AND the unique pool was exhausted — not laziness.
```

**Writing step** (after reasoning is complete and self-verification passes):
- Use the Write tool to create exactly 9 iOS folders (4 files each = 36 files) and 9 Android folders (3 files each = 27 files), totaling **63 files**.
- Order: write all iOS files first, then all Android files, so the user sees progress logically.
- After every Write, mentally count the bytes you just wrote and confirm it's ≤ the relevant limit. If you ever produce an over-limit value, fix it before the next Write — never write over-limit content "intending to fix it later."

**Summary table** (print after all writes — this IS user-visible output):
```
Mode 1 — keyword-expansion complete. Wrote 63 files across 9 locale pairs.

| Locale (iOS / Play) | name | sub | kw | desc | title | short | full |
|---|---:|---:|---:|---:|---:|---:|---:|
| ar-SA / ar          | 28  | 27  | 96 | 712 | 29  | 78 | 1840 |
| ... (9 rows total)
```
Flag any cell that is ≥ 95% of its cap with ` ⚠️`.

#### Mode 2 — market-localization procedure

**Locale resolution**: parse `locales=` (comma- or space-separated), look each up in the **Mode 2 Locale Table** (below), build `(iosLocale, playLocale)` pairs. If one platform's code is `(none)` for that language, skip that platform and note it in the summary. If a user-supplied code matches NO entry in the table, abort with the full supported-codes list and do NOT create any folders.

**Locale presets** — also accept the following natural-language phrasings instead of (or in addition to) explicit `locales=` codes. Expand the preset to its concrete locale set BEFORE running the validation step above. Always confirm the expanded set with the user before generating (single line: `"Localizing to N locales: <list>. Proceed? [y/N]"`).

| Phrase patterns | Expanded locale set |
|---|---|
| `top 10`, `tier 1`, `essential locales`, `essentials` (≈10 markets) | `de-DE, fr-FR, es-ES, es-MX, ja, ko, zh-Hans, pt-BR, ru, it` |
| `top 15`, `tier 2`, `top 15 markets` | `de-DE, fr-FR, es-ES, es-MX, ja, ko, zh-Hans, pt-BR, ru, it, nl-NL, tr-TR, ar-SA, pl, zh-Hant` |
| `top 20`, `tier 3`, `top 20 markets` | `de-DE, fr-FR, es-ES, es-MX, ja, ko, zh-Hans, pt-BR, ru, it, nl-NL, tr-TR, ar-SA, pl, zh-Hant, hi, id, vi, th, fr-CA` |
| `all`, `every locale`, `all supported locales`, `every market` | The full 30 from the Mode 2 Locale Table below |
| `European`, `EU markets`, `all European locales` | `de-DE, fr-FR, es-ES, it, nl-NL, pt-BR, pl, ru, tr-TR, sv, da, no, fi, el, cs, hu, ro, uk` (treat Portuguese-BR as the European-Portuguese stand-in since Apple/Google don't ship a `pt-PT` in our table) |
| `East Asia`, `East Asian locales` | `ja, ko, zh-Hans, zh-Hant` |
| `Southeast Asia`, `SEA`, `Southeast Asian markets` | `id, ms, th, vi` |
| `Spanish`, `Spanish locales`, `Spanish-speaking markets` | `es-ES, es-MX` |
| `Chinese`, `Chinese locales`, `Chinese-speaking markets` | `zh-Hans, zh-Hant` |
| `MENA`, `Arabic`, `Middle East` | `ar-SA` (single locale; both stores ship one Arabic folder) |

**Combiners** — also accept these natural-language patterns:

- `top 10 plus hi and id` → expand the preset, then add `hi, id`.
- `tier 1 markets but skip ru and zh-Hans` → expand the preset, then remove the listed codes.
- `German, Japanese, Korean, and Brazilian Portuguese` → resolve language names to codes (`de-DE, ja, ko, pt-BR`). Use the **Mode 2 Locale Table** below as the authoritative name → code mapping.

If a preset expansion produces a locale not in the Mode 2 Locale Table, drop it silently — don't surface broken codes to the user.

**Existing-files check**: for each target locale, check whether ANY of the 4 iOS files or 3 Android files already exist on disk. Collect the list of "locales with existing files". If non-empty, **prompt ONCE**:

```
Found existing metadata in N locale(s): a, b, c.
Overwrite ALL existing metadata? [y/N]
```

- Enter / `N` / `no` → exclude those locales, continue with the rest (or exit with `"No locales to generate, exiting."` if that empties the list).
- `y` / `yes` → proceed for all targeted locales.

**Reasoning script** (execute yourself, per locale; you ARE the senior ASO expert):

```
# ROLE
You are a senior ASO expert with deep market knowledge of how users search
in their native language across Apple App Store and Google Play.

# OBJECTIVE
Adapt the app's metadata for the target locale to maximize **discoverability
in that local market** — not translation accuracy.

# INPUTS (from the base locale; verbatim text below)
- iOS:
    name:        <BASE_NAME>
    subtitle:    <BASE_SUBTITLE>
    keywords:    <BASE_KEYWORDS>
    description: <BASE_DESCRIPTION>
- Android:
    title:             <BASE_TITLE>
    short_description: <BASE_SHORT_DESC>
    full_description:  <BASE_FULL_DESC>

# TARGET
- iOS locale folder:  <iosLocale>
- Play locale folder: <playLocale>
- Language:           <Language>

# HARD RULES
1. NEVER translate literally. Adapt to:
   - Local search behavior and phrasing conventions
   - Locally trending keywords for the app's category
   - Cultural framing of the value proposition
2. Respect platform limits (enforce strictly):
   - iOS:     name ≤ 30, subtitle ≤ 30, keywords ≤ 100 (no spaces after commas)
   - Android: title ≤ 30, short_description ≤ 80, full_description ≤ 4000
3. Front-load the primary keyword in title (iOS ranking is position-weighted).
4. iOS keywords field MUST NOT repeat any word from name or subtitle.
5. Android full_description: use primary keyword 3–5 times naturally, plus
   secondary keywords woven in. No keyword stuffing.
6. Descriptions are conversion copy — write them for native speakers, not bots.
   Local idioms welcome.

# PROCESS
1. Identify the locale's primary search intent for this app category.
2. Pick a PRIMARY keyword (highest local volume) + 3–5 SECONDARY keywords.
3. Compose title around the primary keyword in a natural local phrasing.
4. Compose subtitle (iOS) / short_description (Android) around secondaries.
5. Compose description focusing on conversion, naturally seeded with keywords.
6. Verify against the checklist.

# SELF-VERIFICATION CHECKLIST (per locale, before writing)
- [ ] All character limits satisfied
- [ ] No word overlap between iOS name/subtitle/keywords
- [ ] Reads naturally to a native speaker (no machine-translated feel)
- [ ] Primary keyword appears in title AND short_description / subtitle
- [ ] No spaces after commas in iOS keywords
```

**Writing step**: use the Write tool to create each locale's iOS folder (4 files) and Android folder (3 files). If a locale's iOS code is `(none)`, skip the iOS writes for that locale; same for Android.

**Summary** (printed at end):
- `Wrote: <list of locales with platform pairs>`
- `Skipped (user declined overwrite): <list>` if any
- `Skipped (one-platform-only): <list with reasons>` if any
- `Char-limit warnings: <field, locale, length>` for any that landed ≥ 95% of cap

#### Mode 2 Locale Table

The codes here are the only valid values for `locales=`. If a user passes anything not in this table, abort the run with this table printed.

| iOS folder | Play folder | Language |
|---|---|---|
| ar-SA   | ar      | Arabic |
| cs      | cs-CZ   | Czech |
| da      | da-DK   | Danish |
| de-DE   | de-DE   | German |
| el      | el-GR   | Greek |
| es-ES   | es-ES   | Spanish (Spain) |
| es-MX   | es-MX   | Spanish (Mexico) |
| fi      | fi-FI   | Finnish |
| fr-CA   | (none)  | French (Canada, iOS-only) |
| fr-FR   | fr-FR   | French |
| hi      | hi-IN   | Hindi |
| hu      | hu-HU   | Hungarian |
| id      | id      | Indonesian |
| it      | it-IT   | Italian |
| ja      | ja-JP   | Japanese |
| ko      | ko-KR   | Korean |
| ms      | ms      | Malay |
| nl-NL   | nl-NL   | Dutch |
| no      | no-NO   | Norwegian |
| pl      | pl-PL   | Polish |
| pt-BR   | pt-BR   | Portuguese (Brazil) |
| ro      | ro      | Romanian |
| ru      | ru-RU   | Russian |
| sv      | sv-SE   | Swedish |
| th      | th      | Thai |
| tr      | tr-TR   | Turkish |
| uk      | uk      | Ukrainian |
| vi      | vi      | Vietnamese |
| zh-Hans | zh-CN   | Chinese (Simplified) |
| zh-Hant | zh-TW   | Chinese (Traditional) |

If the user provides a Play code in `locales=` (e.g. `ko-KR`), accept it and look up the iOS counterpart (`ko`). Same in reverse — if they pass `zh-Hans`, the Play folder is `zh-CN`. Be liberal in what you accept on input; strict in what you write to disk (always use the canonical folder names from this table).

#### Canonical ASO Guidelines (apply in all modes, including bootstrap)

**iOS field limits**:
- `name.txt`: ≤ 30 chars
- `subtitle.txt`: ≤ 30 chars
- `keywords.txt`: ≤ 100 chars, comma-separated, **NO spaces after commas**
- `description.txt`: ≤ 4000 chars

**Android field limits**:
- `title.txt`: ≤ 30 chars
- `short_description.txt`: ≤ 80 chars
- `full_description.txt`: ≤ 4000 chars

**iOS keyword field rules**:
- No word repeats across `name`, `subtitle`, and `keywords` within the same locale. Apple already indexes title and subtitle — putting those same words in the keywords field wastes 100-char budget.
- Avoid plural/singular pairs (`runner`, `runners`) unless they unlock genuinely distinct searches.
- No brand/app name in the keywords field — Apple indexes the brand from the `name` field automatically.
- No filler words (`app`, `best`, `free`, `new`, `pro`, `the`, `for`, `with`, `and`) — every comma-separated slot must be a searchable term users actually type.
- Front-load highest-volume keywords in the iOS `name`. Position weighting: left side ranks stronger than right.

**Android description rules**:
- Primary keyword in `title` AND `short_description`.
- `full_description` uses the primary keyword 3–5 times naturally distributed across paragraphs, with 5–10 secondary keywords woven in. Never keyword-stuff.
- Write for conversion: lead with the user's problem, then the value, then features, then social proof if relevant. Bullet lists are fine.

**Mode 2 native-feel test**: every locale must read as if written by a native marketer. If the copy would read awkwardly to a native speaker, rewrite. Idioms and locally-loved framing are encouraged. Avoid English loan-words unless they're standard in that market for that category.

**Bootstrap-mode quality bar**: when generating `en-US` (or any base) from scratch, hold the output to all the same rules above. Bootstrap is not a draft — it becomes the source of truth that every other locale derives from.

---

## Where this sits in the flow

- **Before this:** **kappmaker-aso** — you need the keyword research before writing the fields.
- **After this:** **kappmaker-asc** / **kappmaker-gpc** to upload the metadata to the stores.
