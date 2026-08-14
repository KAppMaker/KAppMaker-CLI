# Output format for `AiGuidelines/keywords.md`

Read this when writing the report (step 7 of the procedure). The structure is what makes the file
directly consumable by kappmaker-aso-metadata's keyword-expansion mode — do not improvise a
different layout.

#### Output format (`AiGuidelines/keywords.md`)

```markdown
# ASO Keyword Research

**Base keyword:** <base>
**Generated:** <ISO date>
**Filters:** popularity ≥ <min_popularity>, difficulty ≤ <max_difficulty>
**Sources:** <competitor app names, comma-separated> + AI suggestions

## Recommended primary keywords (top 5)

These are the highest-value picks across all sub-niches — strong popularity, low-to-moderate difficulty. Use these in the iOS `name` and `subtitle` and as the front-loaded terms in `keywords.txt` for `en-US`.

| Keyword | Popularity | Difficulty | Why |
|---------|-----------:|-----------:|-----|
| <kw>    | 72         | 28         | Highest popularity in the pool with low competition — strongest single bet. |
| ...

## Sub-niche clusters

### Cluster 1 — <theme, e.g. "AI text-to-image">

| Keyword | Popularity | Difficulty | Description |
|---------|-----------:|-----------:|-------------|
| ai text to image       | 65 | 38 | Direct text-to-image generation — main user search intent. |
| prompt to picture      | 42 | 22 | Long-tail variant; lower volume but very low competition. |
| ai art from text       | 38 | 31 | Adjacent phrasing common among casual users. |
| ...

### Cluster 2 — <theme, e.g. "Image editing">

| Keyword | Popularity | Difficulty | Description |
|---------|-----------:|-----------:|-------------|
| ...

(repeat per cluster)

## Discarded (for reference)

Keywords that hit the filter cutoff. Listed so the user can sanity-check the threshold choice and see what was rejected.

| Keyword | Popularity | Difficulty | Reason dropped |
|---------|-----------:|-----------:|---------------|
| ai photo            | 95 | 78 | Difficulty too high (saturated by mega-apps) |
| free image generator| 18 |  9 | Popularity too low |
| ...
```

