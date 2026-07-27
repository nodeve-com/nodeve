# Decode model — one Model-of-Points, framing-parameterized

Think CCSDS SOIS Electronic Data Sheets (SEDS), but easier to author.

Target shape for _reading_ devices. Supersedes the per-device `RegisterMap`/`ModbusRegister` shape and the device-owned `VedirectField` sketch — both make a register captive to one device. A register belongs to no device — whoever publishes the measurand defines it once, and many devices read it.

## Stages

Parsing a message runs an ordered **pipeline of steps**, not one extraction. It yields scalars keyed by point. Transform and Mapping then run per point.

```
raw octets
      ↓  parse pipeline — ordered steps, declared per message
keyed scalars       point id → int, float, bool, string, timestamp,
                    array, byte array, enum, bitfield
      ↓  Transform — per point
transformed value   engineering value, enum key, null
      ↓  Mapping — per point
semantic value      quantity_kind, unit, feature slot
```

The pipeline stays **pure**: it knows byte layout and nothing else. Scale, offset, decimals, sentinel→null and enum lookup belong to Transform, which operates on a typed scalar and never on bytes. Unit and quantity kind belong to Mapping, which never reaches the wire.

A **point** is one reading — one value pulled from one message. A **point definition** is the rule that extracts it. The pipeline emits `(point id, scalar)` pairs, never anonymous values.

## Model

A **Model** is a named, versioned block of point definitions published by an organization: `sunspec:160`, a FoxESS Modbus block, Victron's VE.Direct field set. Same shape — they differ only in publisher and address type. Standard vs proprietary is just who published it; SunSpec's own 64xxx vendor range sits beside its standard models.

**Framing** is an attribute of the model, and a parameter — never a structural fork. It fixes how to read a wire key and which parse steps a message runs by default. Both are data. No table, column or class varies by framing.

| framing   | wire key looks like | default steps                             |
| --------- | ------------------- | ----------------------------------------- |
| modbus    | `39248`             | frame, extract                            |
| vedirect  | `V`, `SER#`         | frame, extract                            |
| nmea0183  | `3` (field ordinal) | frame, extract                            |
| ais       | `38-45` (bit range) | reassemble, codec, discriminate, extract  |
| nmea2000  | `16-23` (bit range) | reassemble, header, discriminate, extract |
| can       | `0x1F2:8-15`        | frame, discriminate, extract              |
| hid       | `0x05:0x30`         | frame, extract                            |
| json/mqtt | `battery.voltage`   | frame, extract                            |

Wire-level config rides the **model**, declared once: register type, word order, endianness. `RegisterMap` already carries `register_type` and `word_order` exactly there. A point never restates them.

## Message

A **Message** groups points carried together, plus the parse pipeline that turns its bytes into keyed scalars. Also the query unit: one request reads one message.

- ordered parse steps
- ordered point positions

### Parse steps

A message declares which steps it runs, in order. Only `extract` is mandatory.

| step | does | cases |
| --- | --- | --- |
| frame | find message boundaries | VE.Direct newline, NMEA 0183 `$`…`*hh` CRLF, Modbus span, CAN frame |
| reassemble | join fragments into one byte source | AIS multi-fragment, NMEA 2000 fast-packet |
| codec | substitute bytes — not positions | AIS 6-bit de-armor, base64, zlib, COBS |
| header | pull routing and identity ahead of the fields | NMEA 2000 29-bit CAN ID → priority, source, destination, PGN |
| discriminate | select which layout applies | PGN, AIS message type, CAN mux |
| extract | positioned and bit-sized fields → scalars | every framing |
| recurse | a field's bytes re-enter as a nested message | AIS payload inside an `!AIVDM` field |

NMEA 2000 runs four steps before a single field resolves. Its 29-bit identifier splits into priority (3 bits), reserved + data page (2), PDU format (8), PDU specific (8) and source address (8). A PDU format under 240 makes PDU specific a destination address; at 240 and above it folds into the PGN instead. The PGN then picks the layout, and fast-packet payloads reassemble first.

### Where Kaitai draws the line

No dependency — Kaitai Struct serves as the reference for what belongs at the binary layer. It covers `extract`, `discriminate` and `recurse` natively: `bN` bit-sized integers for bitfields, `size` + `process` + `type` to parse a codec'd substream as a nested type. It reaches neither `frame` nor `reassemble`, which act on the byte stream before a Kaitai stream exists. AIS de-armoring needs a custom processor too, since `process` ships only simple built-ins like `xor`.

The split earns its keep — whatever Kaitai cannot express, our pipeline must own.

Its real value is what it **refuses**. Kaitai has no scale, no offset, no unit: it extracts scalars and stops. Common SunSpec practice applies the scale factor in the same pass as the read; we split them on purpose. Extraction emits a raw integer, and Transform applies SF afterwards, once every sibling has landed.

### ASCII line framings

They share this shape and differ only in boundary rule and address type. VE.Direct delimits on newline and keys points by label. NMEA 0183 runs `$` or `!` to a `*hh` checksum and CRLF, addressing points by field ordinal after the talker + formatter tag. Neither earns a special case.

**Message group** — sibling messages linked by a shared read transaction, a reassembly rule, or a semantic grouping.

Two-level address falls out: locate the message (PGN / sentence / model base), then the point within it. Nesting adds a level per hop.

### Nested message — the `recurse` step

A point's decoded scalar can serve as the raw octets of another message, which runs its own pipeline.

Two tests say when to nest rather than lengthen Transform:

1. **Direction.** More transform steps chain scalar → scalar, always one to one. A nested message re-enters the pipeline at raw octets. Put a codec in Transform and that layer starts emitting representation, inverting the pipeline.
2. **Cardinality.** A transform yields one value. A nested message yields an address space — N points, under a layout its own discriminator may pick at runtime.

A codec forces nesting when position arithmetic cannot express it. AIS armoring substitutes each character's value; no offset or stride reaches that. Reassembly likewise replaces the byte source outright.

AIS then addresses the de-armored bitstream by bit offset and length, and packs text at 6 bits per character. Its first 6 bits carry the message type, picking among layouts 1–27. The same mechanism covers an MQTT payload holding a binary blob, or a JSON envelope wrapping a device frame.

## Point Definition

The binary layer. Bytes in, decoded scalar out.

- PK
- key — the exact wire key (below)
- message FK + offset
- role — value, length, count, discriminator
- datatype
- length — fixed bits, or a reference resolved at runtime or by discovery
- nested message FK — when the scalar carries another message, which owns its own steps
- extraction dependencies (below)

Positional composite assembly is extraction — hi/lo across two registers, a length-bounded string. Composite needing arithmetic — value + exponent — is Transform.

### A point definition is a node

Settled: every point definition gets a `node` row. `ModbusRegister` already carries one, minted at `node:register-map/<map>/<address>` — model-scoped, never device-scoped.

Its **slug** and its **wire key** are two columns, not one. The slug grammar is `^[a-z0-9]+(-[a-z0-9]+)*$`, so `39248` passes while `V`, `VPV` and `SER#` fail — and `#` terminates a URL path, which no permalink survives. So the node keys on a slugified segment, and `key` holds the wire key verbatim, unique per `(model, key)`. Extraction addresses `key`; identity addresses the slug.

## Transform

Operates on the decoded scalar.

- scale, offset, decimals
- **sentinel → null** — data defines the not-implemented/not-available marker (a string, a specific int, a bit); the transform maps it to _absent_, never to a value
  - test the sentinel **before** scaling — the marker holds a raw integer, and scaling it yields a plausible reading
  - AIS leans on markers: longitude 181°, latitude 91°, SOG 1023, COG 3600, heading 511, ROT −128
  - NMEA 0183 instead marks absence with an empty field — no marker value at all
- enum key lookup — extracted integer → its meaning. `extract` already cut any bitfield into separate points (Kaitai `bN`), so Transform sees plain integers
- exponent applied from a sibling
- transform dependencies (below)

## Sibling dependency — two layers

A point's resolution can need another point's value. That happens at both layers, so both model it.

**Extraction-time** — the sibling decides _what bytes to read_, so it resolves before extraction of the dependent point. Pure still holds: layout resolution, no unit math, no semantics.

- length (SunSpec `L`, string length)
- repeat count — N instances of a layout at stride (per-tracker, per-phase, per-cell)
- multiplexer / discriminator — a value from an earlier step selects the layout (NMEA 2000 PGN, AIS message type, CAN mux)

**Transform-time** — the sibling decides _what the scalar means_. Extract its inputs first, and sometimes transform them too.

- scale by reference (SunSpec SF)
- validity / status gate
- exponent of a value+exponent pair

Dependency row: subject point FK, modifier point FK, layer.

## Binding — interval or channel

A read point binds to exactly one of two targets. `registerRow` enforces the choice today, and a `flag` list without a channel dies.

**Quantitative → an interval** of the feature tree, resolved from a structured ref:

```yaml
target: { feature: { type: ac-phase, role: out }, part: a, quantity: active-power }
```

Quantity kind, feature and unit all derive from that interval. The point carries no discriminator columns.

**Categorical → a channel.** Enum-valued, so no quantity_kind and no interval: run state, fault set, boolean alarms. Its vocabulary is its `DomainMember` rows, and `empty` names the member reported when no bit sets.

```yaml
target: { channel: run-state }
flag: [standby, null, on-grid] # index = bit, null = unidentified
```

Those labels mint the channel's members — authored once, at the wire. A channel hangs off the device root rather than a sub-feature, because a run mode aggregates across PV, grid, BMS and temperature; no one feature owns it.

## Mapping

The semantic layer already exists — the feature-type / interval tree ([facets.md](facets.md)). Mapping **points into** it and never redefines it. SunSpec model 160 ≈ our `pv-tracker` feature type; that is what the `sunspec: 160` crosswalk ref was gesturing at.

- Label: Phase A current
- IEC 61850-7-4: MMXU.A
- SunSpec: AphA
- nodeve: `{ feature: { type: ac-phase, role: point }, part: a, quantity: electric-current }`

## Device binding

A device authors no point definitions. It:

1. declares the framing(s) it speaks and its transport coordinates (unit id, serial port, CAN interface),
2. references the models it implements at their base (Modbus base address, HID report id; VE.Direct and JSON need none — the key is absolute),
3. binds each model instance → a feature of its interval tree. Multi-instance models (three MPPTs) bind per instance,
4. **expands** each reference into one point instance per model point — FK to the definition, at a determined id.

Step 4 generates rather than authors. Referencing `sunspec:160` at a base mints the whole slot set at `<device>/<model-ref>/<point-slug>`, so a consumer knows the id before the device ever answers. Same mechanic the feature roster already uses: `count: 3` mints parts 1…3, and `*` expands over the roster. A device states what it offers; the slots follow.

Step 4 is also what makes a model shareable. Today `registerRow` mints the register node under the map (`register-map/<map>/<address>`) while `measurandLink` resolves its interval against the **device** walk, so a nominally shared map carries one device's interval FKs. Latent, not active: each map has exactly one device today, so `walkDevices` dedup has never fired across two. A second device on an existing map slug triggers it, and the dedup keeps whichever device walked first. ### What rides the definition, what rides the instance

Scope drives the split, not presence. Spec-fixed semantics ride the **definition**: every VE.Direct `V` reads a voltage and every `I` a current, because Victron fixes that for the protocol. So the model carries the quantity kind, and the generated slot arrives already typed.

What varies per box is the **attachment** — this `V` reads the battery, this `VPV` reads tracker 1. Feature, part and channel ride the instance. A device supplies where a measurand lands, never what it means.

A proprietary model's points bind to standard feature types, or to feature types / quantity kinds we extend the schema to hold. Same "extend, don't drop" rule as the appliance migrations.

### How today's devices land

- **FoxESS H3** — a FoxESS-published Modbus model, points at the current 39xxx/38xxx offsets. The captive `registers-*.yaml` rows become that model's point definitions, authored once; the device references model + unit id + feature bindings.
- **Victron MPPT 100/30** — references the Victron VE.Direct model, binding `V`/`I` → battery, `VPV`/`PPV` → tracker 1. The 15 discovery labels are point definitions of that shared model with no binding yet, not per-device rows.
- **SunSpec inverter** — references stock `sunspec:103` + `160` at their bases; authors nothing.

## Discovery

Resolve which model and instance sits on the wire — SunSpec base-walk, CAN PGN. Model-level, before reading any point.

## Encode

The inverse, for settings and commands: transformed value → scalar → bytes. Access mode per point definition (r / rw / wo).

## Loading a published model

Import = full import, the repo rule. Seed every model the publisher ships, never the subset our devices happen to read — SunSpec's whole standard set, not 103/160/802. A curated subset is drift no later author can see: a missing model reads exactly like a model that never existed. The SMDX/JSON → row conversion is mechanical; delegate it, like the QUDT and refrigerant vocabularies.
