# Threshold

A **threshold** is the one STATEFUL `interval_kind` (`enumeration/interval_kind/threshold`) — a hysteretic trigger whose boolean output depends on the PRIOR on/off state, not the reading alone. The other three kinds (`measurable`, `rating`, `zone`) are stateless `f(reading) → in-band?`; a threshold is `f(reading, prior_state) → on/off`.

Folds in the former standalone `threshold` feature. Crosswalk: ssn-system `Condition` (close), HA `numeric_state`.

## The fields

`interval_kind: threshold` may be authored explicitly on any row; omit it and it's DERIVED from the presence of `trigger_on`. The switch is fully defined by two fields:

- **`min` / `max`** — the two hysteresis edges (the same `min`/`max` a stateless band uses, composed from `valued_range`). `[min, max]` is the **deadband / hold zone**: between the edges the boolean holds its prior value. That hold is what makes the output state-dependent.
- **`trigger_on`** (`above` / `below`) — which side is ON. The ON region is **outside** the deadband — the one irreducible bit `min`/`max` alone can't encode (identical edges describe a heater, a cooler, and an in-band window).

**`value`** is optional — a nominal setpoint (grade it `severity: nominal`), display context only. It is NOT part of the switch logic.

## Trip / release

- `trigger_on: above` — ON when the reading rises above `max`; OFF when it falls below `min`.
- `trigger_on: below` — ON when the reading falls below `min`; OFF when it rises above `max`.

## ON is outside; a zone's is inside

Same `min`/`max` fields, opposite sense, disambiguated by `interval_kind`: a **`zone`** (stateless) is in-region _inside_ `[min, max]`; a **`threshold`** (stateful) is ON _outside_ it, on the `trigger_on` side, with the band as its hold zone.

## Examples

- **PV inverter startup** — `{ zone: running, trigger_on: above, min: 90, max: 140 }`: trips ON above 140 V, drops out only below 90 V.
- **Heat-mode thermostat** — `{ trigger_on: below, min: 20, max: 21, value: 22 }`: demands heat below 20 °C, releases above 21 °C; `value: 22` the nominal setpoint.
- **Cool-mode thermostat** — `{ trigger_on: above, min: 20, max: 21 }`: same edges, ON above 21 °C, off below 20 °C. Heat vs cool is exactly the `trigger_on` flip.

Startup/shutdown, thermostat, hygrostat, run-command all share this shape.

## Sensor

Each threshold yields a boolean sensor. The `zone` name (or an explicit `identity.slug`) is its addressable handle.

See [feature model](feature-model.md) for the full interval axes.
