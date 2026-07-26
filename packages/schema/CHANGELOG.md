# @nodeve/schema

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
