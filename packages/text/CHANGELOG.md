# @nodeve/text

## 1.0.0

### Major Changes

- Promote `@nodeve/text` to a stable 1.0 and add four text utilities migrated from the platform `@pumpspotting/utils` package:

  - `@nodeve/text/slugify` — `slugify` + `uniqueSlug` (charmap transliteration)
  - `@nodeve/text/wrap-text` — greedy `wrapText`
  - `@nodeve/text/lone-surrogates` — `replaceLoneSurrogates(Deep)` for jsonb safety
  - `@nodeve/text/text-format` — `titleCase`, `formatSigned`, `isIsoDateString`

  Adds `remeda` as a runtime dependency (used by `lone-surrogates` and `text-format`).
