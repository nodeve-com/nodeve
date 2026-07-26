# @nodeve/schema

## 0.5.0

### Minor Changes

- 7456dcf: Lower `*` to concrete interval rows at normalize, and drop the `coordinate` view.

  A resolved coordinate is now a ROW. `*` is authoring shorthand that never reaches the database: the walk replays a template body once per roster member, so every addressable point has a `node`, a `code`, and one thing to FK. The lowering runs after the feature's keys are all walked, because a `*` may precede the parts it applies to. That end-of-walk seam is where 0.4.0 already resolved the roster to mint `Part` rows.

  The view computed this per query and could not give a point an identity; a row can. Expansion also covers downstream trees, which walk the same `buildCatalog`, so no SQL object has anything left to do — `bin/ddl.py` emits tables only, and `Interval.part` narrows to slug-or-`_`.

  Precedence survives the move: an expansion landing on a path an explicit part already holds yields to it, never doubles onto it. Authored twice is still a duplicate coordinate. Deferring the lowering puts every explicit part in hand before any default lowers, so the rule needs no second pass.

  Both measurand resolvers drop their `*` fallback — a default has already become the part's own row, so the lookup is exact. `buildDatabase`'s coordinate-uniqueness gate goes with the view: expanded rows ARE interval rows, so the node PK proves path uniqueness, and it throws where the view silently dropped. The catalog holds the same 228 points the view computed, now as 228 interval rows.

## 0.4.0

### Minor Changes

- da92b26: Give features a part ROSTER, and ship the `coordinate` view that expands `*` over it.

  `part_set` says which part slugs are legal; it never said which ones a feature has. Conflating those two facts invents parts. The `three-phase` vocabulary carries the line-to-line pairs because some meters measure them, so an inverter that meters three legs was picking up `ab`/`bc`/`ca` rows carrying a leg's current. The distinction existed only in a YAML comment.

  New `Part` class — one row per subdivision a feature actually has, at `<feature>/<slug>`, no columns of its own. A `part_set` feature must now name its parts (`a: {}` is enough — an empty block claims the subdivision without asserting a band); `count: n` mints `1…n` itself. The walk refuses a `*` over an empty roster, which would expand to nothing and lose the bands silently. `Interval.part` stays a discriminator string, so `_` and `*` still name no row.

  `coordinate` yields one row per addressable coordinate: `node` (the resolved path, no `*` survives), `interval` (FK to the row it came from), `part` (the one it resolved to). Non-`*` intervals pass through verbatim. One body, both dialects, no recursion — the roster is a table. An explicit part outranks the default: the view drops an expansion that lands on a real interval's path rather than doubling onto it.

  The view mints no name; it rewrites the part segment of a path the row already carried. `buildDatabase` gates on coordinate uniqueness alongside `foreign_key_check` — the view mints paths the PK never saw, so nothing else proved them distinct.

## 0.3.0

### Minor Changes

- 2352dcd: Ship the camelCase sibling schema. `gen/catalog.camel.schema.json` joins the tarball and `exports` as `./catalog.camel.schema.json` — snake_case stays the wire contract, TypeScript consumers check against the sibling. Projected by `@nodeve/schema-case`, which stamps `x-key-map` per renamed node, so an instance renames by the map rather than a runtime string transform. Class names under `$defs`, `$ref` targets, and every `enum`/`const` value stay put, so both siblings dispatch on the same names.
- 7d5d4fd: Model the site layer, so a deployment's own tree normalizes into rows beside the catalog's.

  New facets:

  - `Location` — a geodetic point. Columns, not intervals: a point has no band and no sensor.
  - `IpBinding`, plus `NetworkInterface.mac_address`.
  - `Endpoint` — one host and protocol version per node, never repeated on each binding.
  - `Filter` — the interval width facet stating WHAT the band claims over: a 1 s mean, not raw samples.
  - `Site`, `Authentication`, `PvString`.

  New node types `site`, `service-host` and `solar-array`, plus feature sockets and address rows on `site-catalog`. `Ingest` now names the surface it dials — `service_protocol` plus a NIC pin.

  Two normalizer fixes this is the first data to need. A `device` FK now takes its trail (`inverter/foxess-h3-ps10sh`), because a node whose class declares `path_root` roots at its kind, never at its table. And a `network_interface` reference resolves on any row-set, against the row's `device` when it names one — an adapter dials the metered node's interfaces, not its own.

  **Breaking for authors:** devices move to `data/subject_node/<node_type>/<slug>/` and drop their `node_type:` key. The path is the identity, so the kind is the directory; two kinds may then share one slug, which a site needs. Permalinks stay byte-identical.

### Patch Changes

- 3c42913: Fix the FoxESS H3 temperature model. The thermal ladder (continuous ⊂ intermittent ⊂ survival) sat on a separate `environment/ambient` feature while the sensor stayed on `environment/enclosure`. So the AC active-power derates gated on bands nothing reads: the box exposes no ambient probe, only its own internal temperature (`invtemp`, register 39141). Bands and sensor share one `enclosure` feature again, and the derate conditions point at it.

## 0.2.0

### Minor Changes

- 1bebae0: Publish the LinkML schema package: `buildCatalog(root)` walks an authored tree into catalog rows, `load()` builds a SQLite database from them with `foreign_key_check` as the gate, and the `nodeve-schema` bin drives both from a shell. Ships both DDL dialects, the JSON Schema shape gate, the catalog rows, and the TypeScript types. Replaces `@nodeve/grimoire`.

### Patch Changes

- Updated dependencies [5c575aa]
  - @nodeve/text@2.2.0
