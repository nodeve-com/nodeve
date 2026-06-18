---
"@nodeve/checks": minor
---

inline-dupes now scans `packages/` in addition to `apps/` by default, matching
reshape and helper-collisions. Its guidance also now calls out the case where a
whole *set* of names recurs together (a shared prologue, the same handful of
locals): pull them into one module behind a shared TS type rather than allowlist
each name. Repos whose `packages/` legitimately repeat top-level names can still
scope it back with `inlineDupes: { globs: ['apps/*.ts'] }`.
