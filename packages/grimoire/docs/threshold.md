# Stateful trigger (`trigger_on` on an interval)

A **stateful trigger** is an interval carrying `trigger_on` — a hysteretic switch whose boolean output depends on the PRIOR on/off state, not the reading alone. There is **no separate `threshold` interval_kind**: the three kinds (`measurable`, `rating`, `zone`) are stateless `f(reading) → in-band?`; adding `trigger_on` makes the row `f(reading, prior_state) → on/off`. Statefulness is an **axis orthogonal to `interval_kind`**, not a kind.

`trigger_on` most commonly rides a **`zone`** — the zone name auto-supplies the boolean sensor's handle — but it isn't required to. A `startup`/`shutdown` `rating` takes it just as well. What a stateful trigger DOES need is an addressable handle: a zone name gives one for free; on any other kind, author an explicit `identity.slug` (which the slug guard admits only when referenced by an `interval_item` or titled).

Folds in the former standalone `threshold` feature (and its dropped `interval_kind`). Crosswalk: ssn-system `Condition` (close), HA `numeric_state`.

## The fields

`trigger_on` never changes `interval_kind` — it derives nothing; the underlying kind (a zone name, a rating tier) still classifies the row. The switch is fully defined by two fields:

- **`min` / `max`** — the two hysteresis edges (the same `min`/`max` a stateless band uses, composed from `valued_range`). `[min, max]` is the **deadband / hold zone**: between the edges the boolean holds its prior value. That hold is what makes the output state-dependent.
- **`trigger_on`** (`above` / `below`) — which side is ON. The ON region is **outside** the deadband — the one irreducible bit `min`/`max` alone can't encode (identical edges describe a heater, a cooler, and an in-band window).

**`value`** is optional — a nominal setpoint (grade it `severity: nominal`), display context only. It is NOT part of the switch logic.

## Trip / release

- `trigger_on: above` — ON when the reading rises above `max`; OFF when it falls below `min`.
- `trigger_on: below` — ON when the reading falls below `min`; OFF when it rises above `max`.

## ON is outside; a plain zone's is inside

Same `min`/`max` fields, opposite sense, disambiguated by the presence of `trigger_on`: a plain **`zone`** (stateless) is in-region _inside_ `[min, max]`; a zone with `trigger_on` (stateful) is ON _outside_ it, on the `trigger_on` side, with the band as its hold zone.

## Examples

- **PV inverter startup** — `{ zone: running, trigger_on: above, min: 90, max: 140 }`: trips ON above 140 V, drops out only below 90 V.
- **Heat-mode thermostat** — `{ zone: heating, trigger_on: below, min: 20, max: 21, value: 22 }`: demands heat below 20 °C, releases above 21 °C; `value: 22` the nominal setpoint.
- **Cool-mode thermostat** — `{ zone: cooling, trigger_on: above, min: 20, max: 21 }`: same edges, ON above 21 °C, off below 20 °C. Heat vs cool is exactly the `trigger_on` flip.

Startup/shutdown, thermostat, hygrostat, run-command all share this shape. Each carries a `zone` name — its addressable handle, since a stateful trigger yields a boolean sensor.

## Sensor

Each stateful trigger yields a boolean sensor. The `zone` name (or an explicit `identity.slug`) is its addressable handle.

See [feature model](feature-model.md) for the full interval axes.
