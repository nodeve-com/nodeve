---
'@nodeve/schema': minor
---

Lower `*` to concrete interval rows at normalize, and drop the `coordinate` view.

A resolved coordinate is now a ROW. `*` is authoring shorthand that never reaches the database: the walk replays a template body once per roster member, so every addressable point has a `node`, a `code`, and one thing to FK. The lowering runs after the feature's keys are all walked, because a `*` may precede the parts it applies to. That end-of-walk seam is where 0.4.0 already resolved the roster to mint `Part` rows.

The view computed this per query and could not give a point an identity; a row can. Expansion also covers downstream trees, which walk the same `buildCatalog`, so no SQL object has anything left to do — `bin/ddl.py` emits tables only, and `Interval.part` narrows to slug-or-`_`.

Precedence survives the move: an expansion landing on a path an explicit part already holds yields to it, never doubles onto it. Authored twice is still a duplicate coordinate. Deferring the lowering puts every explicit part in hand before any default lowers, so the rule needs no second pass.

Both measurand resolvers drop their `*` fallback — a default has already become the part's own row, so the lookup is exact. `buildDatabase`'s coordinate-uniqueness gate goes with the view: expanded rows ARE interval rows, so the node PK proves path uniqueness, and it throws where the view silently dropped. The catalog holds the same 228 points the view computed, now as 228 interval rows.
