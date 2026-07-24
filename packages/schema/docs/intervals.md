# Intervals

One quantity band on one feature — the level facts live on. Everything above it (node type → … → part) is address; an interval row is what the address points at. Its payloads — `Specification`, `Measurement`, `ValuedRange` — are width facets sharing its node ([facets.md](facets.md)): they point at the interval, never back.

Identity is the path leaf: keyed by `part` → `quantity_kind` → `slug` under its feature (`Interval` in [features.yaml](../linkml/features.yaml); path in [levels.md](levels.md#the-path-is-the-identity)). The part key is [parts.md](parts.md). Uniqueness needs no constraint — colliding rows derive the same path, and the path is the PK ([levels.md](levels.md#uniqueness-falls-out)).

## `slug` — the discriminator

One band is never enough — a quantity carries specs, channels, or both:

| feature / part / quantity | slug | payload |
| --- | --- | --- |
| pv-tracker / 1 / voltage | `survival` | spec: `rating: survival`, max 1000 |
| pv-tracker / 1 / voltage | `running` | spec: `zone: running`, 90–140 |
| pv-tracker / 1 / voltage | `continuous` | spec: `rating: continuous, severity: nominal` |
| out / _ / active_energy | `lifetime` | measurement: `flow_direction: out` |
| out / _ / active_energy | `daily` | measurement: `flow_direction: out, period: daily` |
| grid / a / voltage | `_` | measurement: resolution 0.1 — no sibling to name against |

A quantity carrying one interval that needs no name takes slug `_` ([parts.md](parts.md#_--the-segment-that-asserts-nothing)). A second interval on the same `(feature, part, quantity_kind)` forces both to take names — `_` never quietly becomes one band among others.
