# Device pipeline

A **device** declares what it is: its interfaces, the services it offers on them, and what the bytes of each service mean. **Adapter** is a role one node plays toward another: its `admit` names the device and the service or interface it dials, it processes what comes back, and its `emit` publishes. The node playing that role is usually a device too — a gateway, an ESPHome board — with its own interfaces, services, and points, and a third node can adapt it in turn. One device is read by any number of adapters; one adapter runs one or more services.

Neither holds an address. A device's interface declares what the port **is** — its type, its rated rate, the protocol and port a service binds. The IP, MAC, and name it answers to belong to the **site**, added when a site declares its use of that device. The adapter points at the interface; the site says where that interface is.

## Requirements

What the design answers to. Each section below exists to satisfy one or more of these.

**Structure**

1. A device declares what it is — interfaces, services, and points: measurement, setting, state.
2. Adapter is a role, not a kind. A node adapts another by naming, in its `admit`, the device and the service or interface it dials. The adapting node is a device itself and is adaptable in turn. No device names its adapters.
3. Addresses are the site's. An adapter reaches an interface by reference and resolves the address through the site's row for that unit. Neither the device nor the adapter restates it.
4. A device references central registries of step kinds and PDUs by identifier. The rest of the structure follows from this one.
5. A service declares how data is parsed and how it maps to the device's points.
6. Every definition has a named scope. An operation available at one scope is absent at another rather than reimplemented there.

**Pipeline**

7. Step kinds compose in any order and any number of times. No kind has a fixed position or a fixed count.
8. An adapter has a device side and a downstream side. Either side transmits and receives. What orients the pipeline is refinement, not transmission.
9. Adapters differ by declaration alone. A tap on a bus, a poller, and a duplex link share one model, as do publication to MQTT, to Home Assistant, and to serialized raw output on another channel.
10. Serialization is a named step. Six-bit ASCII and hexadecimal are declared, not implied.
11. Error detection is a named step, placed where the checksum sits.
12. A header is read before what it describes, and can decide which definition applies to it.

**Data**

13. Raw scalars and engineering values are strictly separated. Decode yields unsigned, signed, float, boolean, string, array, bytes, enumeration, and bitfield. Transform yields a value carrying a unit. Scale, offset, decimals, and sentinel handling are transform, never decode.
14. Ordering is declared on every axis that has one: bytes within a word, words within a value, bits within a word.
15. A definition declares the values it depends on, at extraction time and at transform time. Nothing elsewhere restates that dependency.

**Vocabulary**

16. Terms are industry standard. Nothing coined, abbreviated, or informal.
17. A statement holds universally or is stated conditionally.

## Shape

Two trees and one edge. The device tree is catalogued — one entry per model, no deployment in it. The site tree is per installation — the units it owns and where each one is. The adapter edge joins one node's `admit` to another node's service, and both ends are devices.

```
adapter node → admit: device + service/interface       emit: sinks
                         ↓
device  → interface → service → [ordered steps] + mapping
            ↑                       ↓      ↓        ↓
site  ──────┘                     steps  pdus  transforms
 (address, name)                          ↓
                                   PDU catalog → PDU → field
```

The service is where the edge lands: the device declares it, the adapter dials it. The interface is where device and site meet: the device declares what the port is, the site declares where it is. The edge chains — the adapter node has its own interfaces and services, so whatever dials those is its adapter.

Three central registries. Devices reference them by identifier; devices never inline behaviour.

- **`steps`** — the named step kinds. One entry per kind, each with a parameter schema and a signature.
- **`pdus`** — the PDUs, grouped into catalogs. One catalog per protocol.
- **`transforms`** — the engineering value models. Each turns one raw scalar into one engineering value.

They are registries rather than catalogs because a PDU catalog is a narrower thing living inside one of them, described below.

A service declares an ordered list of steps and the mapping its values land on. Nothing else in either tree carries logic.

## Scopes

Six scopes. Each definition belongs to exactly one, and each supports different operations — which is why an operation available at one scope is absent at another rather than quietly re-implemented there.

| Scope | Holds | Operations that live here |
| --- | --- | --- |
| `field` | One raw scalar. | `at`, `width`, `type`, ordering overrides, the transform applied to it. |
| `PDU` | One message or frame: ordered fields. | `size`, default orderings, array counts, `consumes`, `repeat`. |
| `PDU catalog` | One protocol's known PDUs. | Namespacing, versioning, case maps. |
| `pipeline` | One ordered list of steps. | Composition, labels, reassembly keys, framing. |
| `service` | One pipeline plus its mapping. | Point identity, unit agreement, `kind` agreement. |
| `adapter` | One node's read of another: what it dials, what it feeds. | `admit`, `emit`, which service it dials, read mode, sinks. |

The things inside a PDU are **fields**. Envelopes and codecs are PDUs too — an envelope is one whose fields are routing, so a header and a body are the same kind of definition at the same scope, differing only in what they carry.

The term is ISO/IEC 7498-1, and it is taken deliberately because it is layer-relative. Stripping one PDU yields header fields plus a service data unit, and that service data unit is the next layer's PDU. Repeated `decapsulate` is that relationship applied more than once, so the nesting comes with the word rather than needing to be defined here.

A **PDU catalog** is one protocol's known set of them: every SunSpec model, all twenty-seven AIS message types, every message a DBC file defines. It is what a discriminator selects from, and what a device references instead of naming PDUs one at a time.

Consequences worth stating, because they are the reason to name scopes at all:

- **A transform is field scope.** It takes one raw scalar and produces one engineering value. There is deliberately no PDU-scope transform: a quantity computed from several fields — power from voltage and current — is a derivation, not a transform, and it belongs downstream of `map` where its inputs are canonical points rather than one PDU's local keys.
- **A discriminator is PDU catalog scope.** It picks one PDU out of a catalog, so the case map belongs to the catalog holding the candidates rather than to any one PDU. A field selects nothing.
- **Ordering is declared at PDU scope and overridden at field scope.** Same axis, two scopes, the narrower winning.
- **Units of measure exist at field scope and are checked at service scope.** No PDU carries one.
- **A step kind belongs to nobody; a step belongs to a node.** A step is the adapter's when the deployment caused it: the link it opens, the envelopes its own transport wraps around the device's bytes, the sinks. It is the service's when the device's wire caused it. `admit` and `emit` are always the adapter's — offering a service is not dialing one, and no service has sinks.

## Adapters

Adapter is a role, not a kind of node. A node is an adapter of another node when its `admit` dials that node's service. It remains whatever else it is: a gateway daemon, an ESPHome board, a meter with a passthrough port — each catalogued as a device on its own terms, each adaptable in turn by whatever dials it. Nothing declares itself an adapter; the `admit` pointer is what makes the role.

An adapter has two sides and processes between them.

- **`admit`** — the device side. Names the device and which service or interface of it to dial.
- **`emit`** — the downstream side. Names the sinks: brokers, displays, processing, archives.

Either side can transmit and receive. On `admit` that is receiving frames, and transmitting polls and setting writes; on `emit` it is transmitting points, and receiving write requests. Which directions an adapter uses is declared per adapter — neither side is one-directional by definition.

What orients the pipeline is not which side transmits but which way data is becoming more refined. Device → downstream is the **read path**: bytes become points. Downstream → device is the **write path**: points become bytes.

The read mode is the adapter's alone, and it is the fork the word earns. A polling master dials the device's service binding and drives the cycle; a passive tap sniffs an existing master and republishes the windows it observes. Same device, same service, same PDUs — two adapters, differing in nothing the device knows about.

## Step kinds

Each kind has a signature. Any composition that type-checks is legal.

| Step | In | Out | Read path | Write path |
| --- | --- | --- | --- | --- |
| `admit` | — | bytes | Receives frames from the device. | Transmits frames to the device. |
| `frame` | bytes | bytes | Byte stream → discrete frames. | Applies delimiter or length. |
| `verify` | bytes | bytes | Checks the declared checksum. | Computes and appends it. |
| `decapsulate` | bytes | fields + bytes | Strips envelope and codec. | Applies envelope and codec. |
| `reassemble` | bytes | bytes | Joins multi-part payloads. | Splits a payload across frames. |
| `decode` | bytes | raw scalars | Payload → raw scalars. | Raw scalars → payload. |
| `transform` | raw | engineering | Raw scalars → engineering values. | Engineering values → raw scalars. |
| `map` | values | points | Values → canonical points. | Points → values. |
| `emit` | points | — | Transmits points to sinks. | Receives write requests. |

`link` sits under `admit` and owns the transport: serial, tcp, udp, can, ble, mqtt, http. It handles connect, reconnect, and backoff. The `emit` equivalent is its sink declaration.

The three middle kinds have strictly separated jobs, and the border between the first two is the one that matters most:

- `decode` answers **what bits are there** — structure only.
- `transform` answers **what the number means** — arithmetic and units only.
- `map` answers **which point it is** — identity only. It performs no arithmetic.

## Composition

The step kinds are a vocabulary, not a sequence. A service composes from them freely, and so does the adapter running it. One pass is the adapter's `admit` segment, then the service's list, then the adapter's `emit`.

- **Any kind may appear any number of times.** A payload arriving inside an MQTT topic, inside a NMEA sentence, inside six-bit armor is three `decapsulate` steps. Nothing caps the depth, and the model does not assume one.
- **Order is authored, not fixed.** Whether `verify` runs on the outer frame or an inner payload is a placement decision per wire. There is no canonical position for any kind.
- **Every step is labelled.** The label qualifies its outputs, which is what makes repetition addressable: `topic.station`, `sentence.channel`, `body.state_of_charge_raw`.
- **Composition is checked by signature.** `decode` cannot follow `map`, because `map` yields points and `decode` consumes bytes. A raw scalar typed `bytes` re-enters the byte line, which is how arbitrarily tunnelled formats stay expressible.
- **Composition is also checked by reference.** A step naming a value from another step has to come after it. This is the one thing that constrains order, and it constrains it by data dependency rather than by a fixed sequence.
- **`decapsulate` has two outputs.** Its fields accumulate under its label; its bytes continue down the line. Each step adds a named field set and narrows the payload.
- **The write path is the list reversed, each step inverted.** No second list, and no separate vocabulary for it. A step that cannot invert declares itself read-only, and any list containing one has no write path.

### Headers and discriminators

A header is an envelope, so `decapsulate` reads it: fields come out under the label, remaining bytes continue down the line. No separate kind is needed for headers as such.

What headers additionally do is **decide what happens next**, and that needs a way for an early value to choose a later PDU:

```yaml
- { step: decapsulate, as: header, envelope: ais-common-header }
- { step: decode, as: body, pdu: { on: header.message_type, case_map: ais-message-types } }
```

- Any step naming a PDU may name a **discriminator** instead: `on` is a field from an earlier labelled step, `case_map` is a case map belonging to the catalog being selected from. This is a parameter, not a step — it chooses a PDU, it does not operate on data, and keeping it a parameter is what preserves free composition.
- A discriminator resolves once per pass and the result is recorded on the step. Which PDU ran becomes runtime information, so it has to be readable afterwards rather than inferred from the list.
- An unmatched discriminator is an error on that step, not a silent skip. Unknown message types are the main thing worth counting on a live bus.
- A case map must be bijective to invert. On the write path the chosen PDU implies the discriminator value, and the header is written from the map read backwards.
- An envelope declares how many bytes it consumes. `consumes: 0` reads fields without advancing, for formats where the body PDU re-reads the same bytes the header occupies.
- A count in a header drives an `array` scalar: the PDU's `count` names an earlier field rather than a constant.

**Framing headers are the exception.** A length prefix has to be read before framing can produce a frame at all, so `frame` reads that field itself from raw bytes rather than waiting for a decapsulated header. That is a genuine ordering constraint, not an oversight: nothing can decode before there is a frame to decode.

The adapting node. It is a device like any other — the `admit` block is what makes it an adapter of the receiver, and its own steps are the ones this deployment caused:

```yaml
node: coastal-gateway
admit: { device: ais-receiver, service: nmea-stream, link: mqtt-broker }
pipeline:
  - { step: admit, link: mqtt-broker }
  - { step: decapsulate, as: topic, envelope: mqtt-topic }
emit: { sinks: [mqtt, home-assistant] }
```

The service, on the receiver. It names no host, no broker, no sink, and nothing that dials it:

```yaml
service: nmea-stream
pipeline:
  - { step: frame, as: line, kind: delimiter, on: "\r\n" }
  - {
      step: verify,
      as: sentence_check,
      algorithm: nmea-xor,
      span: { from: 1, to: star },
      at: field.checksum,
    }
  - {
      step: decapsulate,
      as: sentence,
      envelope: nmea-sentence,
      payload: { from: field.6, codec: six-bit },
    }
  - {
      step: reassemble,
      key: [sentence.sequence, sentence.channel],
      index: sentence.part,
      count: sentence.parts,
    }
  - { step: decapsulate, as: header, envelope: ais-common-header }
  - { step: decode, as: body, pdu: { on: header.message_type, case_map: ais-message-types } }
  - {
      step: transform,
      as: value,
      apply: { body.speed_raw: ais-speed-over-ground, body.course_raw: ais-course },
    }
  - { step: map, from: value }
```

Two `decapsulate` steps, and they belong to different nodes. `topic` is the adapter's — it exists because this gateway republishes over MQTT. `sentence` is the service's — it exists because the receiver speaks NMEA. Point a serial adapter at the same receiver and the adapter's pipeline drops to a single `admit`; the service is untouched, and so is every PDU and transform it names.

Rules that survive free composition:

- `frame` never inspects payload semantics. `verify` never reads a field. `decapsulate` never assigns meaning to payload bytes. `decode` never touches the transport. `transform` never reads bytes.
- No step reshapes another step's output into a parallel shape. If a value is wrong, fix it at the PDU, the transform, or the consumer.

## References

A definition can name a value produced elsewhere. This is what makes a header worth reading, and it is needed at two separate times.

- **Extraction time** — resolved before or during `decode`: an array `count`, a `size`, an `at` offset, a discriminator, a `present_if` gate. The referenced field has to be read before the field naming it.
- **Transform time** — resolved after decode: a scale factor, an exponent, a unit code, a sentinel set that varies by mode. SunSpec's `sunssf` is this — the exponent is a sibling point read from the device on the same pass.

Three forms, narrowest first:

| Form                        | Reaches                                         |
| --------------------------- | ----------------------------------------------- |
| `field_name`                | A sibling field in the same PDU.                |
| `label.field_name`          | A field from any earlier step in this pipeline. |
| `retained.label.field_name` | A value latched by an earlier pass.             |

- **A definition's references are its requirements.** The field or transform naming a value is the only place that need is declared. Nothing downstream restates it, and no runtime record mirrors it back.
- Unqualified names never cross a PDU. Crossing one is always explicit.
- `retained` exists because a sibling PDU is frequently a different message arriving at a different time — a scaling constant broadcast once and read by every frame after it. A step declares `retain: [...]` to publish its values; nothing is retained implicitly.
- The retained store is append-only and timestamped, because it is external state a pass depends on. Replaying an archived pass means replaying it against the store as of that pass. That property belongs to the store, not to every pass that reads it.
- A retained reference never populated is an error on that step, not a zero.

Consequences:

- **Legality now has two conditions.** A pipeline type-checks by signature and resolves by reference. A reference to a later step, or to a field that does not exist, is a definition error rather than a runtime one.
- **References form a directed acyclic graph.** A cycle — two fields whose offsets depend on each other — is rejected at definition time.
- **References are inputs on the read path and constraints on the write path.** Writing a SunSpec point means choosing a value and a scale factor that agree, and many pairs agree. A step whose references cannot be determined on the write path declares itself read-only. The usual resolution is to read the device's current scale factor and reuse it rather than choose one.
- **A reference does not change scope.** A transform reading a sibling scale factor is still field scope: one raw scalar in, one engineering value out, parameterized. The scale factor is a parameter, not a second input.

## PDUs

A PDU is data: one bounded run of octets carrying fields. It describes where the bits are, and stops there.

```yaml
id: leaf-can-lbc-0x55b
kind: bitfield # bitfield | structure | key-value | text | json | registers | envelope | codec | case-map
word: 8 # bits per addressable word
byte_order: big # bytes within one word
word_order: big # words within one value
bit_order: most-significant-first # bit numbering within one word
size: 8 # bytes, when fixed
fields:
  - key: state_of_charge_raw
    at: 0 # bit or byte offset per kind
    width: 10
    type: unsigned
  - key: pack_voltage_raw
    at: 16
    width: 16
    type: unsigned
  - key: cell_count
    at: 32
    width: 8
    type: unsigned
  - key: cell_voltages_raw
    at: 40
    type: array
    count: cell_count # extraction-time reference to a sibling field
    present_if: { cell_count: { greater_than: 0 } }
```

Raw scalar types: `unsigned`, `signed`, `float`, `boolean`, `string`, `array`, `bytes`, `enumeration`, `bitfield`.

### Ordering

Three orderings, independent of each other. One `endian` field cannot express them, because a value can be big-endian on one axis and little-endian on another.

- **`word`** is the device's addressable unit in bits: 8 for a byte stream, 16 for Modbus holding registers.
- **`byte_order`** orders bytes inside one word: `big` or `little`.
- **`word_order`** orders words inside one multi-word value: `big` or `little`.
- **`bit_order`** numbers bits inside one word: `most-significant-first` or `least-significant-first`. Bits get spelled out rather than reusing `big`/`little`, which are read both ways in the literature.

A 32-bit value spanning two Modbus registers has four readings, and the two byte axes generate all of them rather than needing four named modes:

```yaml
id: chint-meter-holding
kind: registers
word: 16
byte_order: big # bytes big-endian inside each register
word_order: little # registers swapped: CDAB
```

`byte_order: big, word_order: big` is ABCD; `little`/`little` is DCBA; `little`/`big` is BADC.

- When `word: 8`, byte order inside a word is vacuous and `word_order` alone is the endianness.
- `bit_order` matters for `bitfield`, and for any scalar sitting at a non-byte-aligned offset. Without it, `at: 0, width: 10` has two readings.
- Any ordering may be overridden per field, for devices that pack values inconsistently across one message. Declaring at the PDU and overriding at the field keeps the ordinary case to four lines.
- A PDU declares `at`, `width`, `type`, and the four orderings. Those are what it takes to read the value. It declares no scale, no offset, no unit, and no sentinel — none of those are needed to read a number, only to interpret one.
- An `enumeration` carries its symbol table, and a `bitfield` its flag positions, because both are wire structure. The symbols mean nothing yet.
- Field keys are PDU-local. They carry no domain meaning and are never published.
- PDUs are keyed by wire identity — CAN identifier, register block, topic, endpoint — so one device with three message identifiers references three PDUs.
- An **envelope** is a PDU whose raw scalars are routing: a CAN identifier, an NMEA talker, a Modbus unit, an MQTT topic segment. A header is an envelope; it gets no separate kind.
- A **discriminator** is a field's value choosing what is read next. The **case map** holding value → PDU belongs to the catalog, not to a service, because the mapping is a property of the protocol and is reusable by every service reading it.
- A **PDU catalog** holds one protocol's PDUs under a namespace and a version. Identifiers are qualified by it — `sunspec:103`, `ais:position-report` — so two protocols numbering their messages from one do not collide, and a spec revision adding message types is a new catalog version rather than an edit in place.
- A **codec** is a PDU whose output is bytes rather than scalars: `hexadecimal`, `six-bit`, `base64`, `ascii-decimal`, `cobs`, `slip-escape`, `none`. An **armor** is the printable-text case. It is a bijection with no parameters beyond an alphabet and a fill rule. If it needs to know field positions, it is an ordinary PDU, not a codec.
- Escaping is a codec. Delimiting is framing. SLIP splits across both: a `frame` step with `slip-delimit`, a `decapsulate` step with `codec: slip-escape`.
- `count`, `size`, `at`, and `present_if` accept references, so a PDU can describe a variable shape without the pipeline knowing that shape in advance.
- A PDU may **repeat**: `repeat: { until: 0xFFFF }` reads element after element, each declaring its own length and selecting its own body from its own header. This is distinct from an `array`, whose element shape is fixed and whose count is known before reading. A SunSpec device is a repeat: model header, model body, repeated to a terminator, with the count knowable only at the end.
- A PDU that cannot be inverted declares itself read-only. One identifier serves both directions.
- One PDU is reusable across devices. Reuse is the point of the registry.

Check algorithms, as `verify` parameters: `nmea-xor`, `crc-16-modbus`, `crc-16-ccitt`, `crc-32`, `fletcher-16`, `sum-8`.

- Error detection only. Correction is not a step — if the link performs forward error correction, that belongs to `link` and is invisible above it.
- When verification happens below the link — inside the protocol, the driver, or the hardware — omit the `verify` step. Include one only where a checksum exists in the data at that point in the list.

## Transform models

A transform is field scope: one raw scalar in, one engineering value out. It is the only place arithmetic and units exist.

```yaml
id: nissan-leaf-state-of-charge
from: unsigned # the raw scalar type it accepts
calibrate: { kind: affine, scale: 0.1, offset: 0 }
unit: percent
decimals: 1 # significant decimals of the engineering value
sentinel: [1023] # raw values that become null
range: { minimum: 0, maximum: 100 } # engineering range, checked not clamped
```

Calibration kinds: `affine`, `polynomial`, `spline`, `table`, `decimal-exponent`. Any numeric parameter accepts a reference in place of a literal, which is how a runtime scale factor works:

```yaml
id: sunspec-scaled-watts
from: signed
calibrate: { kind: decimal-exponent, exponent: { from: W_SF } }
unit: watt
sentinel: [0x8000]
```

- The output carries its unit. Downstream receives a value and a unit together, never a bare number whose scaling is implied by convention.
- `sentinel` lists raw values, not engineering values, because a sentinel is a bit pattern the device chose and has no engineering meaning. It becomes `null`, which is distinct from zero and from a decode failure.
- `range` is checked and recorded, not clamped. An out-of-range engineering value stays as read, flagged. Clamping would destroy the evidence that the device is misbehaving.
- `calibrate` covers the numeric conversion. `affine` is scale and offset; `polynomial`, `spline`, and `table` exist for sensors that are not linear; `decimal-exponent` multiplies by a power of ten, which is the shape a scale-factor register takes. A transform needing none declares no `calibrate` at all.
- `decimals` is the precision the engineering value is known to, carried as data. It is not display formatting, and it does not round the stored value.
- A transform inverts for the write path: the affine inverts, `null` becomes the first `sentinel`, and the unit converts back. `decimals` is lossy and does not participate.
- Transforms are keyed by meaning, not by device, so one transform serves every device reporting that quantity that way. A raw scalar needing no interpretation needs no transform, and passes through untransformed.

## Mapping

The service maps engineering values to the device's declared points, qualified by step label:

```yaml
map:
  value.state_of_charge: { point: battery.state_of_charge, kind: measurement }
  value.pack_voltage: { point: battery.voltage, kind: measurement }
  sentence.channel: { point: link.channel, kind: state }
```

- `kind` is `measurement`, `setting`, or `state`, and must match the device's declaration for that point.
- The unit on the incoming engineering value must match the unit the device declares for that point. This is the second checkable seam the border buys: a PDU cannot silently feed a scaled value into a point expecting a raw one, because a raw scalar carries no unit to match with.
- The map performs no arithmetic. If a value arrives in the wrong unit, the transform is wrong.

Together these are why the device declares points separately from the services that fill them: a device can declare a point that no service currently produces, and that gap is visible.

The write path reads this same table in reverse. There is no second mapping.

## Result shape

Every pass produces one shape, whether or not it succeeded.

```ts
interface Pass {
	direction: 'read' | 'write';
	source: LinkContext; // originating side context, intact
	raw: Uint8Array; // bytes as received or transmitted
	steps: Step[]; // in execution order
	points: Point[]; // empty if map ran on nothing
	error: string | null; // why it stopped
	failedAt: number | null; // index into steps
}

interface Step {
	step: string; // kind
	as: string; // label
	selected: string | null; // PDU identifier a discriminator resolved to
	bytes: Uint8Array | null; // the byte line leaving this step
	scalars: Scalars | null; // populated by decapsulate and decode
	values: Values | null; // populated by transform: value + unit + validity
	verified: boolean | null; // populated by verify
}
```

- `steps` is a list because the list is the pipeline. A shape with one `envelope` field could not describe a wire with two.
- `scalars` and `values` are separate fields, not one reused field, because the border is the point. A raw scalar and its engineering value both survive the pass, and a consumer can always see what the wire actually said.
- The pass records no copy of what its references resolved to. A same-pass reference is already in `steps[].scalars`, and duplicating it would be the parallel shape this doc forbids. A retained reference resolves against the retained store, which carries its own history.
- Steps do not throw. A failed step sets `error` and `failedAt`; later steps do nothing.
- `raw` survives to the far side regardless, so archive and forward sinks work on undecodable traffic. That includes frames that failed `verify` — a corrupt frame is a link-health signal, and it exists downstream only if bad frames reach a sink.
- A failed `verify` stops the pass. It never falls through to `decode` on the theory that the payload might still be readable.
- Steps before the failure survive it, so a payload that decapsulated twice and then failed to decode is still countable and routable by its envelopes.
- A sentinel that became `null` is not an error. Neither is an out-of-range value. Both are recorded on the value and the pass continues.
- A pass awaiting `reassemble` returns with that step's `bytes: null` and no error. Incomplete is not failed.
- Derived values ride alongside raw ones. Nothing replaces `raw`.

## Adding a device

1. Declare interfaces, services, and points — measurement, setting, state — each with its unit.
2. Write each service's pipeline as an ordered list. Reference existing step kinds; add a kind only when the operation is genuinely new, not when an existing kind needs a second placement.
3. Name the PDU catalog for the protocol. Reference existing PDUs, envelopes, and codecs within it. Add one only if the catalog has no match; do not fork one to rename fields.
4. Reference existing transforms. Add one only when the quantity or its scaling is new — not because the device is new.
5. Write the mapping against step labels.

No code, no inline PDUs, no arithmetic, and no deployment live in the device file — no address, no link, no sink, and no mention of what reads it. The composition lives in the service; everything it names lives in the registries.

## Adapting one

The same file, plus an `admit`. A node that reads another is authored as a device first and acquires the role by pointing.

1. Name the device, and the service or interface of it to dial. The address resolves through the site's row for that unit; do not restate it.
2. Declare the link and the read mode — polling master, passive tap, duplex.
3. Declare the sinks.
4. Add steps only for what this deployment wraps around the device's own wire. Everything inside that wire is already the service's.
