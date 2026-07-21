# Levels

```
feature_type → feature → part → interval → quantity (specification | measurement)
```

## DeviceType sits above the database

The five levels below are tables. `DeviceType` is not one of them in the same sense — it is a **validation step**, and it constrains rows without owning any.

`Inverter` is not a table. It is a `DeviceType` **row** (`node:device-type/inverter`) plus a **projection**: the shape a device of that type must satisfy — which feature roles are required, which quantities each admits. Validation runs against the projection; storage lands in the shared tables.

| | lives as | answers |
| --- | --- | --- |
| `DeviceType` row | data | which device types exist |
| projection (`Inverter`) | generated class | is THIS device a well-formed inverter |
| `FeatureOfInterest` … `Measurement` | tables | what this device actually states |

Why it can't be a table: the constraint is over *shapes of other rows* — grimoire's archetype layer, the metaclass gap. Relational storage has no way to say "a row of this type must have an `out` AC port carrying voltage". So the type is a row, and the enforcement is a generated projection over the same tables. Adding a device type is a row plus a regenerated projection, never a new table.

| level         | table               | keyed by                 | example       |
| ------------- | ------------------- | ------------------------ | ------------- |
| feature_type  | `FeatureType`       | `slug`                   | `ac-phase`    |
| feature       | `FeatureOfInterest` | `role`                   | `out`         |
| part          | `FeaturePart`       | `slug`                   | `a`           |
| interval      | `Interval`          | `quantity_kind` + `slug` | `voltage`     |
| specification | `Specification`     | shares interval `node`   | `survival`    |
| measurement   | `Measurement`       | shares interval `node`   | `daily`, `in` |

## Rows

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
