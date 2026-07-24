# Decode model — one Model-of-Points, framing-parameterized

Think CCSDS SOIS Electronic Data Sheets (SEDS), but easier to author.

Target shape for _reading_ devices. Supersedes the per-device `RegisterMap`/`ModbusRegister` shape and the abandoned device-owned `VedirectField` sketch — both treat a register as if it belonged to one device. It does not.

## Requirements

- **Identify/Discovery** — resolve which model/instance is present on the wire (SunSpec base-walk, CAN PGN).
- **Query** — Request a Point Group or Point from a device.
- **Decode** raw wire bytes → native value (datatype, endian/word-order, scale, offset, decimals).
- **Sentinel → null** — raw not-implemented/not-available markers map to _absent_, not a value.
- **Sibling dependency** — a point's decode needs another point's decoded value, resolved at runtime: scale-by-reference (SunSpec SF), multiplexer/discriminator (CAN mux), repeat-count or string-length (SunSpec `L`), validity/status gate, composite assembly (hi/lo, value+exponent).
- **Composite** — one logical value over more than one wire unit: multi-unit scalar, length-bounded string.
- **Repeating block** — N instances of a point layout at stride (per-tracker, per-phase, per-cell).
- **Two-level address** — locate the enclosing message frame (PGN / sentence / model base), then the point _within_ it.
- **Point Definition Dictionary** — a named data point definition
- **Point Group Message** — (transport) contiguous batch read/written in one transaction (Modbus span, CAN frame).
- **Group of Point Groups** — Sibling groups linked. Related values or semantic groupings.
- **Encode** native → raw — the inverse, for settings/commands. Per-point access mode (r / rw / wo).
- **Mapping** source point → interval-tree feature slot (semantic slot).

### Message Definition

- delimiter (new line, special character, predefined length)
- list of point definitions

### Point Definition

```
representation value (position, length, word order, bit order)
        ↓
decoded scaler value (int, float, bool, string, timestamp, array, enum, bitfield)
        ↓
transformed value (engineering unit, enum key)
        ↓
semantic value (quantity_kind, unit)
```

- PK — unique identifier (point is a node)
- point dependencies
- position
- key
- role - What it defines (point, repeating, length, scale, null)
- datatype
- scale
- decimals
- lengthType — fixed, runtime, discovered
- bits (when fixed)
- value (expected value)

#### Transform

The transform operates on a typed scalar, not on bytes. That scalar could be:

- integer
- floating-point
- boolean
- string
- timestamp
- array
- enum
- bitfield

### Point Dependencies

- subject target point FK
- modifier meta-point FK

### Point Position

- message FK
- point FK
- offset

### Mapping

- Label: Phase A current
- IEC 61850-7-4: MMXU.A
- Sunspec: AphA
- nodeve: { feature: { type: ac-phase, role: point }, part: a, quantity: electric-current }

## The bug in the current shape

A register definition ("holding 39601 = active-energy total, uint32, ×0.01") lives in one device's map. A second device reading the same measurand re-authors it. The map is nominally family-shared (many products FK it) but its rows are still captive to it. **It only looks correct because each device is the first — and only — instance of its manufacturer.** Add a second FoxESS and duplication follows.

VE.Direct made it worse: fully device-owned decode, for a field set (`V`, `VPV`, `PID`…) that is _fixed by Victron's spec and identical across every VE.Direct device_.

## Two layers, split

SunSpec is the closest prior art — but SunSpec conflates two layers because it's Modbus-only and can afford to. We must not copy that conflation.

1. **Information model — transport-neutral.** _What_ measurands exist: their semantics, datatype, scale, unit, and which feature they belong to. Shareable across _any_ framing. **We already have it: the feature-type / interval tree** ([facets.md](facets.md)). SunSpec model 160 ≈ our `pv-tracker` feature type; that is what the `sunspec: 160` crosswalk ref on the feature was gesturing at. SunSpec's value lands here — as measurand vocabulary, not wire format.

2. **Access binding — framing-specific.** _How_ you address and decode a measurand on a given wire. This is the reshaped layer. It **points into** the interval tree (as `intervalRef` already resolves), never redefines it.

## One Model-of-Points

The access layer is a single abstraction, not a class-per-framing zoo:

- **Model** — a named, versioned block of **Points**, published by an organization. `sunspec:160`, a manufacturer's proprietary block, and Victron's VE.Direct field set are the _same shape_ — they differ only in publisher and address type. Standard vs proprietary is just _who published it_; SunSpec's own vendor range (64xxx) is proprietary blocks beside standard ones.
- **Point** — one member of a model: **address** (framing-typed) + **decode** (datatype / scale / decimals / unit) + **binding** (→ the interval it reads, or a channel for categorical). The point _is_ the reusable unit that today's captive register row should have been.
- **Framing** — an attribute of the model that fixes (a) what `address` _is_ and (b) which extraction extras apply. The point/model/device structure is uniform across framings.

| framing   | address is                     | extraction extras                       |
| --------- | ------------------------------ | --------------------------------------- |
| modbus    | integer register offset        | register_type, word_order               |
| vedirect  | string label                   | _none_ — the label is the whole address |
| can       | message ID + bit offset/length | endianness, multiplexer                 |
| hid       | usage page/usage               | report id, bit field                    |
| json/mqtt | key path                       | _none_                                  |

VE.Direct is the **degenerate** case — string address, zero extras — not a unique thing. `VedirectField` as a peer of `ModbusRegister` was the modeling error: they are one `Point` whose address differs in type.

### Point identity is the wire key, not a slug

A point's local identity within its model is its **exact wire key** — offset `39601`, label `V`, label `SER#`. That is a dictionary key, _not_ a kebab slug. Modbus only slid past slug validation because offsets are numeric; VE.Direct exposed it. The decode layer must carry the exact key verbatim and must not force it through the authored-vocabulary slug grammar. (Open: whether a point is a `node` at all, or a dictionary row keyed by `(model, address)` — see below.)

## Device binding — thin

A device does not author points. It:

1. declares the **framing(s)** it speaks and the transport coordinates (unit id / serial port / CAN interface / …),
2. references the **models** it implements at their **base** (Modbus base address, HID report id; VE.Direct and JSON need none — the key is absolute),
3. binds each **model instance → a feature** of its interval tree (this box's battery, tracker 1). Multi-instance models (three MPPTs) bind per instance.

Nothing redefines a point. A SunSpec-compliant device references stock models and authors _only_ steps 1–3. A proprietary device references a manufacturer model of the identical shape.

## Proprietary features

"Use SunSpec directly where it fits; define proprietary/unique features too." Falls out cleanly. A proprietary model's points bind to standard feature types _or_ to feature types / quantity kinds we extend the schema to hold. Same "extend, don't drop" rule as the appliance migrations. Nothing special-cases SunSpec — just the subset of models the Alliance publishes, whose points we bulk-load instead of hand-author.

## How today's devices land

- **FoxESS H3** — a proprietary Modbus model published by FoxESS, its points at the current 39xxx/38xxx offsets, binding to the existing inverter interval tree. The captive `registers-*.yaml` rows become that model's points, authored once; the device references the model + unit id + feature bindings.
- **Victron MPPT 100/30** — references the one Victron-published **VE.Direct model** (string-addressed), binding `V`/`I` → battery, `VPV`/`PPV` → tracker 1. The 15 discovery labels are points of that shared model with no binding yet, not per-device rows.
- **A SunSpec inverter** — references stock `sunspec:103` + `160` at their bases; authors no points.

## Open decisions

1. **Is a Point a `node`?** A Point is a dictionary member addressed by exact wire key; nothing points _at_ an individual point. Either widen node-leaf identity to admit the exact key (drop the slug grammar for decode leaves), or make points non-node dictionary rows keyed by `(model, address)`. Resolve before building — it drives the whole table shape.
2. **Framing extras: columns vs per-framing extension table.** One `Point` with optional framing-specific columns (word_order, bit_length, report_id) vs a framing-tagged extension row. Lean columns until a framing needs a structurally different point (CAN multiplexing may force the extension).
3. **Base-address binding placement.** On the device↔model reference row (a model implemented at N bases → N reference rows), keeping the model's points offset-relative and reusable.
4. **SunSpec bulk-load scope.** Which standard models to seed first (103/160/802 cover our current devices), and the SMDX/JSON → point-row conversion path (delegate the mechanical load, like the QUDT / refrigerant vocabularies).
