# Parts and markers

A part subdivides a feature: a discriminator key on `Interval`, never its own row. Path segment four ([levels.md](levels.md#the-path-is-the-identity)); authored as the map level under a feature ([authoring.md](authoring.md#authored-form)).

## Two subdivision kinds

Parts belong to the **feature**, not its type — how a model subdivides a port is a per-model fact. One marker on the feature row, `part_set` XOR `count`:

- `count: N` — **members of a collection**: N interchangeable replica sockets authored once (three MPPT trackers). Keys are ordinal `1…n`; the `_` whole is a roll-up (Σ of independent members).
- `part_set: X` — **components of one integral socket**: a fixed named part vocabulary (three-phase `a/b/c`, split-phase `l1/l2`, ATX rails `3v3/5v/12v`). Keys are roles; the `_` whole is emergent — a rating no part row derives (the ATX rails share one 250 W budget; the 3-phase total isn't 3×a leg). Heterogeneous parts (different rail nominals) are still one socket.

Test: remove one part — still a working connection of the same kind? Yes ⇒ `count`. No ⇒ `part_set`.

| feature type | one model's parts  | another's                    |
| ------------ | ------------------ | ---------------------------- |
| ac-phase     | a, b, c (part_set) | l1, l2 (part_set)            |
| dc-port      | 1, 2, 3 (count)    | 3v3, 5v, 12v (part_set: atx) |
| environment  | —                  | —                            |

Integer strings are slugs — `1`, `2`, `3` pass the `slug` pattern ([shared.yaml](../linkml/shared.yaml)) unchanged.

## Storage

The vocabulary is data: `PartSet` / `PartSetMember` ([taxonomy.yaml](../linkml/taxonomy.yaml)); `count` needs none. The `part` slot ([shared.yaml](../linkml/shared.yaml)) is not an FK — `_` and `*` name no row. Member validity is an owned check against the feature's `part_set` members (or `count`); a subdivision with no interval is simply not asserted.

## `_` — the segment that asserts nothing

Two levels reserve `_`. Both readings are the same move: the column has no value, and every candidate word would supply one.

| position      | means                                              |
| ------------- | -------------------------------------------------- |
| part          | the quantity attaches to the feature itself        |
| interval slug | this interval sets no discriminating value to name |

At the leaf, any word would be a claim about content, not identity — and an unearned one at that ([intervals.md](intervals.md#earning-every-word)). A bare `measurement` is the usual case: it says nothing `_` doesn't.

As a part, `_` makes no claim about why no part carries a name. Three unrelated situations produce it:

| situation                               | example                           |
| --------------------------------------- | --------------------------------- |
| the quantity is never per-part          | frequency on an ac port           |
| it aggregates over the parts            | the port's voltage across a, b, c |
| this model never subdivided the feature | enclosure temperature             |

Any word would pick one of the three. `_` picks none.

A lone part that could have siblings — one MPPT tracker, one battery port — IS part `1`. Frequency on a three-phase port is not: calling it part 1 invents a part and implies a `2` and `3` that would carry frequency too.

## `*` — every member

The third part form: the quantity attaches to every member with no own row. It asserts something `_` does not, so it forms a distinct segment and a distinct path — a combined band and a default band coexist without colliding. It persists as-is and resolves at query time against the feature's members, a part's own value winning:

```sql
select distinct on (i.quantity_kind, i.slug) i.*
from Interval i
where i.feature = $1 and i.part in ($2, '*')
order by i.quantity_kind, i.slug, (i.part = '*')
```

A measurement channel is always concrete, so `*` is in practice a specification move — one band stated once instead of repeated per leg.

## Markers collide with nothing

`interval.part` stores markers verbatim — the `part` slot's pattern is slug-or-marker ([shared.yaml](../linkml/shared.yaml)). Member **names** stay pure slugs, and the slug pattern produces neither marker. The two sets are disjoint by structure — no member can ever alias a marker, and no lint has to say so. Position carries the rest: slot four is always the part.
