# Levels

```
node type → model → feature type → feature → part? → interval
                                                        ├─ specification facet
                                                        ├─ measurement facet
                                                        └─ valued range facet
```

## Storage and policy

A shared table holds every level. `NodeType` and `FeatureType` rows also declare policy for later levels:

| artifact | owns |
| --- | --- |
| `NodeType` row | composed facets (`node_type.facets`), each single/child + required |
| `FeatureType` row | allowed quantity kinds |
| `Node` (marked `SubjectNode`) through `Interval` rows and interval facets | one model's facts |
| generated `Inverter` class | executable LinkML view of the policy rows |

`Inverter` is validation syntax, not another stored entity or SQL table. Base DDL stays unchanged.

| level        | table                         | keyed by                 | example            |
| ------------ | ----------------------------- | ------------------------ | ------------------ |
| node type    | `NodeType`                    | `slug`                   | `inverter`         |
| model        | `Node` + `SubjectNode` marker | `slug`                   | `foxess-h3-ps10sh` |
| feature type | `FeatureType`                 | `slug`                   | `ac-phase`         |
| feature      | `FeatureOfInterest`           | `role`                   | `out`              |
| part         | `Interval.part`               | key (no table)           | `a`                |
| interval     | `Interval`                    | `quantity_kind` + `slug` | `voltage/running`  |

`Specification`, `Measurement`, and `ValuedRange` are width facets of `Interval` ([facets.md](facets.md)) — no extra level. Two levels have their own docs: [parts.md](parts.md) (subdivision kinds, the `_`/`*` markers) and [intervals.md](intervals.md) (the band rows facts live on).

## Validation across levels

Rule ownership follows dependency, not importance:

| rule | owner | reason |
| --- | --- | --- |
| interval `slug` required | base LinkML | fixed shape of every interval |
| node type composes a facet | `node_type.facets` rows | composition varies by node type |
| quantity is valid for an AC feature | `QuantityBinding` → validation schema | closed set varies by feature type |
| referenced quantity exists | SQL FK | referential integrity |
| node path unique | SQL PK | storage identity |
| interval lies inside an envelope | owned check | compares related rows |
| default part loses to explicit part | query | selection semantics, not validity |

Use base LinkML for unconditional local shape: types, cardinality, requiredness, patterns, and closed grammar enums. Use policy rows when changing the rule should be a data edit. Project those rows into LinkML when document validation needs a closed stencil.

Use SQL for integrity the relational model represents directly: primary keys, uniqueness, nullability, and foreign keys. SQL confirms that a cited `QuantityKind` exists; it does not confirm that the model's `FeatureType` admits it.

Use an owned check when evaluation needs joins, ordering, arithmetic, implication across rows, or domain resolution. Examples: `conditions`, bounds within an envelope, aspect compatibility, and slug derivation.

One rule gets one normative source. Generated LinkML and DDL are enforcement artifacts, never competing declarations.

## Node — addressable identity

`Node` is the identity boundary. Anything another row may point to must have one row in `Node`. Anything without a node is not independently addressable. Narrow tables are the facet/child split — see [facets.md](facets.md).

Each localized `Content` row is about-attached (never nested under a parent), _projected_ from its schema `title`/`description` (en) + `annotations.i18n` (other languages) — never hand-authored in `data/` ([concepts.md](concepts.md#translations)). One thing may take more than one row, each addressable independently. Shape and constraints: `Content` in [core.yaml](../linkml/core.yaml) — its own `node` plus `about`, the described thing, unique per `(about, language)`.

Thus content needs two node references, but no parent-class reference. `Content.about` can target a `Registry`, `QuantityKind`, model, or any future node without adding columns.

### The path is the identity

`Node` is the one id space. Every domain row's PK is an FK into it. A node row is two columns: the path, and a short code hashed from it.

The path is the **level trail**, one segment per level, in level order:

```
node:<node-type>/<model>/<feature-type>/<feature-role>/<part|_>/<quantity-kind>/<interval-slug>
node:inverter/foxess-h3-ps10sh/ac-phase/out/a/voltage/running
node:inverter/foxess-h3-ps10sh/ac-phase/out/_/frequency/_
```

Segment rules:

| segment | from | omitted when |
| --- | --- | --- |
| node-type | `NodeType.slug` | never (definition docs root at their own layer — `node:feature-type/ac-phase`) |
| model | `Node.slug` (marked by a `SubjectNode` row) | never, on catalog rows |
| feature-type | referenced `FeatureType.slug` | never |
| feature-role | `FeatureOfInterest.role` | never |
| part | `Interval.part` verbatim — a member slug or marker ([parts.md](parts.md)) | never — the column is non-null, so the segment never dissolves |
| quantity-kind | `Interval.quantity_kind` | never on an interval |
| interval-slug | authored interval key — path only, no column | never — `_` when the interval sets nothing to name |

`quantity_kind` is a **segment**, not the leaf. The leaf is the interval slug — the sibling discriminator ([intervals.md](intervals.md#slug--the-discriminator)):

| path                               | is                                             |
| ---------------------------------- | ---------------------------------------------- |
| `…/ac-phase/out/a/voltage/running` | phase A running-voltage band                   |
| `…/ac-phase/out/a/voltage/_`       | phase A voltage, nothing to name               |
| `…/ac-phase/out/_/voltage/_`       | the output's combined voltage, nothing to name |
| `…/ac-phase/out/_/frequency/_`     | frequency — never per-phase, nothing to name   |

Every level holds one segment, always. No segment dissolves, so position is never ambiguous and a part slug can never alias a quantity kind.

The path stores `_`, never omits it ([parts.md](parts.md#_--the-segment-that-asserts-nothing) owns its meaning). The leaf lives only in the path — `interval` has no slug column — and keeps full arity, so position never shifts. It elides only when rendering an address for a reader — `…/switch/0/power/_` displays as `…/switch/0/power`. A six-segment address parses back as `slug = _`; seven reads its leaf literally.

### Uniqueness falls out

No separate "slug unique per part" constraint needs writing. Two rows that would collide on `(feature, part, quantity_kind, slug)` derive the _same_ path, and the path is the PK — the mint hits a duplicate.

The same interval on a different part is a different path — the part segment discriminates, no constraint needed:

| feature | part | interval                |
| ------- | ---- | ----------------------- |
| out     | a    | `{voltage, continuous}` |
| out     | b    | `{voltage, continuous}` |
| out     | `_`  | `{frequency}`           |

Authoring the nested front-end that flattens into these rows: [authoring.md](authoring.md).
