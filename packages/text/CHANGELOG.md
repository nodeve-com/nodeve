# @nodeve/text

## 2.0.0

### Major Changes

- 63bcd90: Remove `titleCase` from `@nodeve/text/text-format` — it reinvented remeda's `toTitleCase` (identical output on every supported case). Use remeda's `toTitleCase` instead. Note: remeda additionally normalizes all-caps input (`HELLO WORLD` → `Hello World`), where the removed local helper passed it through unchanged.

  Also: `identifierSimilarity` now strips meaningless conversion affixes (`to`) before comparison, so conversion-helper names no longer dilute the token-set score (kept when the affix is the only token).

## 1.0.0

### Major Changes

- Promote `@nodeve/text` to a stable 1.0 and add four text utilities migrated from the platform `@pumpspotting/utils` package:

  - `@nodeve/text/slugify` — `slugify` + `uniqueSlug` (charmap transliteration)
  - `@nodeve/text/wrap-text` — greedy `wrapText`
  - `@nodeve/text/lone-surrogates` — `replaceLoneSurrogates(Deep)` for jsonb safety
  - `@nodeve/text/text-format` — `titleCase`, `formatSigned`, `isIsoDateString`

  Adds `remeda` as a runtime dependency (used by `lone-surrogates` and `text-format`).
