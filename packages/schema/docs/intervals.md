# Intervals

One quantity band on one feature — the level facts live on. Everything above it (node type → … → part) is address; an interval row is what the address points at. Its payloads — `Specification`, `Measurement`, `ValuedRange` — are width facets sharing its node ([facets.md](facets.md)): they point at the interval, never back.

Identity is the path leaf: keyed by `part` → `quantity_kind` → `slug` under its feature (`Interval` in [features.yaml](../linkml/features.yaml); path in [levels.md](levels.md#the-path-is-the-identity)). The part key is [parts.md](parts.md). Uniqueness needs no constraint — colliding rows derive the same path, and the path is the PK ([levels.md](levels.md#uniqueness-falls-out)).

## Settable bands

A commissioning knob is not a band. A band names its FUNCTION and states it once; a `Setting` ([values.yaml](../linkml/values.yaml)) names the one bound it moves — `min`, `max`, `value`, or the specification's `duration` — through the same `target:` sugar a register uses. So an ignition threshold pair plus its debounce is three knobs on one `running` zone, not three bands; `trigger_on` is what makes the pair one.

The numbers split by owner: the interval carries the band as shipped, the setting carries what the knob ACCEPTS. Neither states the other's, and the live value is runtime state, in neither.

## Condition-gated derates

A `Specification` holds only under its `conditions:` — datasheet qualifiers, ALL required (AND), each one `Condition` row ([features.yaml](../linkml/features.yaml)). Two authored forms, same list:

- **setting equality** — `{ setting: <slug>, equals: <member> }`: a commissioning knob (grid region, dip-switch mode) must hold that value.
- **derate anchor** — `{ feature: { type, role }, part?, quantity, interval }`: ANOTHER interval, elsewhere on the device, must currently sit in the named band. Same coordinate shape as a `Setting`'s `target:` ([values.yaml](../linkml/values.yaml)) — feature type + role, optional part (`_` if omitted), quantity_kind, interval slug. [normalize/values.ts](../normalize/values.ts) assembles the FK path from these verbatim; a typo dies at the database's FK gate, not at authoring time.

A derate TABLE — one applicable band per anchor zone — is one interval per zone, each gated to its matching anchor:

```yaml
# dc-port/input/voltage carries severity zones (caution 6-8V, notice 8-11V, …);
# dc-port/out/12v/electric-current derates against them, one row per zone:
electric-current:
  caution:
    valued_range: { value: 8 }
    specification:
      severity: caution
      conditions:
        - { feature: { type: dc-port, role: input }, quantity: voltage, interval: caution }
```

The anchor's own slug (`caution`) never joins the gated band's slug — it names another band, not an axis of this one ([Earning every word](#earning-every-word)). The gated band earns its slug from its own facets only.

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

Two exclusions. Band _shape_ — `duration`, `trigger_on`, `resolution` — says how wide or how sharp, never **which** band. A [`Condition`'s `interval` anchor](#condition-gated-derates) names another band, and borrowing that name reads as a local axis: `continuous-intermittent` looks like two ratings on one row. So a thermal derate takes `continuous-notice`, graded by `severity`.

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
