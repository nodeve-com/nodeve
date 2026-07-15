---
'@nodeve/config': minor
---

Ship the org function-shape rules that were already written but never released: `max-depth` (3), `max-params` (3), and `max-lines-per-function` (35, off for test files). They landed in the eslint base after the 0.4.1 cut, so every consumer on 0.4.1 got `func-names` and nothing else. Expect new lint failures on adoption — that's the rules working.
