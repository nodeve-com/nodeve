---
'@nodeve/checks': patch
---

helper-collisions: a missing lib-names index no longer silently passes. Previously `loadLibIndex` returned `[]` when the index file was absent, so a repo that opted into the gate (via `helperCollisions.libs`) but hadn't committed the generated index would see the check go green while checking nothing. It now fails loudly when `libs` is configured but the index is missing, pointing at `nodeve-build-lib-names` (or opting out with `libs: []`).
