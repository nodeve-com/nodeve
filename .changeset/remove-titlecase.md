---
'@nodeve/text': major
---

Remove `titleCase` from `@nodeve/text/text-format` — it reinvented remeda's
`toTitleCase` (identical output on every supported case). Use remeda's
`toTitleCase` instead. Note: remeda additionally normalizes all-caps input
(`HELLO WORLD` → `Hello World`), where the removed local helper passed it
through unchanged.

Also: `identifierSimilarity` now strips meaningless conversion affixes
(`to`) before comparison, so conversion-helper names no longer dilute the
token-set score (kept when the affix is the only token).
