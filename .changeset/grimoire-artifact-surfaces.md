---
'@nodeve/grimoire': minor
---

Artifacts are a full query surface. Registers linking a named `quantity` now bake the resolved base `quantity_kind` into the catalog artifact (effective column stays `quantity ?? quantity_kind`) — JSON readers route energy vs power without the TS enumeration module. Display-policy and parts bake to `artifacts/` JSON; the whole `artifacts/` tree ships in the tarball with an `./artifacts/*.json` export. New `grimoire` bin queries the baked JSON (`catalog`, `registers`, `enumeration`, `quantity`). New guard: every generated TS module must have an artifacts JSON twin — TS exports are a view, never the only copy.
