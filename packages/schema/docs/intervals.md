# Intervals

One quantity band on one feature — the level facts live on. Everything above it (node type → … → part) is address; an interval row is what the address points at. Its payloads — `Specification`, `Measurement`, `ValuedRange` — are width facets sharing its node ([facets.md](facets.md)): they point at the interval, never back.

Identity is the path leaf: keyed by `part` → `quantity_kind` → `slug` under its feature (`Interval` in [features.yaml](../linkml/features.yaml); path in [levels.md](levels.md#the-path-is-the-identity)). The part key is [parts.md](parts.md). Uniqueness needs no constraint — colliding rows derive the same path, and the path is the PK ([levels.md](levels.md#uniqueness-falls-out)).

## `slug` — the discriminator

One band is never enough — a quantity carries specs, channels, or both. The slug tells them apart.

### Earning every word

The slug is **authored, not generated** — you choose which axis discriminates. But it may only name axes the row actually sets: a `-`-joined **ordered subsequence** of its facets' discriminating values, kebab, each at most once. Nothing set ⇒ `_`.

The eligible values and their order are schema facts, `discriminates` on each class ([features.yaml](../linkml/features.yaml)):

| class           | contributes                                         |
| --------------- | --------------------------------------------------- |
| `Interval`      | `specification`, then `measurement`                 |
| `Specification` | `zone`, `rating`, `severity`, then each `Condition` |
| `Measurement`   | `flow_direction`, `period`                          |
| `Condition`     | `equals` (the FK's leaf segment), `test_condition`  |

Two exclusions. Band _shape_ — `duration`, `trigger_on`, `resolution` — says how wide or how sharp, never **which** band. A `Condition`'s `interval` anchor names another band, and borrowing that name reads as a local axis: `continuous-intermittent` looks like two ratings on one row. So a thermal derate takes `continuous-notice`, graded by `severity`.

So `rating: continuous, severity: nominal` earns `continuous`, `nominal`, or `continuous-nominal` — pick what discriminates against the siblings. It never earns `rated`, `peak`, or `derated` — the row sets no such value.

| feature / part / quantity | sets | slug |
| --- | --- | --- |
| pv-tracker / _ / voltage | `rating: survival` | `survival` |
| pv-tracker / * / voltage | `zone: mppt, rating: continuous, severity: notice` | `mppt-notice` |
| out / * / voltage | `severity: nominal` + gate `equals: eu-230v-50hz` | `nominal-eu-230v-50hz` |
| out / _ / active_energy | `flow_direction: out, period: daily` | `out-daily` |
| grid / a / voltage | nothing — a bare `measurement` | `_` |

Enforced in the walk ([intervals.ts](../normalize/intervals.ts)), so a failure names the authored trail. Uniqueness needs no separate rule: two rows that pick the same words derive the same path, and the path is the PK ([levels.md](levels.md#uniqueness-falls-out)).

### `_` — nothing to discriminate on

A bare `measurement` facet sets no discriminating value, so its interval is `_` ([parts.md](parts.md#_--the-segment-that-asserts-nothing)) — even beside named siblings. A word like `measured` would only restate the facet already on the row.

`_` and a named sibling never collide: a `Specification` always sets at least one of `zone`/`rating`/`severity`, so it never lands on `_`.
