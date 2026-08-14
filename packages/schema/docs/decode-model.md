# Decode model — one Model-of-Points

Think CCSDS SOIS Electronic Data Sheets (SEDS), but easier to author.

Directions for _reading_ and _writing_ to devices. One table set, every protocol. Whoever publishes the measurand defines it once, and many devices reference it.

## Replacing

Eleven classes across three protocols — `ModbusRegister`, `RegisterFlag`, `RegisterRange`, `RegisterMap`, `VedirectField`, and grimoire's six `usbhid_*`

## Replacement

**Adapter** — (injest) - How to connect to device.

**serialization** — How messages are serialized (if any). framing, encoding, error_detection, application_protocol

**Model** — framing, encoding, wire config, declared once. `RegisterMap`; `usbhid_link`'s endpoints, transfer and timeout; `usbhid_numeric.byte_order`.

**Message** — one bounded run of octets carrying data points.

**Point Definition** — bytes in, scalar out. `ModbusRegister`, `VedirectField`, `usbhid_field` / `usbhid_fields`, `usbhid_params`. `RegisterFlag` too: `extract` cuts a flag word into one point per bit, at bit-range addresses, so the child table has nothing left to hold.

**Transform** — the scale / decimals half of every one of those, plus `usbhid_numeric.scale_overrides` (scale by reference) and `usbhid_params.sentinel`.

**Binding** — the interval / channel half of `ModbusRegister`, `VedirectField` and `usbhid_field`.

They were already copies, by their authors' own account: `usbhid_field` calls itself "the USB-HID analogue of modbus_registers", and the `usbhid` archetype "mirrors the modbus medium".

Two of them settle a question the old shape left open. `usbhid_config` + `usbhid_params` are a **write** plane — get and set a named parameter by index, its own magic byte, riding the same endpoints as the diag read. So [Encode](#encode) is not a separate mechanism: it is a second message whose points carry a write access mode.

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

A **Model** is a named data_dictionary, versioned block of point definitions published by an organization: `sunspec:160`, a FoxESS Modbus block, Victron's VE.Direct field set.

Wire-level config rides the **model**, declared once: register type, word order, endianness, serial line settings, USB endpoints and timeouts. `RegisterMap` already carries `register_type` and `word_order` exactly there. A point never restates them.

## Message

A **Message** is one bounded run of octets carrying a set of points, plus the parse pipeline that turns those octets into keyed scalars. What bounds it is the `frame` step. Nothing more is definitional.

- node, model FK, slug
- ordered parse steps
- ordered point positions

**Most messages are never requested.** CAN nodes, NMEA 0183 talkers, AIS transponders and VE.Direct devices all transmit on their own schedule; nobody asks. Modbus and USB-HID are the exceptions, not the pattern — treating "one request reads one message" as the definition builds a master/slave assumption into the core construct, which is the protocol-shaped assumption this model exists to refuse.

So solicitation is an **attribute** of a message, not its nature:

|  | reader | message identity comes from |
| --- | --- | --- |
| **solicited** | picks the message and sends a request | the request — you know what you asked for |
| **unsolicited** | takes what arrives | the octets themselves — `header` / `discriminate` |

A solicited message carries its request on the `frame` step: modbus's function + start + quantity, HID's poll command + response length. An unsolicited one carries no request, and the burden moves to identification — a CAN frame id, an NMEA 0183 formatter tag, an AIS message type in the first 6 bits. Both steps already exist in the table below; this is what they are for.

Three witnesses, three protocols, one construct:

| protocol | one message is           | bounded by                               | solicited |
| -------- | ------------------------ | ---------------------------------------- | --------- |
| modbus   | one 0x03/0x04 range read | the request's start + quantity (≤125)    | yes       |
| usbhid   | one poll response        | response length, leading magic byte      | yes       |
| vedirect | one text block           | the block's terminating `Checksum` field | no        |

VE.Direct proves the split. Its message is the **block**, not the line — the newline delimits a field inside it, and the block is what arrives as a unit and what the checksum covers. It arrives unbidden roughly once a second, so it has a frame rule and no request whatsoever. Treating the line as the message loses the only frame check the protocol has; treating the block as a query unit invents a request that was never sent.

A model whose messages are all unsolicited never issues a read. Its device binding declares a listener, not a poll cadence.

A modbus point's address becomes **message-relative** — base plus offset. `ModbusRegister.address` is absolute today, so this is a real change, and every downstream address derives from it.

### Where `individual_read` and `invalid` go

Nowhere. They exist only because no message row exists.

Modbus is solicited, so its message boundary is a decision someone must make — and today it is made downstream: familiar's `scripts/generate-telegraf.ts:159` greedily packs registers into spans under a hand-set `MAX_SPAN`, with `RegisterRange` correcting it from the side —

- `individual_read` says _do not pack these_. Under Message it is just a message of one point.
- `invalid` says _do not bridge this gap_. Under Message nothing bridges: a message covers a region or it does not. The reason rides `note`.

`invalid` is authored on the foxess map and read by **nothing** — `packages/site/registers.ts:74` filters `individual_read` alone. A fact with no consumer is what a missing construct looks like.

Cost, stated: authored messages replace a derived grouping, so a reverse-engineered map gains real authoring work — foxess's 113 registers become explicit spans. A published model ships its own messages and gains none.

### Parse steps

A message declares which steps it runs, in order. Only `extract` is mandatory. Each step is a row carrying its own parameters.

| step | does | cases |
| --- | --- | --- |
| frame | find message boundaries; carry the request when there is one | modbus span, HID poll exchange, VE.Direct block, NMEA 0183 `$`…`*hh` CRLF |
| reassemble | join fragments into one byte source | AIS multi-fragment, NMEA 2000 fast-packet |
| codec | substitute bytes — not positions | AIS 6-bit de-armor, base64, zlib, COBS |
| header | pull routing and identity ahead of the fields | NMEA 2000 29-bit CAN ID → priority, source, destination, PGN |
| discriminate | select which layout applies | PGN, AIS message type, CAN mux |
| extract | positioned and bit-sized fields → scalars | every protocol |
| recurse | a field's bytes re-enter as a nested message | AIS payload inside an `!AIVDM` field |

NMEA 2000 runs four steps before a single field resolves. Its 29-bit identifier splits into priority (3 bits), reserved + data page (2), PDU format (8), PDU specific (8) and source address (8). A PDU format under 240 makes PDU specific a destination address; at 240 and above it folds into the PGN instead. The PGN then picks the layout, and fast-packet payloads reassemble first.

### Where Kaitai draws the line

Kaitai Struct serves as the reference for what belongs at the binary layer. It covers `extract`, `discriminate` and `recurse` natively: `bN` bit-sized integers for bitfields, `size` + `process` + `type` to parse a codec'd substream as a nested type. It reaches neither `frame` nor `reassemble`, which act on the byte stream before a Kaitai stream exists. AIS de-armoring needs a custom processor too, since `process` ships only simple built-ins like `xor`.

Kaitai has no scale, no offset, no unit: it extracts scalars and stops. Common SunSpec practice applies the scale factor in the same pass as the read; we split them. Extraction emits a raw integer, and Transform applies SF afterwards, once every sibling has landed.

**Message group** — sibling messages linked by a shared transaction, a reassembly rule, or a semantic grouping.

Two-level address falls out: locate the message (PGN / sentence / span), then the point within it. Nesting adds a level per hop.

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
- message FK
- **address** — positional or named, exactly one (below)
- role — value, length, count, discriminator
- datatype
- length — fixed bits, or a reference resolved at runtime or by discovery
- nested message FK — when the scalar carries another message, which owns its own steps
- extraction dependencies (below)

Positional composite assembly is extraction — hi/lo across two registers, a length-bounded string. Composite needing arithmetic — value + exponent — is Transform.

### Two addressing modes

A point is addressed one of two ways:

- **positional** — `offset` + `length` into the message. Modbus register offset, HID byte offset, AIS and NMEA 2000 bit ranges, NMEA 0183 field ordinal.
- **named** — a `key` the message carries inline. VE.Direct label (`V`, `SER#`), JSON path (`battery.voltage`), HID Report Descriptor usage (`0x05:0x30`).

The axis cuts **across** protocols, not along them. JSON has both — object key and array index. HID has both — a standards-compliant device names its fields through a Report Descriptor, while the M4-ATX's vendor diagnostics protocol is bare byte offsets. So a protocol cannot own the choice, and a point definition carries `offset`+`length` **or** `key`, exactly one, enforced at normalize — the same either/or shape as interval/channel.

### A point definition is a node

Settled: every point definition gets a `node` row. `ModbusRegister` already carries one, minted at `node:register-map/<map>/<address>` — model-scoped, never device-scoped.

Slug and wire key are two columns only for a **named** point. The slug grammar is `^[a-z0-9]+(-[a-z0-9]+)*$`, and `V`, `VPV` and `SER#` all fail it — `#` terminates a URL path, which no permalink survives. So a named point keys its node on a slugified segment while `key` holds the wire key verbatim, unique per `(model, key)`; extraction addresses `key`, identity the slug.

A positional point needs no such split. Its offset is already slug-safe, so the offset _is_ the segment.

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

Two protocols reach this independently, which is why it is a construct and not a SunSpec accommodation. grimoire's `usbhid_link.firmware` reads a firmware version at an offset **plus a nibble**, selects a scale profile, and each field then picks its scale via `scale_overrides[<profile>]` — scale-by-reference, arrived at from USB-HID with no knowledge of SunSpec. The nibble is a sub-byte extract, Kaitai `bN`.

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

`RegisterFlag` does not survive this. A flag word's bits become their own point definitions at bit-range addresses, per `extract` — a child table only modbus has is the per-protocol fork this model exists to refuse.

## Mapping

The semantic layer already exists — the feature-type / interval tree ([facets.md](facets.md)). Mapping **points into** it and never redefines it. SunSpec model 160 ≈ our `pv-tracker` feature type; that is what the `sunspec: 160` crosswalk ref was gesturing at.

- Label: Phase A current
- IEC 61850-7-4: MMXU.A
- SunSpec: AphA
- nodeve: `{ feature: { type: ac-phase, role: point }, part: a, quantity: electric-current }`

## Device binding

A device authors no point definitions. It:

1. declares the protocol(s) it speaks and its transport coordinates (unit id, serial port, CAN interface, USB endpoints),
2. references the models it implements at their base (Modbus base address, HID report id; VE.Direct and JSON need none — the key is absolute),
3. binds each model instance → a feature of its interval tree. Multi-instance models (three MPPTs) bind per instance,
4. **expands** each reference into one point instance per model point — FK to the definition, at a determined id.

Step 4 generates rather than authors. Referencing `sunspec:160` at a base mints the whole slot set at `<device>/<model-ref>/<point-slug>`, so a consumer knows the id before the device ever answers. Same mechanic the feature roster already uses: `count: 3` mints parts 1…3, and `*` expands over the roster. A device states what it offers; the slots follow.

Step 4 is also what makes a model shareable, and today nothing does. `registerRow` mints the register node under the map (`register-map/<map>/<address>`) while `measurandLink` resolves its interval against the **device** walk, so a nominally shared map carries one device's interval FKs. `walkDevices` dedups on the map node and keeps whichever device walked first (`normalize/catalog.ts:172`). Latent, not active: each map has exactly one device today. A second device on an existing map slug fires it.

Downstream already depends on that captivity — `packages/site/registers.ts:43` derives a register's owning device by joining `modbus_register.interval → interval.parent`, because nothing points device → map. Step 4 is the replacement for that join, not an optimization of it.

### What rides the definition, what rides the instance

Scope drives the split, not presence. Spec-fixed semantics ride the **definition**: every VE.Direct `V` reads a voltage and every `I` a current, because Victron fixes that for the protocol. So the model carries the quantity kind, and the generated slot arrives already typed.

What varies per box is the **attachment** — this `V` reads the battery, this `VPV` reads tracker 1. Feature, part and channel ride the instance. A device supplies where a measurand lands, never what it means.

This is where `ModbusRegister.part` goes. It restates segment five of the interval FK it already carries, so it is not dropped so much as relocated: the definition never had a part, and the instance names one.

A model's points bind to the feature types we already carry, or to feature types / quantity kinds we extend the schema to hold. Same "extend, don't drop" rule as the appliance migrations.

### How today's devices land

- **FoxESS H3** — a FoxESS-published Modbus model, points at the current 39xxx/38xxx offsets. The captive `registers-*.yaml` rows become that model's point definitions, authored once; the device references model + unit id + feature bindings.
- **Victron MPPT 100/30** — references the Victron VE.Direct model, binding `V`/`I` → battery, `VPV`/`PPV` → tracker 1. The 15 discovery labels are point definitions of that shared model with no binding yet, not per-device rows.
- **Mini-Box M4-ATX** — one HID poll message, points at byte offsets, `firmware` selecting the scale profile. Its map has never left grimoire; it lands here first, with no migration to undo.
- **SunSpec inverter** — references stock `sunspec:103` + `160` at their bases; authors nothing.

## Discovery

Resolve which model and instance sits on the wire — SunSpec base-walk, CAN PGN. Model-level, before reading any point.

## Encode

The inverse, for settings and commands: transformed value → scalar → bytes. Access mode per point definition (r / rw / wo) — **new**; no slot carries it today.

No second mechanism. A write plane is a **message** whose points are writable, and grimoire's M4-ATX shape is the witness: `usbhid_config` describes a get/set exchange over the same endpoints as the diag poll, differing only in command framing and magic byte (`0x31` vs `0x21`), and `usbhid_params` are its points — addressed by index rather than offset, carrying the same scale and firmware-profile model as a read field, plus a `sentinel` mapping a reserved raw value to a categorical meaning.

That last one places `sentinel` too: it is Transform, on a written point, exactly as on a read one.

## Loading a published model

Import = full import, the repo rule. Seed every model the publisher ships, never the subset our devices happen to read — SunSpec's whole standard set, not 103/160/802. A curated subset is drift no later author can see: a missing model reads exactly like a model that never existed. The SMDX/JSON → row conversion is mechanical; delegate it, like the QUDT and refrigerant vocabularies.
