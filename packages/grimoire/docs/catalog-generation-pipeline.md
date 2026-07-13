# Catalog generation pipeline (`bun run grimoire-generate`)

How a `concepts/catalog/<brand>/…yaml` becomes `artifacts/catalog/<slug>.json` + `src/generated/catalog/<slug>.ts`. Entry point `kit/generate.ts`.

## Flow (`generate.ts`)

- `outputs()` (the emit map `{path→contents}`) → `assertLeafDocsValid()` + `assertFeatureDocsValid()` + `catalogEntries()`, then writes one `artifacts/catalog/<slug>.json` (+ `.ts` twin under `src/generated/catalog/`) per entry (**no committed all-in-one** — the gateway assembles the bundle).
- `catalogEntries()` — walks `loadCascade(CATALOG_DIR)`, validates each cascade-merged leaf against its archetype schema (`assertDocValid` = Ajv over `projectSchema(resolveConcept(archetype))`, the emit gate), enforces slug + `identity.code` uniqueness, then per entry: `{ ...aliases, ...resolveRepeatedFeatures(leaf.data), identity: {archetype, slug, code} }`.
- `import.meta.filename === process.argv[1]` block does the `writeFileSync`. `tests/generate.test.ts` asserts committed mirrors match (drift test).

## Feature resolution (`kit/repeated-emit.ts`)

`resolveRepeatedFeatures(data)` turns authoring-only `default`/`combined`/`instances` into the emitted tree. `default` is authoring-only — **never** leaves the package; the emit prints full paths:

- **part feature** (`concept_settings.part: <parts-slug>`) → `{ combined?, part: { <name>: default[kind] ⊕ override } }`, one node per named part (`parts/<slug>.yaml` maps kind→names, e.g. `ac_phase:[a,b,c]`, `ac_line:[ab,bc,ca]`).
- **counted feature** (`concept_settings.repeated: true`) → `{ count, combined?, instances: [default ⊕ {ordinal} override] }`, dense by ordinal.
- **single feature** → body (spec-map) passes through; quantities sit directly under the feature.

`featureNature(slug)` reads the nature from `concept_settings.part`/`.repeated` (NOT top-level — the grammar moved under `concept_settings`; reading top-level silently no-ops all resolution). `overlaySpec`/`overlayRows` merge instance/part overrides row-level for `intervals`/`measurements` (keyed `bandKey`/`measurementKey`).

## The measurand link → measurement (register↔measurement)

A `modbus_medium.modbus_registers[]` row (feature `modbus_register`, composes `measurand_link` + `numeric_decode`) either:

- **LINKED**: `feature_id` + `quantity_kind` (+ `part_id` | `ordinal`; both absent ⇒ the `combined` whole) — reads one quantity of the feature tree. Its target spec_block lives at `entry[feature_id]` → part/instance/combined node → `[quantity_kind]`, whose `measurements: []` array is the SENSOR channels (`spec_map → spec_block → measurements[]`, each a `measurement` = `{min,max,resolution?,unit?,channel?,kind?}`).
- **RAW**: `raw_name` only, no link — deliberately unattributed.
- **category**: `feature_id` + `state`/`fault` (enum-valued), no `quantity_kind` — not a measurement.

`backfillRegisterMeasurements(entry)` (kit/repeated-emit.ts, called in `catalogEntries` after `resolveRepeatedFeatures`): for every LINKED register, ensure its target spec_block exists and carries a `measurements` array (empty `[]` is a valid placeholder). RAW + category rows skipped; unresolvable `feature_id` left alone (a separate link-validation concern). Node selection uses `featureNature` so part/counted/single each land on the right node.

## Real catalog entries with registers

`concepts/catalog/chint/dtsu666.yaml` (part feature `ac_phase_three_point`), `concepts/catalog/fox-ess/h3/ps10sh.yaml` (counted `pv_tracker`, part `ac_phase_three_grid`, single `ac_phase_three_load`/`enclosure`).
