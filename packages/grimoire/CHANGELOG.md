# @nodeve/grimoire

## 4.5.0

### Minor Changes

- Interval `filter` — required input conditioning, smoothing subset only.

  - New `filter` slot on the `intervals` archetype (feature `filter`, props `throttle_average_ms` / `exponential_moving_average_ms`, exactly one): the band is a claim about the CONDITIONED signal — a consumer must apply the filter before judging membership; publish-cadence filters (throttle/delta/hysteresis) are output policy and excluded by design.
  - Site-bake cadence gate: every interval filter constant on an adapter's metered device must be ≥ the adapter's fastest known cadence (tap `observed_interval_ms` / `ingest.update_interval_ms`) — a 200 ms mean over a 1 s cadence fails the bake. Catalog emit can't validate this (a device doesn't know its polling frequency), so the gate lives at the site level only; no cadence info ⇒ skipped. v1 is lenient: compares against the fastest window, register→window mapping unmodelled.

## 4.4.0

### Minor Changes

- 475456b: Site-authored feature_spec deltas + interval segment in the id grammar.

  - `bakeSite` now OVERLAYS site-authored keys onto the generated slug patch (shared `overlayPatch`, extracted to `src/overlay.ts`) instead of shallow-assigning — a site block naming a measurand feature (custom `intervals` bands, combined or per-leg) merges into that feature's patch; slugged interval arrays append by `identity.slug` at read time, so a site adds bands the datasheet doesn't carry (e.g. `grid_neutral` on `active_power`) without clobbering baked sensor slugs.
  - `sensorId` grammar grows a trailing `interval` segment (`… quantity_kind ⊕ interval`) — the id of a quantity's derived in-band boolean. New `intervalSensorId(sensorSlug, intervalSlug)` composes it from a baked `slug`/`slugQualified` so consumers never hand-spell the join.

## 4.3.0

### Minor Changes

- Interval identity + condition gate; grid_region knob unified.

  - Every emitted interval now carries `identity.slug` — authored, or de-sugared from its `rating` axis; slugs unique per `intervals` list (bake fails on duplicates).
  - New emit gate: `condition.interval_item` pointers must resolve (feature → property → interval slug) within the entry; `setting` gates must name a `settings_schema` key and an `enum` member.
  - dtsu666 + ps10sh `settings_schema` now takes one member-valued `grid_region` knob (`eu_230v_50hz` / `br_220v_60hz`), replacing the raw `grid_region: 220|230` and `grid_frequency: 50|60` numeric knobs (no known downstream use).

## 4.2.0

### Minor Changes

- fc02c33: `ingest` feature grows an optional `network_interface_id`: a polled-master site adapter can pin which of the metered device's `network_interfaces` it dials, overriding the dialed service's own `service_binding.network_interface_id`. A site fact (which NIC is reachable from the poller), so it lives on the adapter, not the catalog device.

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
