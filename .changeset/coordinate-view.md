---
'@nodeve/schema': minor
---

Give features a part ROSTER, and ship the `coordinate` view that expands `*` over it.

`part_set` says which part slugs are legal; it never said which ones a feature has. Conflating those two facts invents parts. The `three-phase` vocabulary carries the line-to-line pairs because some meters measure them, so an inverter that meters three legs was picking up `ab`/`bc`/`ca` rows carrying a leg's current. The distinction existed only in a YAML comment.

New `Part` class — one row per subdivision a feature actually has, at `<feature>/<slug>`, no columns of its own. A `part_set` feature must now name its parts (`a: {}` is enough — an empty block claims the subdivision without asserting a band); `count: n` mints `1…n` itself. The walk refuses a `*` over an empty roster, which would expand to nothing and lose the bands silently. `Interval.part` stays a discriminator string, so `_` and `*` still name no row.

`coordinate` yields one row per addressable coordinate: `node` (the resolved path, no `*` survives), `interval` (FK to the row it came from), `part` (the one it resolved to). Non-`*` intervals pass through verbatim. One body, both dialects, no recursion — the roster is a table. An explicit part outranks the default: the view drops an expansion that lands on a real interval's path rather than doubling onto it.

The view mints no name; it rewrites the part segment of a path the row already carried. `buildDatabase` gates on coordinate uniqueness alongside `foreign_key_check` — the view mints paths the PK never saw, so nothing else proved them distinct.
