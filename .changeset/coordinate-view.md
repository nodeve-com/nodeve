---
'@nodeve/schema': minor
---

Ship the `coordinate` view in both DDL dialects — the `*` part marker's documented contract, implemented once.

A `*` interval is a TEMPLATE: one band stated for every member of its feature's subdivision. Nothing resolved it, so every downstream generator was about to write the same expansion itself, in two languages — and a naive flatten collides `…/out/*/active-power/_` with `…/out/_/active-power/_`, two different rows under one name.

`coordinate` yields one row per addressable coordinate: `node` (the resolved path, no `*` survives), `interval` (FK to the row it came from), `part` (the member it resolved to). Non-`*` intervals pass through verbatim. `count` expands through a recursive CTE, which both dialects run — one body, no dialect fork. An explicit part outranks the default: the view drops an expansion that lands on a real interval's path rather than doubling onto it.

The view mints no name; it rewrites the part segment of a path the row already carried. `buildDatabase` now gates on coordinate uniqueness alongside `foreign_key_check` — the view mints paths the PK never saw, so nothing else proved them distinct.
