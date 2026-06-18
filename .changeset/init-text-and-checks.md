---
"@nodeve/text": minor
"@nodeve/checks": minor
---

Add `@nodeve/text` (fuzzy identifier matching + boundary-aware trimming) and
`@nodeve/checks` (org-wide commit-gate checks and helper-index generators,
driven by a per-repo `nodeve.checks.js` and wired through lefthook). Extracted
and generalized from the pumpspotting/platform pre-commit gate.
