# @nodeve/grimoire

## 4.1.0

### Minor Changes

- 62b3d26: `ingest.service_id`: new optional pointer naming which of the ingested device's offered `services` a polled-master adapter dials (slug into that device's own `services`, mirroring `network_interface_id`). Unblocks `platform: telegraf` site adapters, whose bundles carried `service_id` from before the schema gate.

### Patch Changes

- 80a57e1: Declare `ajv` as a runtime dependency — `dist/ajv.js` imports it, but it was only a devDependency, so consumers resolved whatever ajv their tree hoisted (e.g. eslint's ajv@6, which has no named `Ajv` export).
- 968b7be: Ship the baked catalog JSON grain (`artifacts/catalog/<slug>.json`) in the npm package, and run the generate step in `build` so publishes always carry fresh artifacts. Non-JS consumers (the Rust farana gateway's build.rs) read the register maps from the installed package instead of a GitHub-release download.
- 25e09b0: Fix the site-bake/site-view measurand path for the camel generated grain: `isMeasurandFeature`/`quantityCols` walk `featureSpec` and camel column keys (cells still carry the snake wire codes for ids/coordinates), baked patches mirror the camel device tree (`featureSpec`, `slugQualified`), and the authored snake site overlay is key-camelized before merging onto the device. The camel TS-catalog cutover had left `bakeSite` silently minting empty patches.

## 4.0.3

### Patch Changes

- Archetype meta-def gate; rename identity.archetype_id.

## 4.0.2

### Patch Changes

- ffe694e: Per-concept modules reachable via layer subpath exports (`@nodeve/grimoire/archetypes/inverter`, `…/enumeration/rating`, `…/catalog/<slug>`); each concept module IS the def node — authored fields + `schema` + parsed type as named exports (`import { title, schema, type Inverter }`), no default/`<Name>Schema`/`<Name>Data`. New layer aggregates `@nodeve/grimoire/archetypes|features|property` map camel slug → def node (`Object.keys` lists the layer, `archetype.inverter.schema` validates). Fixes the broken 4.0 surface: root index drops the hand-picked `SiteLocation`/`AmbientTank`/`SolarArray`/`SolarString` types and `parseLocation`/`parseAmbientTank`/`parseSolarArray` — use `ConceptTypes['…']` + `parseConcept('…', data)` or the concept's own module. Property `index` renamed `field_index` (usbhid params wire key).

## 4.0.1

### Patch Changes

- `ac_phase_three` is now the canonical parted three-phase shape; `_eps`/`_grid`/`_point`/`_load` reuse it via single-slug `compose:` instead of each restating the parts map. Single-slug compose of a shape-less def now reuses the sibling's whole resolved node (folding to a `$ref` spread of its `Data`), and `featureNature`/`featureCombined` follow the compose chain so catalog part-expansion is unaffected. Generated schema and resolved data are behaviorally identical.

## 4.0.0

### Major Changes

- 561a830: Collapse quantity_kind onto the shared `makeVocab` surface. Removes the bespoke `quantityKinds`, `quantityKind()`, `quantityKindCrosswalk()`, and `QuantityKind` exports — use `QUANTITY_KIND` (`.dict`, `.codes`, `.crosswalk`) like `ACCUMULATION`.
- 561a830: New package `@nodeve/schema-case`: casing projections of a snake_case JSON Schema — `camelizeSchema` (camel sibling schema, `x-key-map` stored alias stamped per object node), `camelizeInstance` (mapping-driven data rename, declared props only), `snakePath` (camel error paths back to snake sources).

  grimoire regenerates through it: generated TypeBox schemas are now camelCase wall-to-wall (authored draft-07 cross-field rules included), with `<slug>.camel.schema.json` artifacts emitted beside the snake wire schemas. The parse edge renames BEFORE validation via the stored alias — data-bearing keys (slugs, locale tags) no longer camelize. Breaking: `conceptSchemas` → `conceptSchema` (now camel-keyed schemas); `validateAndCamelize` deleted (use `parseConcept` / `parseSnake`); exported `Display*Schema` values are camel; `validateSite` error paths stay snake.

### Patch Changes

- Updated dependencies [561a830]
  - @nodeve/schema-case@1.0.0
