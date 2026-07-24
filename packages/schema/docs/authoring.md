# Authoring

One LinkML schema describes the normalized rows. Authored YAML is a nested front-end the normalizer flattens into them:

```text
authored YAML
  → normalize/catalog.ts (trail walk, source-tagged rows)
  → gen/catalog.json
  → LinkML validation
  → SQL/database
```

No second authoring schema. The nested form is maps keyed by slugs and markers. Its key vocabularies depend on data (`part_set` members, quantity kinds, `count`) — LinkML cannot express them, the normalizer must check them anyway. Leaf payloads (`ValuedRange`, `Measurement`, …) are the same classes the storage rows use; a second schema would duplicate them to catch nothing extra.

Structural errors are intrinsic to the walk — a bad slug, a part outside its set, a duplicate coordinate stop it with the key trail as source context:

```text
feature.ac-phase.out.l3: not in part_set split-phase
```

Every emitted row carries its source trail, so a post-normalization LinkML failure (wrong type, missing column) maps back to the authored location too. Authoring straight to the database stays open: the normalized form is the only contract, the nested YAML one front-end that produces it.

## Authored form

Human-facing nested device description: no `node` values, explicit identity axes, facets inline on their interval, structured references never authored node paths.

**Nesting is the identity.** Each level is a map keyed by that level's slug, in level order (the [path](levels.md#the-path-is-the-identity) shape), so no authored row repeats a coordinate its position already states. The filename is the root slug.

| key form          | is                                              |
| ----------------- | ----------------------------------------------- |
| a slug key        | descend a level — a new row, a new path segment |
| `$`               | this row's own columns, no segment              |
| a named facet key | a co-row sharing this row's node, no segment    |

```yaml
# foxess-h3-ps10sh.yaml — the filename is the slug
node_type: inverter

# every block key is a sql_table name; nested key levels are the class's
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
              conditions: # list — every gate must hold (AND); one Condition row each
                - feature: { type: environment, role: ambient }
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

The normalizer derives only redundant representations — complete paths and FKs — off the key trail; it never infers a coordinate from payload shape.

### `$` — the level's own columns

A level's row needs scalar columns of its own (which part set a feature uses, a model's product and register map). Nesting has no room: every key is a coordinate, so a bare `part_set:` would read as a part slugged `part-set`. Any such word matches the slug pattern — reserving it would be a lint, not a guarantee. `$` cannot be a slug, so one reserved key per level costs one token and never collides. Everything under it becomes columns on the current row; everything beside it descends.

Facets stay named keys, not `$` entries — `Specification`, `Measurement`, `ValuedRange` are rows sharing the interval's node, not columns on it. They appear only where a level has no children, so they compete with no slug.

### How a feature subdivides

A feature carries at most one subdivision marker in `$` — `part_set` or `count`; [parts.md](parts.md) owns the distinction and storage.

```yaml
$: { part_set: split-phase } # keys must be l1, l2
$: { count: 3 } # keys must be 1, 2, 3
```

The marker **validates** authored part keys, never generates them — a model names its parts, so it rejects a mistyped or invented one. Neither appears when a feature has no parts — every interval is then `_`.

### `_` and `*` as keys

`_` and `*` stay reserved keys, disjoint from the slug grammar ([parts.md](parts.md#markers-collide-with-nothing) owns why). **Keys are strings; the loader must not decide that** — three key forms are not what a YAML loader returns:

| authored key | loader gives | needs |
| --- | --- | --- |
| `*` | alias node with an empty anchor — a parse error | quote it: `"*":` |
| `$` | plain string — safe unquoted | nothing |
| `1`, `2`, `3` — legal part slugs | integer | stringify at the trail boundary |
| `on`, `off`, `y`, `n` — legal roles and slugs | boolean under YAML 1.1 loaders | stringify at the trail boundary |

The normalizer stringifies every trail key as it reads it and validates against the slug pattern plus the two markers, rather than trusting the loader's scalar typing. Format's pre-parse `quoteBareStars` quotes a bare `*` for the author ([pipeline.md](pipeline.md#format)), so the loader never errors on it. An alias node where a key belongs raises a normalization error with source context.

## Normalized rows

Machine-facing, what the schema describes: explicit node PKs and FKs, one table-oriented class per stored row, suitable for LinkML SQL generation, generated subject-node rows (never hand-authored). The catalog is **JSON**, one file.

One typed path constructor owns the [trail grammar](levels.md#the-path-is-the-identity) — no generic recursive slug/role traversal, no string replacement as reference resolution.

## The normalizer

**Destructure nested, author-friendly documents into one catalog ready for further processing.** Devices are the first input kind. Every stage is kind-agnostic: read a key trail, check a key against its level's vocabulary, emit a row. Kind-specific knowledge lives in the schema, never in normalizer branches. It does only:

1. Build canonical coordinates and node paths.
2. Assign member `ordinal` from authored order.
3. Expand inline facets into normalized rows sharing the interval node.
4. Lift `$` entries onto their level's row.
5. Resolve structured references against normalized coordinates.
6. Reject duplicate coordinates, unresolved references, and part keys outside their set.
7. Tag every emitted row with its source trail for downstream error mapping.

It must not infer domain meaning from payload shape. Registry, quantity-kind, feature-type, and node-type files are already table-like — the trail walk handles them as a one-level case, not a special one.

The reference input is [`grimoire/concepts/catalog/fox-ess/h3/ps10sh.yaml`](../../grimoire/concepts/catalog/fox-ess/h3/ps10sh.yaml) — register map and prose included. `data/subject_node/foxess-h3-ps10sh.yaml` is a fixture derived from it, not the source; port what it inherits from grimoire's `_defaults.yaml` explicitly — the cascade does not come along, `Organization` replaces it.
