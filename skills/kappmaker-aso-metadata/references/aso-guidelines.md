# Canonical ASO guidelines — apply in every mode, including bootstrap

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

