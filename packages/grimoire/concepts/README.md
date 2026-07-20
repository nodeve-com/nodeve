# Concept layer model — property/enumeration → features → archetypes

Composed layers, authored in YAML, validated by json-schemas.

## Layers

### Property

`concepts/property/<category>/<slug>.yaml`

The identity layer: one property name per file — a SINGLE field name, nothing else. Where shape and field information lives. The `schema` field carries the JSON-schema (`type`/`minimum`/`maximum`/`pattern`...) for that one field. A property is typically a scalar, but a **reference / identity field whose value is a composite key** carries an object `schema` — still ONE field, a value the def points AT, not a grouping it owns (a foreign key: `catalog_item` is `{archetype, slug}`). The test is ownership, not shape: `{min,max}` is two independent fields the def OWNS, so it's a grouping — `features/range.yaml`, never a property. A property is a FIELD, never a feature; a feature is never a property. A property NEVER sits directly on an archetype — an archetype assembles features; a field reaches an archetype only inside a feature's `feature_settings.prop` map. The `<category>` dir is filing only (a `_defaults.yaml` cascade) — not a named concept.

### Enumeration

`concepts/enumeration/<name>/<literal>.yaml`

A NAMED VALUE SET — one enumeration per directory, one literal member per file (the file stem IS the literal). A member is a single named value carrying its display `title` and standards crosswalk `refs`, nothing structural. `feature_settings.enums: [<name>]` (on a **feature** only — an archetype cannot declare that block) resolves to this dir's member stems as an `enum:` of string literals; `parts: <name>` instance-keys a field by them. Each member satisfies the enumeration's archetype, declared in its `_defaults.yaml` (default `property`; a richer enumeration overrides it — `quantity_kind`/`registry`/`refrigerant`, whose members carry `si_unit`/`url`/etc.). A member may also back a field directly where an archetype composes it (a `quantity_kind` kind bound on a feature marked `is_specification: true`), so property and enumeration share one flat slug space. Each enumeration bakes to `artifacts/enumeration/<name>.json` (+ a `.ts` vocab module where a TS consumer needs the member-code union). Add missing registries here. Each `enums` value points to an `enumeration/<name>` directory whose members are the enum's literals.

### Feature

`concepts/features/<category?>/<slug>.yaml`

A feature is a GROUPING OF PROPS — never a prop itself. Its fields live in one `feature_settings.prop:` MAP — one entry `<name>: overlay` per field, the key a bare `property` slug. `<name>: {}` includes the property unchanged; the overlay refines it (`voc_eff: {}`, `slug: { schema: { required: true } }`). Overlays nest like any data — override a field's label with `azimuth: { title: { en: Azimuth } }`. Author the nested map directly. Each own `prop:` name is property-backed & globally unique.

The def language lives entirely in `*_settings:` BLOCKS, never at the document root — the suffix is the rule. Each block is declared by the meta-def that ALLOWS it, so layer-locality holds by construction: the emit gate strips nothing and a key its meta-def doesn't declare is rejected. (A root verb no meta-def could declare had to be stripped instead, and a stripped key is an unvalidated key — that gap is what a hand-authored allow-list used to paper over.)

- `concept_settings:` — SHARED, legal on a feature and an archetype alike (`concepts/features/concept_settings.yaml`)
- `feature_settings:` — FEATURE-ONLY: `prop` (the fields it groups) + `enums` (the value sets it binds) — `concepts/features/feature_settings.yaml`
- `archetype_settings:` — ARCHETYPE-ONLY: `feature_slots` + `archetype_slots` — `concepts/features/archetype_settings.yaml`

The shared block carries:

- `compose: slug | [slug…]` — LITERAL overlay: the named siblings' whole resolved defs (columns + node data — title/description/refs/ui) merge in under this def; the outer def wins, later-listed targets win over earlier. A single slug is a same-shape reuse under a new name (`ac_phase_three_eps` / `ac_phase_three_grid` are both AC connections); a list overlays several. Each target must be an object shape — a feature groups props, it never composes a scalar.
- `repeated: true` — countable instances: the body wraps as `{count, combined?, default?, instances?}`, instances joined by `ordinal`.
- `part: <slug>` — a fixed parts map (`parts/<slug>.yaml`): the body wraps as `{combined?, default?, part?}`. Exclusive with `repeated`.
- `array | map: true` — the feature's intrinsic cardinality (a LIST of its shape, or a slug-keyed RECORD; plural slug = array).

A `features:` list entry is a BARE SLUG and the field key IS that slug — use-site renames don't exist (they'd break the name→def lookup chain). On-bus name shortening is instead a feature's own `identity.slug` handle (a catalog fact, e.g. `ac_phase_three_point → ac`), read by the sensor-id bake.

A feature carries **no `archetype_settings:` block** — assembly (`feature_slots` / `archetype_slots`, the class-level analog of a feature's `prop:`) is archetype-only. A feature pulls a sibling feature's shape in ONLY through `concept_settings.compose`, which overlays its whole def; it never nests one as a field. If a feature "needs" another feature's shape, it composes it or the field is modelled as a property.

### Archetype

The concept layer: anything cataloguable or instantiable. An archetype is a **class**. It carries the shared `concept_settings:` grammar like a feature. It **assembles features and sibling classes ONLY** — `archetype_settings.feature_slots` (nested features), `archetype_settings.archetype_slots` (a sibling class nested as a named slot, e.g. a `modbus` connectivity medium), and `concept_settings.compose` of sibling archetypes (literal overlay of their whole defs). Both maps take a `<slug>: overlay` entry where the key IS the slug (no rename); a `{ archetype: <slug> }` / `{ feature: <slug> }` overlay rebinds the slot's shape so the slot name may differ. An archetype **NEVER** carries a `feature_settings:` block or a bare property key: a property or an enum reaches an archetype only one layer down, inside a feature. Need a field or enum on a class? Home it on a feature first, then compose/reference that feature. The allowed top-level keys are whatever [`archetypes/archetype.yaml`](archetypes/archetype.yaml) declares — the meta-def every archetype validates against (`kit/validate-docs.ts` `assertArchetypeDocsValid`), projected closed. Nothing is stripped before that check, so an undeclared key is a rejected key.

> **The promotion trap.** A feature that carries `feature_settings:` CANNOT be moved into `archetypes/` as-is — the instant you `git mv features/X.yaml archetypes/X.yaml`, its `prop`/`enums` become an illegal field-on-archetype (this is how `vedirect_medium`'s bare `prop: { pid }` and the `application_protocol` enum on the modbus/usbhid/vedirect media slipped in). Re-home them onto a composed feature FIRST. This one no longer needs a grep: `archetype.yaml` does not declare `feature_settings`, so a promoted def carrying it fails the emit gate.

### Catalog

An **instance** of an archetype — see "features are flat" above.

### Site

External tenant/user. Assembly of defined features and catalog instances.

## Example file

```
title: { en, pt },
description: { en, pt },
identity: {archetype_id, slug, code?, symbol?, broader?, url?, iri_template?},  # DE-SUGARED: archetype_id (the layer/cascade class) + slug (file-stem default) required on every doc, stamped into the emit; `id` = filing selector, stripped; the rest is data
refs: [{ registry, term, match: (exact|close) }],
concept_settings:   { compose?, repeated?, part?, is_array?, map?, count?, is_specification? },
feature_settings:   { prop?: {<property_slug>: overlay}, enums?: [<enumeration>] },   # features/ only
archetype_settings: { feature_slots?: {<feature_slug>: overlay},                      # archetypes/ only
                      archetype_slots?: {<archetype_slug>: overlay} }
```

## Mechanics

- `concept_settings.compose` overlays a **same-layer** sibling's whole def — an archetype composes archetypes, a feature composes features; it NEVER reaches down a layer. An archetype reaches a feature via `archetype_settings.feature_slots`, not `compose` (enforced in `kit/compile.ts` `resolveSiblingBySlug`).
- Cascade file `_defaults.yaml` applies to directory siblings and children.
- `.ts` files do not belong in the concepts dir.
- **Emit is DATA FIRST.** `kit/compile.ts` resolves a full data tree per concept (`artifacts/<layer>/<slug>.json` + `src/generated/<layer>/<slug>.ts`, mirroring `concepts/` flat); the draft-07 schema is a _projection_ of that tree. Generated JSON is **snake_case always**; TS emits are **camelCase always** — the rename is a stored per-prop alias in the data tree, applied at the parse edge before validation ([casing rule](../docs/typebox-vs-zod.md)). The emit gate validates every property/feature/catalog doc against its archetype before writing.
- **`identity.code`** is the 8-char Crockford short-code, minted ONCE at entry creation and AUTHORED in the leaf YAML — the generator requires it and suggests `shortCode(slug)` when missing but NEVER derives it, so it survives re-filing / slug renames. `identity.id` stays reserved for the future database uuid. Cross-tree catalog references are `catalog_item: {archetype_id, slug}` — never tree paths.

Possible generated id/path builders, from one ordered segment list — `[catalog_slug, instance, feature, variant, ordinal|part_id, prop]`:

- id — `join(segments.filter(Boolean), '_')`
- path — the same segments as a `/`-joined tree under `{tags[0]}/{archetype}/…`, the leaf `{prop}` carrying `{schema|range_prop|state?} = value`.

## Gotchas

- Carry the TS crosswalk/rationale comments into either the top-of-file # comment or description, not lost.
- Do not worry about importers
- If you see an empty stub file, fill it in if possible. Check related files are actually filled
