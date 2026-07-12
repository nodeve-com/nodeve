# Concept layer model — property/enumeration → features → archetypes

Composed layers, authored in YAML, validated by json-schemas.

## Layers

### Property

`concepts/property/<category>/<slug>.yaml`

The identity layer: one property name per file — a SINGLE field name, nothing else. Where shape and field information lives. The `schema` field carries the JSON-schema (`type`/`minimum`/`maximum`/`pattern`...) for that one field. A property is typically a scalar, but a **reference / identity field whose value is a composite key** carries an object `schema` — still ONE field, a value the def points AT, not a grouping it owns (a foreign key: `catalog_item` is `{archetype, slug}`). The test is ownership, not shape: `{min,max}` is two independent fields the def OWNS, so it's a grouping — `features/range.yaml`, never a property. A property is a FIELD, never a feature; a feature is never a property. A property NEVER sits directly on an archetype — an archetype assembles features; a field reaches an archetype only inside a feature's `prop:` map. The `<category>` dir is filing only (a `_defaults.yaml` cascade) — not a named concept.

### Enumeration

`concepts/enumeration/<name>/<literal>.yaml`

A NAMED VALUE SET — one enumeration per directory, one literal member per file (the file stem IS the literal). A member is a single named value carrying its display `title` and standards crosswalk `refs`, nothing structural. `enums: [<name>]` (on a **feature** only — never directly on an archetype) resolves to this dir's member stems as an `enum:` of string literals; `parts: <name>` instance-keys a field by them. Each member satisfies the enumeration's archetype, declared in its `_defaults.yaml` (default `property`; a richer enumeration overrides it — `quantity_kind`/`registry`/`refrigerant`, whose members carry `si_unit`/`url`/etc.). A member may also back a field directly where an archetype composes it (a `quantity_kind` kind bound on a feature marked `is_specification: true`), so property and enumeration share one flat slug space. Each enumeration bakes to `generated/enumeration/<name>.json` (+ a `.ts` vocab module where a TS consumer needs the member-code union). Add missing registries here. Each `enums` value points to an `enumeration/<name>` directory whose members are the enum's literals.

### Feature

`concepts/features/<category?>/<slug>.yaml`

A feature is a GROUPING OF PROPS — never a prop itself. Its fields live in one `prop:` MAP — one entry `<name>: overlay` per field, the key a bare `property` slug. `<name>: {}` includes the property unchanged; the overlay refines it (`voc_eff: {}`, `slug: { schema: { required: true } }`). Overlays nest like any data — override a field's label with `azimuth: { title: { en: Azimuth } }`. Author the nested map directly. Each own `prop:` name is property-backed & globally unique.

The def-language grammar a feature (or archetype) carries lives under one `concept_settings:` block (`concepts/features/concept_settings.yaml`):

- `compose: slug | [slug…]` — REUSE the named sibling tables' columns. A single slug is a same-shape reuse under a new name (`ac_phase_three_eps` / `ac_phase_three_grid` are both AC connections); a list reuses several. Each target must be an object shape — a feature groups props, it never composes a scalar.
- `repeated: true` — countable instances: the body wraps as `{count, combined?, default?, instances?}`, instances joined by `ordinal`.
- `part: <slug>` — a fixed parts map (`parts/<slug>.yaml`): the body wraps as `{combined?, default?, part?}`. Exclusive with `repeated`.
- `array | map: true` — the feature's intrinsic cardinality (a LIST of its shape, or a slug-keyed RECORD; plural slug = array).

A `features:` list entry is a BARE SLUG and the field key IS that slug — use-site renames don't exist (they'd break the name→def lookup chain). On-bus name shortening is instead a feature's own `identity.slug` handle (a catalog fact, e.g. `ac_phase_three_point → ac`), read by the sensor-id bake.

A feature carries **no `feature:` map** — the `feature:` map is the archetype-level analog of a feature's `prop:` (nesting a whole feature as a named slot is archetype-only). A feature pulls a sibling feature's shape in ONLY through `concept_settings.compose`, which reuses its columns; it never nests one as a field. If a feature "needs" another feature's shape, it composes it or the field is modelled as a property.

### Archetype

The concept layer: anything cataloguable or instantiable. An archetype is a **class**. It carries the same `concept_settings:` grammar as a feature. It **assembles features and sibling classes ONLY** — a `feature:` map (nested features), an `archetype:` map (a sibling class nested as a named slot, e.g. a `modbus` connectivity medium), and `concept_settings.compose` of sibling archetypes (reuse their columns). Both maps take a `<slug>: overlay` entry where the key IS the slug (no rename); a `{ archetype: <slug> }` / `{ feature: <slug> }` overlay rebinds the slot's shape so the slot name may differ. An archetype **NEVER** carries a `prop:` map, a bare property key, or an `enums:` list: a property or an enum reaches an archetype only one layer down, inside a feature (a feature's `prop:` map, or a feature's own `enums:`). Need a field or enum on a class? Home it on a feature first, then compose/reference that feature. The only allowed top-level keys on an archetype are `identity` / `title` / `description` / `refs` / `concept_settings` / `feature:` / `archetype:`. Enforced by [`scripts/guard-archetype-features.ts`](../scripts/guard-archetype-features.ts).

> **The promotion trap.** A feature that carries `prop:` or `enums:` CANNOT be moved into `archetypes/` as-is — the instant you `git mv features/X.yaml archetypes/X.yaml`, that `prop:`/`enums:` becomes an illegal field-on-archetype (this is how `vedirect_medium`'s bare `prop: { pid }` and the `application_protocol` enum on the modbus/usbhid/vedirect media slipped in). Before ANY feature→archetype promotion, grep the file for `prop:`, bare property keys, and `enums:` and re-home every one onto a composed feature FIRST.

### Catalog

An **instance** of an archetype — see "features are flat" above.

### Site

External tenant/user. Assembly of defined features and catalog instances.

## Example file

```
title: { en, pt },
description: { en, pt },
identity: {archetype, slug, code?, symbol?, broader?, url?, iri_template?},  # archetype/id = filing selector, stripped from emit; the rest is data
features: [{feature, variant?, ordinal?, part_id?}],
refs: [{ registry, term, match: (exact|close) }]
```

## Mechanics

- `concept_settings.compose` reuses a **same-layer** sibling's columns — an archetype composes archetypes, a feature composes features; it NEVER reaches down a layer. A feature reaches an archetype via the `feature:` map, not `compose` (enforced in `kit/compile.ts` `resolveSiblingBySlug`).
- Cascade file `_defaults.yaml` applies to directory siblings and children.
- `.ts` files do not belong in the concepts dir.
- **Emit is DATA FIRST.** `kit/compile.ts` resolves a full data tree per concept (`generated/<layer>/<slug>.json`, mirroring `concepts/` flat — no `generated/concepts/` wrapper); the draft-07 schema is a _projection_ of that tree. Generated JSON is **snake_case always** — camelCase exists only inside TS emits (the `humps` edge). The emit gate validates every property/feature/catalog doc against its archetype before writing.
- **`identity.code`** is the 8-char Crockford short-code, minted ONCE at entry creation and AUTHORED in the leaf YAML — the generator requires it and suggests `shortCode(slug)` when missing but NEVER derives it, so it survives re-filing / slug renames. `identity.id` stays reserved for the future database uuid. Cross-tree catalog references are `catalog_item: {archetype, slug}` — never tree paths.

Possible generated id/path builders, from one ordered segment list — `[catalog_slug, instance, feature, variant, ordinal|part_id, prop]`:

- id — `join(segments.filter(Boolean), '_')`
- path — the same segments as a `/`-joined tree under `{tags[0]}/{archetype}/…`, the leaf `{prop}` carrying `{schema|range_prop|state?} = value`.

## Gotchas

- Carry the TS crosswalk/rationale comments into either the top-of-file # comment or description, not lost.
- Do not worry about importers
- If you see an empty stub file, fill it in if possible. Check related files are actually filled
