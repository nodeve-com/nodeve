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

`Specification`, `Measurement`, and `ValuedRange` are width facets of `Interval` ([facets.md](facets.md)) — no extra level.

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

Each localized `Content` row is about-attached (never nested under a parent), _projected_ from its schema `title`/`description` (en) + `annotations.i18n` (other languages) — never hand-authored in `data/` ([concepts.md](concepts.md#translations)). One thing may take more than one row, each addressable independently. Its relational shape is:

| column | means |
| --- | --- |
| `node` | this content row's identity; PK and FK to `Node` |
| `about` | described thing; FK to `Node`; maps to `schema:about` |
| `language` | BCP 47 language tag; maps to `schema:inLanguage` |
| `title`, `lede`, `body` | payload (`lede` = the slot's LinkML `description` — same field, LinkML's name; see [concepts.md](concepts.md#description-is-lede--one-field-two-names)) |

Thus content needs two node references, but no parent-class reference. `Content.about` can target a `Registry`, `QuantityKind`, model, or any future node without adding columns. Constraint: `UNIQUE (about, language)`.

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
| part | `Interval.part` verbatim — a member slug, `_`, or `*` | never — the column is non-null, so the segment never dissolves |
| quantity-kind | `Interval.quantity_kind` | never on an interval |
| interval-slug | `Interval.slug` | never — `_` when the quantity carries one unnamed interval |

`quantity_kind` is a **segment**, not the leaf. The leaf is the interval slug, and it exists only to discriminate siblings:

| path                               | is                                                  |
| ---------------------------------- | --------------------------------------------------- |
| `…/ac-phase/out/a/voltage/running` | phase A running-voltage band                        |
| `…/ac-phase/out/a/voltage/_`       | phase A voltage, one unnamed interval               |
| `…/ac-phase/out/_/voltage/_`       | the output's combined voltage, one unnamed interval |
| `…/ac-phase/out/_/frequency/_`     | frequency — never per-phase, one unnamed interval   |

Every level holds one segment, always. No segment dissolves, so position is never ambiguous and a part slug can never alias a quantity kind.

### `_` — the segment that asserts nothing

Two levels reserve `_`. Both readings are the same move: the column has no value, and every candidate word would supply one.

| position      | means                                                    |
| ------------- | -------------------------------------------------------- |
| part          | the quantity attaches to the feature itself              |
| interval slug | this quantity carries one interval, and it needs no name |

`*` is the third part form: the quantity attaches to every member with no own row. It asserts something `_` does not, so it forms a distinct segment and a distinct path — a combined band and a default band coexist without colliding.

At the leaf, any word would be a claim about content, not identity. The interval stays unnamed because nothing needs discriminating; `_` says exactly that.

The path stores `_`, never omits it. `Interval.slug` stays non-null and keeps full arity, so position never shifts. It elides only when rendering an address for a reader — `…/switch/0/power/_` displays as `…/switch/0/power`. A six-segment address parses back as `slug = _`; seven reads its leaf literally.

A second interval on the same `(feature, part, quantity_kind)` forces both to take names. `_` never quietly becomes one band among others.

As a part, `_` makes no claim about why no part carries a name. Three unrelated situations produce it:

| situation                               | example                           |
| --------------------------------------- | --------------------------------- |
| the quantity is never per-part          | frequency on an ac port           |
| it aggregates over the parts            | the port's voltage across a, b, c |
| this model never subdivided the feature | enclosure temperature             |

Any word would pick one of the three. `_` picks none.

A lone part that could have siblings — one MPPT tracker, one battery port — IS part `1`. Frequency on a three-phase port is not: calling it part 1 invents a part and implies a `2` and `3` that would carry frequency too.

Structure reserves both markers, **not a rule**: slugs match `^[a-z0-9]+(-[a-z0-9]+)*$`, which cannot produce a bare `_` or `*`. No part can ever collide with them and no lint has to say so.

Position carries the meaning: slot four is always the part.

### Uniqueness falls out

No separate "slug unique per part" constraint needs writing. Two rows that would collide on `(feature, part, quantity_kind, slug)` derive the _same_ path, and the path is the PK — the mint hits a duplicate.

| feature_type | feature    | part | interval                |
| ------------ | ---------- | ---- | ----------------------- |
| ac-phase     | out        | a    | `{voltage, continuous}` |
| ac-phase     | out        | b    | `{voltage, continuous}` |
| ac-phase     | out        | c    | `{voltage, continuous}` |
| ac-phase     | grid       | a    | `{frequency}`           |
| dc-port      | pv-tracker | 1    | `{voltage}`             |
| dc-port      | pv-tracker | 2    | `{voltage}`             |
| dc-port      | pv-tracker | 3    | `{voltage}`             |
| dc-port      | battery    | 1    | `{voltage}`             |
| ac-phase     | grid       | `_`  | `{frequency}`           |
| ac-phase     | load       | a    | `{voltage, continuous}` |
| environment  | enclosure  | `_`  | `{temperature}`         |
| environment  | ambient    | `_`  | `{temperature}`         |

## Many intervals per (feature, part, quantity)

`slug` is the discriminator. One band is never enough — a quantity carries specs, channels, or both.

| feature / part / quantity | slug | payload |
| --- | --- | --- |
| pv-tracker / 1 / voltage | `survival` | spec: `rating: survival`, max 1000 |
| pv-tracker / 1 / voltage | `running` | spec: `zone: running`, 90–140 |
| pv-tracker / 1 / voltage | `continuous` | spec: `rating: continuous, severity: nominal` |
| out / _ / active_energy | `lifetime` | measurement: `flow_direction: out` |
| out / _ / active_energy | `daily` | measurement: `flow_direction: out, period: daily` |
| grid / a / voltage | `_` | measurement: resolution 0.1 — no sibling to name against |

## Part keys

Integer strings are slugs — `1`, `2`, `3` pass `^[a-z0-9]+(-[a-z0-9]+)*$` unchanged. A part is a discriminator key on `Interval`, not its own row; sort/join order comes from the feature's `part_set` (`PartSetMember.ordinal`).

Parts belong to the **feature**, not its type — how a model subdivides a port is a per-model fact. Two subdivision kinds, picked by the marker in `$`:

- `count: N` — **members of a collection**: N interchangeable replica sockets authored once (three MPPT trackers). Keys are ordinal `1…n`; the `_` whole is a roll-up (Σ of independent members).
- `part_set: X` — **components of one integral socket**: a fixed named part vocabulary (three-phase `a/b/c`, split-phase `l1/l2`, ATX rails `3v3/5v/12v`). Keys are roles; the `_` whole is emergent — a rating no part row derives (the ATX rails share one 250 W budget; the 3-phase total isn't 3×a leg). Heterogeneous parts (different rail nominals) are still one socket.

Test: remove one part — still a working connection of the same kind? Yes ⇒ `count`. No ⇒ `part_set`. A part exists only as an `Interval.part` value validated against the feature's `part_set` members or `count`; a subdivision with no interval is simply not asserted.

| feature type | one model's parts  | another's                    |
| ------------ | ------------------ | ---------------------------- |
| ac-phase     | a, b, c (part_set) | l1, l2 (part_set)            |
| dc-port      | 1, 2, 3 (count)    | 3v3, 5v, 12v (part_set: atx) |
| environment  | —                  | —                            |

## The part column

Every interval has a part, always — the column is non-null and holds the path's part segment verbatim. No separate scope enum exists: the segment already says which of the three things it names, and a second column could only repeat or contradict it.

| part | means                                                         |
| ---- | ------------------------------------------------------------- |
| `a`  | phase A                                                       |
| `_`  | the whole feature                                             |
| `*`  | the default — applies to each part that doesn't state its own |

| row                              | means                                                |
| -------------------------------- | ---------------------------------------------------- |
| `ac-phase / out / a / voltage`   | phase A voltage                                      |
| `ac-phase / out / _ / voltage`   | the output's combined voltage                        |
| `ac-phase / out / _ / frequency` | frequency — never per-phase                          |
| `ac-phase / out / * / voltage`   | the voltage each phase gets unless it states its own |

A measurement channel is always concrete, so `*` is in practice a specification move: one band stated once instead of repeated per leg. Nothing forbids it elsewhere, and no rule has to.

`*` persists as-is and resolves at query time against the feature's `part_set` members (or `count`). A part's own value wins; `*` supplies the rest:

```sql
select distinct on (i.quantity_kind, i.slug) i.*
from Interval i
where i.feature = $1 and i.part in ($2, '*')
order by i.quantity_kind, i.slug, (i.part = '*')
```

`part` is not an FK — two of its values name no row. Member validity is an owned check against the feature's `part_set` members (or `count`).
