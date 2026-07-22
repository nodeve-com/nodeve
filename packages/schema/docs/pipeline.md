# Pipeline

- prettier-like yaml formatting

## format

Style authority for authored yaml (prettier ignores the tree). Comment-preserving; mutates authored source — the only stage that does. `--check` is the read-only twin: exit 1 on drift, what precommit runs.

Schema files (`linkml/*.yaml`) get three passes: sort enums alpha (`permissible_values` stay authored — order is semantic), sort slots scalar-valued-then-object-valued alpha within each group, and inject the mechanical `camel:` annotation on snake_case slot names. Data files get the band-sugar desugar: `fraction_lower`/`fraction_upper` in a `valued_range` payload rewrite to `margin_lower`/`margin_upper` ([features.yaml](../linkml/features.yaml)), so the normalizer only sees canonical band columns. Both get the deterministic flow/block restyle: a collection is inline flow only if its one-line render fits the width budget and holds no block child or comment; bottom-up, so a block child forces its parent block.

## normalize

THE trail walk ([authoring-storage.md](authoring-storage.md)): nested authored docs → flat source-tagged rows → `gen/catalog.json`, the one root object everything downstream ingests. Structural errors (bad slug, part outside its set, duplicate coordinate) die here with the key trail as context.

## data2schema

The stage that crosses categories: data in, schema out. LinkML cannot express "the admissible set is whatever rows exist," so binding **rows** project into validation **syntax**: `quantity_bindings` → the admissible quantity set per feature type, `socket_bindings` → the role vocabulary per socket. Output is `gen/nodeve-projected.yaml`, the **projected schema** — generated LinkML classes (`Inverter`, `AcPhaseInterval`) layered over the hand-written schema; `pnpm validate` checks device models against it. Data is the source; adding a device type is an INSERT, then the projection follows. Never hand-edited.

## validate / build

`linkml-validate` checks the catalog against the schema (shape only — cross-row rules are owned checks). `ddl.py` emits DDL and loads the db; a failed FK there is the last gate.

## Out of band

**check-refs** (`check-refs.ts`) — do registry `iri_template`s resolve? One live request per registry. Network-dependent, so never in the gate or the pipeline; run when registry rows change.

## Not a stage

`*:` auto-quoting — superseded by design: `*` is authored quoted, and an alias node where a key belongs is a normalization error ([authoring-storage.md](authoring-storage.md#_-and--as-keys)).

## Script names vs stages

`pnpm generate` runs format → normalize → data2schema, matching stage order. The name "generate" names no stage — known slop, not doctrine.
