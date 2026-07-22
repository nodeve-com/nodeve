# Pipeline

## generate

`pnpm generate` = format → normalize → data2schema. (No stage named "generate.")

### format

Style authority for authored yaml (prettier ignores the tree). Comment-preserving; only stage that mutates source. `--check` twin precommit runs: exit 1 on drift.

- **style** — inline flow only if one-line render fits width and holds no block child/comment; bottom-up, so a block child forces its parent block.
- **data fixes** — pre-parse: bare `*` (empty-anchor alias, a loader error) quoted to literal in key/value/seq (`quoteBareStars`); `*name` left be. Post-parse: `valued_range` band sugar `fraction_lower`/`upper` → `margin_lower`/`upper`.
- **schema sorts** (`linkml/*.yaml`) — enums alpha (`permissible_values` stay authored — semantic order), slots scalar-then-object alpha, `camel:` on snake_case slots.

### normalize

THE trail walk ([authoring-storage.md](authoring-storage.md)): nested docs → flat source-tagged rows → `gen/catalog.json`, the root object downstream ingests. Structural errors (bad slug, part outside its set, duplicate coordinate) die here with the key trail.

### data2schema

Data in, schema out. LinkML can't say "the valid set is whatever rows exist," so binding **rows** project into validation **syntax**: `quantity_bindings` → quantity set per feature type, `socket_bindings` → role vocabulary per socket. Output `gen/nodeve-projected.yaml`, the **projected schema**: generated classes (`Inverter`, `AcPhaseInterval`) over the hand-written one, checked by `pnpm validate`. Adding a device type is an INSERT; never hand-edited.

## `validate` / build

`linkml-validate` checks catalog against schema (shape only; owned checks cover cross-row rules). `ddl.py` emits DDL and loads the db; a failed FK there is the last gate.

## check-refs (out of band)

`check-refs.ts` — do registry `iri_template`s resolve? One live request per registry. Network-dependent, never in the gate; run when registry rows change.
