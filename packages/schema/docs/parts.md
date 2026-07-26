# Parts and markers

A part subdivides a feature. Path segment four ([levels.md](levels.md#the-path-is-the-identity)); authored as the map level under a feature ([authoring.md](authoring.md#authored-form)). Which parts a feature HAS is its roster, one `Part` row each; which one an interval speaks about is a discriminator key on `Interval`.

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

Two tables, two different questions.

| table                                             | answers                                  |
| ------------------------------------------------- | ---------------------------------------- |
| `PartSet` / `PartSetMember`                       | which slugs are LEGAL — the vocabulary   |
| `Part` ([features.yaml](../linkml/features.yaml)) | which ones this feature HAS — the roster |

A vocabulary spans models and stays generous: `three-phase` carries the line-to-line pairs because some models measure them. A roster is per-feature and exact. Expanding `*` over the vocabulary instead of the roster invents parts — an inverter that meters three legs grows `ab`/`bc`/`ca` rows carrying a leg's current.

So a `part_set` feature must NAME its parts. `a: {}` is enough: an empty block claims the subdivision without asserting a band. `count: n` names nothing — the count IS the roster, and mints `1…n`.

A `Part` row is `<feature>/<slug>`, the part level of the path ([levels.md](levels.md#the-path-is-the-identity)), with no columns of its own — the slug is its node's leaf, the feature its backref. It gives per-part facts somewhere correct to hang, and `*` something exact to expand over.

The `part` slot ([shared.yaml](../linkml/shared.yaml)) stays a discriminator, not an FK — `_` and `*` name no row.

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

The third part form: the quantity attaches to every part in the roster with no own row. It asserts something `_` does not, so it forms a distinct segment and a distinct path — a combined band and a default band coexist without colliding.

`*` is authoring shorthand, never a stored row. A TEMPLATE states one band; the walk lowers it to one interval per roster member. Every stored row then names a concrete part, and every addressable point carries a `node`. The lowering runs once the feature's keys are all walked — a `*` may precede the parts it applies to, and the roster is only whole at the end. A part's own value wins: an expansion landing on a real interval's path yields to it, never doubles onto it. A `*` with an empty roster expands to nothing, so the walk refuses it rather than losing the bands silently.

Rows are the projection; the YAML holds the authoring intent. Nothing records that one `*` produced three legs — the same as the anchor form (`a: &leg` / `b: *leg`) landing three identical bands as three rows.

A measurement channel is always concrete, so `*` is in practice a specification move — one band stated once instead of repeated per leg.

## Markers collide with nothing

`interval.part` stores `_` verbatim — the `part` slot's pattern is slug-or-`_` ([shared.yaml](../linkml/shared.yaml)), and the walk consumes `*` before any row exists. Member **names** stay pure slugs, and the slug pattern produces no `_`. The two sets are disjoint by structure — no member can ever alias the marker, and no lint has to say so. Position carries the rest: slot four is always the part.
