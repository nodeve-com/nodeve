# Authoring → normalization — next-thread handoff

## Direction

One LinkML schema. It describes the normalized rows. Authored YAML is a nested front-end that the normalizer flattens into those rows:

```text
authored YAML
  → normalize/catalog.ts (trail walk, source-tagged rows)
  → normalized catalog JSON
  → LinkML validation
  → SQL/database
```

No authoring schema. The nested form is maps keyed by slugs and markers, with key vocabularies that depend on data (`part_set` members, quantity kinds, `count`) — validation LinkML cannot express and the normalizer must do anyway. Leaf payloads (`ValuedRange`, `Measurement`, …) are the same classes the storage rows use; a second schema would duplicate them to catch nothing extra.

Structural errors are intrinsic to the trail walk — a bad slug, a part outside its set, a duplicate coordinate stop the walk with the key trail as source context:

```text
feature.ac-phase.out.l3: not in part_set split-phase
```

Every emitted row carries its source trail, so post-normalization LinkML failures (wrong type, missing column) map back to the authored location too.

Authoring directly to the database stays open: the normalized form is the only contract, and the nested YAML is one front-end that produces it.

## Authored form

Human-facing nested device description:

- no `node` values
- explicit identity axes
- facets inline on their interval
- structured references, never authored node paths

**Nesting is the identity.** Each level is a map keyed by that level's slug, in level order — the authored document has the same shape as the node path, so no authored row repeats a coordinate its position already states. The filename is the root slug, the same rule one level up.

Three key forms, three meanings:

| form              | is                                              |
| ----------------- | ----------------------------------------------- |
| a slug key        | descend a level — a new row, a new path segment |
| `$`               | this row's own columns, no segment              |
| a named facet key | a co-row sharing this row's node, no segment    |

```yaml
# foxess-h3-ps10sh.yaml — the filename is the slug
device_type: inverter

# every block key is a sql_table name; the nested key levels are the class's
# keyed_by slots, in order (feature_of_interest: feature_type, role)
feature_of_interest:
  ac-phase:
    out:
      $: { part_set: split-phase }
      _:
        frequency:
          _:
            measurement: { resolution: 0.01 }
            valued_range: { min: 45, max: 65 }
        active-power:
          continuous:
            valued_range: { min: -11000, max: 10000 }
            specification:
              rating: continuous
              gated_by:
                feature: { type: environment, role: ambient }
                quantity: temperature
                interval: continuous
      '*':
        voltage:
          _:
            valued_range: { min: 0, max: 250 }
            measurement: { resolution: 0.1 }
      l1: {}
      l2: {}
```

The normalizer derives only redundant representations — complete paths and FKs. It reads coordinates off the key trail; it never infers one from payload shape.

### `$` — the level's own columns

A level's row needs scalar columns of its own — which part set a feature uses, a model's product and register map. Nesting has no room for them: every key is a coordinate, so a bare `part_set:` would read as a part slugged `part-set`. Any such word matches the slug pattern, so reserving it would be a lint, not a guarantee.

`$` cannot be a slug, so one reserved key per level costs one token and never collides. Everything under it is columns on the current row; everything beside it descends.

Facets stay named keys, not `$` entries — `Specification`, `Measurement`, and `ValuedRange` are rows sharing the interval's node, not columns on it. They only appear where a level has no children, so they compete with no slug.

### How a feature subdivides

Two kinds of subdivision, two columns, one per feature at most:

| column     | means                                  | part keys must be |
| ---------- | -------------------------------------- | ----------------- |
| `part_set` | a named closed set on the feature type | its members       |
| `count`    | a cardinality — n of the same thing    | `1`…`n`           |

```yaml
$: { part_set: split-phase } # keys must be l1, l2
$: { count: 3 } # keys must be 1, 2, 3
```

Phases are a vocabulary: `split-phase` is `l1, l2`, `three-phase` is `a, b, c`, and no model invents a fourth leg. Trackers are a number: three today, four next model, and nothing is violated. Naming both makes the normalizer read a key rather than sniff a value's type.

Neither is set when a feature has no parts — every interval is then `_`.

Authored part keys are **validated**, never generated — a model names its parts, and the set or count rejects a mistyped or invented one. `ordinal` still comes from authored order.

`part_set` members live on `FeatureType` as binding rows beside `QuantityBinding`, and project into the validation overlay the same way. `count` needs no vocabulary.

### `_` and `*` as keys

`_` is the reserved key at two levels, and `*` is a third part form. The slug pattern `^[a-z0-9]+(-[a-z0-9]+)*$` produces neither, so no authored key collides with them.

| position | means |
| --- | --- |
| part `_` | the quantity attaches to the feature itself ([levels.md](levels.md#_--the-segment-that-asserts-nothing)) |
| part `*` | the default — applies to each part that doesn't state its own |
| interval slug `_` | this quantity carries one unnamed interval |

**Keys are strings; the loader must not decide that.** Three key forms are not what a YAML loader returns for them:

| authored key | loader gives | needs |
| --- | --- | --- |
| `*` | alias node with an empty anchor — a parse error | quote it: `"*":` |
| `$` | plain string — safe unquoted | nothing |
| `1`, `2`, `3` — legal part slugs | integer | stringify at the trail boundary |
| `on`, `off`, `y`, `n` — legal roles and slugs | boolean under YAML 1.1 loaders | stringify at the trail boundary |

The normalizer stringifies every trail key as it reads it and validates against the slug pattern plus the two markers, rather than trusting the loader's scalar typing. Only `*` then needs authored quoting, and an alias node where a key belongs is a normalization error with source context.

Storage keeps both segments — `Interval.slug` is non-null and full path arity is preserved, so position is never ambiguous and the PK still catches collisions. `_` elides only when rendering an address for a reader:

```text
stored     node:dehumidifier/generic/ac-phase/switch/0/power/_
rendered   dehumidifier/generic/ac-phase/switch/0/power
```

A second interval on the same `(feature, part, quantity)` forces both to be named — `_` never silently promotes to a band, and no interval carries an invented discriminator like `range`, which is a claim about content rather than identity.

## Normalized rows

Machine-facing, what the schema describes:

- explicit node PKs and FKs
- one table-oriented class per stored row
- suitable for LinkML SQL generation
- generated device-model rows; never hand-authored

The catalog is **JSON**, one giant file.

`Specification`, `Measurement`, and `ValuedRange` are width facets of `Interval`. All use exactly the interval node. They add no identity segment.

## Identity

Canonical interval trail:

```text
node:<device-type>/<model>/<feature-type>/<feature-role>/<part|_>/<quantity-kind>/<interval-slug>
```

Example:

```text
node:inverter/foxess-h3-ps10sh/ac-phase/out/a/voltage/_
```

Ordered levels:

```text
device type → model → feature type → feature → part? → interval
                                                        ├─ specification facet
                                                        ├─ measurement facet
                                                        └─ valued range facet
```

One typed path constructor must own this grammar. No generic recursive slug/role traversal. No string replacement as reference resolution.

## Normalizer responsibilities

Only:

1. Build canonical coordinates and node paths.
2. Assign part `ordinal` from authored order.
3. Expand inline facets into normalized rows sharing the interval node.
4. Lift `$` entries onto their level's row.
5. Resolve structured references against normalized coordinates.
6. Reject duplicate coordinates, unresolved references, and part keys outside their set.
7. Tag every emitted row with its source trail for downstream error mapping.

It must not infer domain meaning from payload shape.

## Schema layout

The schema must scale to hundreds of kinds of modeled things. Device models are the first case, not the organizing boundary for the whole schema. Establish a uniform module pattern here that later kinds can follow without copying schema structure or normalizer plumbing.

Do not assume one LinkML file. Split into composable modules as domains grow; expose one aggregate entrypoint for validation and generation.

Conceptual layout, not a prescribed final file list:

```text
packages/schema/
  linkml/
    shared/           # reusable types, slots, enums
    ... domain modules
    schema.yaml       # aggregate entrypoint
  data/
    ... authored source documents by kind
  gen/
    ... normalized catalogs and generated artifacts
  normalize/
    ... shared normalizer framework and kind-specific lowering
```

Exact modules should emerge from repeated structure, not speculative taxonomy.

## What the normalizer is

**Destructure a nested, author-friendly set of documents into one catalog ready for further processing.** Devices are the first input kind.

Every stage is kind-agnostic: read a key trail, validate a key against its level's vocabulary, emit a row. Kind-specific knowledge lives in the schema, never in normalizer branches.

The reference input is [`grimoire/concepts/catalog/fox-ess/h3/ps10sh.yaml`](../../grimoire/concepts/catalog/fox-ess/h3/ps10sh.yaml) — register map and prose included. `data/device_model/foxess-h3-ps10sh.yaml` is a fixture derived from it, not the source. Port what it inherits from grimoire's `_defaults.yaml` explicitly; the cascade does not come along, `Manufacturer` replaces it.

Build order:

1. Generic trail walk: descend on slug keys, lift `$`, expand facets, assign `ordinal`.
2. Validate keys against level vocabularies (`part_set`, `count`, quantity kinds).
3. Resolve structured references against normalized coordinates.
4. Emit the catalog; validate against the schema; build the database.

Registry, quantity-kind, feature-type, and device-type files are already table-like — they enter the catalog as rows, and the trail walk handles them as a one-level case rather than a special one.

## Acceptance

- No authored document contains a `node` key.
- No normalizer stage names a kind; adding a kind adds schema, not branches.
- Every coordinate comes from a map key; no authored value repeats its position.
- Every interval slug is a key, `_` included; none is inferred from payload.
- Changing feature type changes generated descendant paths predictably.
- Every interval facet node equals its interval node.
- A part key outside its feature's `part_set` or `count` fails normalization with source context.
- Dangling structured references fail normalization with source context.
- Duplicate coordinates fail before schema validation.
- A schema validation failure on an emitted row reports the row's source trail.
- Generated catalog passes LinkML validation.
- Generated database builds.
- Compiler output is deterministic and snapshot-tested.
