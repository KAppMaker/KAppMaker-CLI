# Mode 1 — keyword-expansion: reasoning script and writing step

Read this when executing Mode 1. The skill's SKILL.md decides *when* to run it; this file is the
*how* — the full reasoning script, the distribution rules, and the writing/summary steps.

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

