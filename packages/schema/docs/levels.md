# Levels

```
device type → model → feature type → feature → part? → interval
                                                        ├─ specification facet
                                                        ├─ measurement facet
                                                        └─ valued range facet
```

## Storage and policy

Every level is stored in a shared table. `DeviceType` and `FeatureType` rows also declare policy for later levels:

| artifact | owns |
| --- | --- |
| `DeviceType` row | allowed and required feature roles |
| `FeatureType` row | allowed quantity kinds |
| `DeviceModel` through `Interval` rows and interval facets | one model's facts |
| generated `Inverter` class | executable LinkML view of the policy rows |

`Inverter` is generated validation syntax, not another stored entity or SQL table. Adding a device type adds rows, then regenerates the overlay. Base DDL stays unchanged.

| level | table | keyed by | example |
| --- | --- | --- | --- |
| device type | `DeviceType` | `slug` | `inverter` |
| model | `DeviceModel` | `slug` | `foxess-h3-ps10sh` |
| feature type | `FeatureType` | `slug` | `ac-phase` |
| feature | `FeatureOfInterest` | `role` | `out` |
| part | `Part` | `slug` | `a` |
| interval | `Interval` | `quantity_kind` + `slug` | `voltage/running` |

`Specification`, `Measurement`, and `ValuedRange` are width facets of
`Interval`. They share its `node`; none adds a path segment or identity.

## Validation across levels

Rule ownership follows dependency, not importance:

| rule | owner | reason |
| --- | --- | --- |
| interval `slug` required | base LinkML | fixed shape of every interval |
| role is valid for an inverter | `SocketBinding` data → overlay | closed set varies by device type |
| quantity is valid for an AC feature | `QuantityBinding` data → overlay | closed set varies by feature type |
| referenced quantity exists | SQL FK | referential integrity |
| node path unique | SQL PK | storage identity |
| interval lies inside an envelope | owned check | compares related rows |
| default part loses to explicit part | query | selection semantics, not validity |

Use base LinkML for unconditional local shape: types, cardinality, requiredness, patterns, and closed grammar enums. Use policy rows when changing the rule should be a data edit. Project those rows into LinkML when document validation needs a closed stencil.

Use SQL for integrity the relational model represents directly: primary keys, uniqueness, nullability, and foreign keys. SQL confirms that a cited `QuantityKind` exists; it does not confirm that the model's `FeatureType` admits it.

Use an owned check when evaluation needs joins, ordering, arithmetic, implication across rows, or domain resolution. Examples: `gated_by`, bounds within an envelope, aspect compatibility, and slug derivation.

One rule gets one normative source. Generated LinkML and DDL are enforcement artifacts, never competing declarations.

## Node — addressable identity

`Node` is the identity boundary. Anything another row may point to must have one row in `Node`. Anything without a node is not independently addressable.

Narrow tables have two forms:

| form | identity | relation |
| --- | --- | --- |
| facet | same thing | shares the thing's node as its primary key |
| child | distinct, addressable thing | has its own node and references the parent's node |

`Interval` identifies a quantity assertion. `Specification`, `Measurement`, and
`ValuedRange` are facets of that assertion. They must share the interval's node;
none mints another.

Each localized `Content` row is a child. Several may describe one parent and each may be pointed to independently. Its relational shape is:

| column | means |
| --- | --- |
| `node` | this content row's identity; PK and FK to `Node` |
| `about` | described thing; FK to `Node`; maps to `schema:about` |
| `language` | BCP 47 language tag; maps to `schema:inLanguage` |
| `title`, `lede`, `body` | payload |

Thus content needs two node references, but no parent-class reference. `Content.about` can target a `Registry`, `QuantityKind`, model, or any future node without adding columns. Constraint: `UNIQUE (about, language)`.

### The path is the identity

`Node` is the one id space. Every domain row's PK is an FK into it. A node row is
two columns: the path, and a short code hashed from it.

The path is the **level trail**, one segment per level, in level order:

```
node:<device-type>/<model>/<feature-type>/<feature-role>/<part|_>/<quantity-kind>/<interval-slug>
node:inverter/foxess-h3-ps10sh/ac-phase/out/a/voltage/running
node:inverter/foxess-h3-ps10sh/ac-phase/out/_/frequency/range
```

Segment rules:

| segment | from | omitted when |
| --- | --- | --- |
| device-type | `DeviceType.slug` | never (definition docs root at their own layer — `node:feature-type/ac-phase`) |
| model | `DeviceModel.slug` | never, on catalog rows |
| feature-type | referenced `FeatureType.slug` | never |
| feature-role | `FeatureOfInterest.role` | never |
| part | `Part.slug`, or `_` when NULL | never — a NULL part becomes `_`, it does not dissolve |
| quantity-kind | `Interval.quantity_kind` | never on an interval |
| interval-slug | `Interval.slug` | never |

`quantity_kind` is a **segment**, not the leaf. The leaf is the interval slug, and
it exists only to discriminate siblings:

| path | is |
| --- | --- |
| `…/ac-phase/out/a/voltage/running` | phase A running-voltage band |
| `…/ac-phase/out/a/voltage/range` | phase A measurable-voltage range |
| `…/ac-phase/out/_/voltage/range` | the output's measurable combined-voltage range |
| `…/ac-phase/out/_/frequency/range` | frequency — never per-phase |

Every level holds one segment, always. No segment dissolves, so position is
never ambiguous and a part slug can never alias a quantity kind.

### `_` — the part that isn't

`_` marks a quantity attached to the **feature itself**. It makes no claim about
why no part is named. Three unrelated situations produce it:

| situation | example |
| --- | --- |
| the quantity is never per-part | frequency on an ac port |
| it aggregates over the parts | the port's voltage across a, b, c |
| this model never subdivided the feature | enclosure temperature |

A word would have to pick one. `combined` and `composite` assert aggregation —
false for frequency, which is not combined from anything. `whole` asserts
intactness, `all` asserts coverage, `effective` asserts resolution (and collides
with `part_scope: default`, a real and different idea), `mono` reads as
single-phase in an electrical model. The absence has three causes, the `part`
column records none of them, and every candidate word supplies one. `_` supplies
nothing — the only honest reading, and the same reason NULL is not spelled
`missing`.

### Precedent — the whole is not instance one

A reserved marker for the whole, distinct from part 1, is the mainstream shape:

| ecosystem | marker for the whole | instances |
| --- | --- | --- |
| IEC 61850 | `LLN0` — device-common data (mode, health, nameplate) | `LN1`, `LN2`… |
| Zigbee | endpoint 0 — the device itself (ZDO) | 1–240 |
| Matter | endpoint 0 — root node | 1..n |
| SNMP | instance `.0` — scalar objects | `.1`, `.2`… |

61850 is the same domain and the same reason: a logical device's common data is
not any one logical node's, so it got `LLN0` rather than `LN1`.

This settles "why not just make it part `1`". A lone part that could have
siblings — one MPPT tracker, one battery port — IS part `1`, `part_scope:
member`. But frequency on a three-phase port is not part 1; calling it that
invents a part and implies a `2` and `3` that would carry frequency too.

Those specs write the marker as `0` because their index space is **allocated by
the spec** — no one can author a conflicting endpoint 0. Part slugs here are
authored strings, and `0` is a legal one, so `0` would demote reservation back to
a lint. It also reads as a sibling in a numeric sequence (`out/0` beside
`out/1`), and half the features are not numbered at all (`a`, `b`, `c`). The
precedent establishes the shape, not the token.

It is reserved **structurally, not by rule**: slugs match
`^[a-z0-9]+(-[a-z0-9]+)*$`, which cannot produce a bare `_`. No part can ever
collide with it and no lint has to say so. (`-` would not work — it is the slug
separator and reads as an empty segment.)

Cost, stated plainly: `out/_/frequency` is less legible cold than a word would
be. Position carries the meaning instead — slot four is always the part — and a
reader who does not know that cannot parse the rest of the path either.

### Uniqueness falls out

There is no separate "slug unique per part" constraint to write. Two rows that
would collide on `(feature, part, quantity_kind, slug)` derive the *same* path,
and the path is the PK — the mint hits a duplicate. Uniqueness is the identity
rule, not a check bolted beside it.

Required interval slugs make every band explicit. A second band under the same
`(feature type, feature, part, quantity kind)` differs at the final segment or
collides with the same primary key.



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
| ac-phase     | grid       | NULL | `{frequency}`           |
| ac-phase     | load       | a    | `{voltage, continuous}` |
| environment  | enclosure  | NULL | `{temperature}`         |
| environment  | ambient    | NULL | `{temperature}`         |

## Many intervals per (feature, part, quantity)

`slug` is the discriminator. One band is never enough — a quantity carries several specs, several channels, or both.

| feature / part / quantity  | slug         | payload                                           |
| -------------------------- | ------------ | ------------------------------------------------- |
| pv-tracker / 1 / voltage   | `survival`   | spec: `rating: survival`, max 1000                |
| pv-tracker / 1 / voltage   | `running`    | spec: `zone: running`, 90–140                     |
| pv-tracker / 1 / voltage   | `continuous` | spec: `rating: continuous, severity: nominal`     |
| out / NULL / active_energy | `lifetime`   | measurement: `flow_direction: out`                |
| out / NULL / active_energy | `daily`      | measurement: `flow_direction: out, period: daily` |
| grid / a / voltage         | `range`      | measurement: resolution 0.1                       |

## Part keys

Integer strings are slugs — `1`, `2`, `3` pass `^[a-z0-9]+(-[a-z0-9]+)*$` unchanged. `ordinal` on the part row carries sort/join order.

Members belong to the feature type — no separate vocabulary row.

| feature_type | members |
| ------------ | ------- |
| ac-phase     | a, b, c |
| dc-port      | 1, 2, 3 |
| environment  | —       |

## NULL part = combined

The whole feature, not one of its parts. Some quantities are only ever combined (frequency); others carry both.

| row                                 | means                         |
| ----------------------------------- | ----------------------------- |
| `ac-phase / out / a / voltage`      | phase A voltage               |
| `ac-phase / out / NULL / voltage`   | the output's combined voltage |
| `ac-phase / out / NULL / frequency` | frequency — never per-phase   |
| `ac-phase / grid / a / voltage`     | phase A of the grid port      |

## part_scope — the default part

`Specification` only. A measurement channel is always concrete; a spec often states one band for every remaining leg. NULL part alone can't say which.

| part | `part_scope` | means                                |
| ---- | ------------ | ------------------------------------ |
| `a`  | `member`     | phase A                              |
| NULL | `combined`   | the whole feature                    |
| NULL | `default`    | every member with no own row         |

Rule: `part_scope = member ⟺ the interval's part is present` — same `value_presence` shape as phase⇒no-ordinal.

Resolved at query time, never expanded into rows. The member list lives on `FeatureType`, so a baked expansion of `a, b, c` goes stale the moment a part is added. Own row wins, `default` fills the gap:

```sql
select distinct on (i.quantity_kind, i.slug) i.*, s.*
from Interval i join Specification s on s.node = i.node
where i.feature = $1 and (i.part = $2 or s.part_scope = 'default')
order by i.quantity_kind, i.slug, (i.part is not null) desc
```

Not a reserved slug: `default` as a magic part key collides with a real member of that name and forces every consumer to string-compare.
