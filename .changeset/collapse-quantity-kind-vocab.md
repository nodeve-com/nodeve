---
'@nodeve/grimoire': major
---

Collapse quantity_kind onto the shared `makeVocab` surface. Removes the bespoke `quantityKinds`, `quantityKind()`, `quantityKindCrosswalk()`, and `QuantityKind` exports — use `QUANTITY_KIND` (`.dict`, `.codes`, `.crosswalk`) like `ACCUMULATION`.
