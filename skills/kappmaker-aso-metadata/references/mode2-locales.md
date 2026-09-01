# Mode 2 — market-localization: presets, reasoning script, and the locale table

Read this when executing Mode 2. Contains the natural-language locale presets, the per-locale
reasoning script, and the authoritative iOS↔Play locale table (the only valid `locales=` values).

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

