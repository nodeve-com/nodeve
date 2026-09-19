# Glossary

Terms for reading and writing data. `term` is the proposal; **also written** is every other name the docs and data give the same thing; column four is the reference.

A term qualifies when some published protocol or standard already uses it for this thing, and it stays true across every one. A term that fits one protocol and gets generalized to the rest is the protocol-shaped assumption this model refuses.

## Constructs

| term | is | also written | named elsewhere |
| --- | --- | --- | --- |
| **PDU catalog** | one publisher's versioned set of PDU definitions, plus the wire defaults they share — `word_width`, `byte_order`, `word_order`, `bit_order`. A PDU or a field overrides any of them, narrowest wins | Information model; dictionary; registry | SunSpec _Information Model_; CANopen _object dictionary_; CAN _database_ (DBC); OPC UA _companion specification_; CCSDS SOIS _electronic data sheet_ |
| **PDU** | one bounded run of octets carrying fields, plus the steps that parse it | Message; decode model; decoder; unit | ISO/IEC 7498-1; Modbus _protocol data unit_; SunSpec _model_; CAN, AIS, DBC, MQTT _message_; NMEA 0183 _sentence_; VE.Direct _block_; USB HID _report_ |
| **Header** | the fields ahead of a payload naming its routing and identity: a CAN identifier, an NMEA talker, a Modbus unit, an MQTT topic segment. Read first; a discriminator on it picks the PDU that follows. A length prefix is the exception: `frame` reads it, since no frame exists before it | — | ISO/IEC 7498-1 _protocol control information_; TCP/IP, Ethernet, USB _header_ |
| **Envelope** | one PDU of a header and a payload it leaves undecoded, handed on with a fresh origin, so the PDU inside it addresses from zero | — | ISO/IEC 7498-1 _service data unit_ (the payload); SMTP, X.400 _envelope_ |
| **Codec** | one PDU whose output is octets rather than scalars — a bijection over the byte stream, blind to field positions. An **armor** is the printable-text case: base64, hex, AIS six-bit | — | Kaitai Struct `process`; MIME _content-transfer-encoding_; PGP _ASCII armor_; PPP, SLIP _byte stuffing_ |
| **Step** | one operation in a PDU's ordered parse: `admit`, `frame`, `verify`, `decapsulate`, `reassemble`, `decode`, `transform`, `map`, `emit` | invocation; stage; layer. The ordered list is the **pipeline**; one run of it, a **pass**. `header`, `codec`, `recurse` and nested message are `decapsulate`; `extract` and parse are `decode`; `discriminate` is a discriminator, not a step | ISO/IEC 7498-1 |
| **Field** | one PDU reading chunk — scalar, array, composite. May include key naming it | Point Definition; field. Addressed **positionally** (`at` + `width`, bit offset + length) or by **name** (`key`) | SunSpec, DNP3 _point_; VE.Direct, NMEA 0183 _field_; DBC _signal_; BACnet _object_; J1939 _suspect parameter_; IEC 61850 _data attribute_; OPC UA _variable_ |
| **Discriminator** | one field's value choosing which definition follows it, as a case map value → PDU. The case map belongs to the catalog holding the candidates. Positional addressing or a `key` names the field, in this PDU or an earlier one | selection; discriminate | OpenAPI, JSON Schema `discriminator`; ASN.1 `CHOICE`; Kaitai Struct `switch-on`; DBC _multiplexor_; Protobuf `oneof` |
| **Common initial sequence** | the leading run of fields every case shares — same order, same widths. Readable before the case resolves, so a reader routes, filters or counts on it without parsing the body | — | C11 §6.5.2.3; OpenAPI `discriminator` base schema; DBC _non-multiplexed signals_ |
| **Point** | one reusable logical measurement or control a device exposes — the addressable slot a field observes. One or more fields produce it, through an expression or version handling | datapoint; tag; channel | Project Haystack _point_; building automation _point_; BACnet _object_ (its `present-value`) |
| **Transform** | one scalar in, one engineering value out — scale, offset, decimals, sentinel, enum lookup | A **conversion** is the unit-to-unit case; `calibrate` is the numeric half of one. Its input is a **raw scalar** (keyed scalar, decoded scalar); its output an **engineering value** (transformed value, semantic value) | ASAM MCD-2 MC (A2L) _computation method_; _scaling_; _engineering unit conversion_; SunSpec _scale factor_ applies here |
| **Expression** | one calculation over one or more inputs, evaluated wherever a step needs a value — `present_if` and `count` while extracting, a checksum at `verify`, scale by reference at `transform`. Its inputs resolve as **References** does | Formula; computed value | Kaitai Struct _expression_ — `if`, `size`, `repeat-expr`, `value` instance; ASAM MCD-2 MC (A2L) _formula_; XPath, SHACL _expression_ |
| **Observes** | the measurand a field reads — a feature of interest (`feature_type` + `role`), its part, and the quantity kind; resolves to an interval. An enum-valued field feeds a **channel** instead; its flag labels mint the channel's members. The publisher's fact, on the catalog field | target; mapping; binding; `PointTarget`; `PointMapping` | SOSA `observes` an _observable property_ of a _feature of interest_ |
| **Adapter** | one node reading another node's service, and publishing what it decodes | ingest. `admit` is its device side and `link` the transport under it; `emit` is its downstream side, naming sinks | _gateway_; _protocol converter_; _data concentrator_; Modbus _master_ / _client_ names only the polling case |
| **Link** | one adapter's transport to a device — whatever that interface type takes: serial baud, parity, stop bits; TCP port and unit id, over the address its site holds | Connection; endpoint. `line settings` is the serial case | ISO/IEC 7498-1 _data link_; Modbus _serial line_ and _TCP/IP_; OPC UA _endpoint_ |
| **Device** | one catalogued thing: its interfaces, services and points. No deployment in it | node | — |
| **Interface** | the port a device declares — type, rated rate, and the protocol a service binds | — | — |
| **Service** | what a device offers on an interface: one pipeline | — | OPC UA _service_ |
| **Site** | a building or installation — the units it owns (inventory), serial numbers, and the address, MAC and name each answers to | — | — |

**Attributes.** A PDU is **solicited** or **unsolicited** — whether reading it takes a request; unsolicited identity comes from the octets. An adapter has a **read mode**: polling master, passive tap, duplex. A point has a **kind** (`measurement`, `setting`, `state`) and an **access mode** (`r` / `rw` / `wo`). A field has a **sentinel**, the raw value meaning absent, tested before scaling. **Discovery** resolves which catalog sits on the wire before reading a point.

**References.** A field resolves against a sibling at **extraction time** (`count`, `size`, `at`, `present_if`, a discriminator) or at **transform time** (scale factor, exponent, unit code — SunSpec `sunssf`, scale by reference). Narrowest first: `field_name` in the same PDU, `label.field_name` from an earlier step, `retained.label.field_name` from an earlier pass.

## Defined in detail

- **node**, **permalink**, **slug** ([levels.md](levels.md))
- **facet**, **feature**, **NodeType** ([facets.md](facets.md))
- **feature of interest** ([features.yaml](../linkml/features.yaml))
- **interval**, **quantity kind**, **measurement channel** ([intervals.md](intervals.md))
- **part**, `count`, `part_set` ([parts.md](parts.md))
- **Channel**, **DomainMember** ([values.yaml](../linkml/values.yaml))

## Abbreviations

Expanded here, used bare elsewhere.

| short | expands to                                                                              |
| ----- | --------------------------------------------------------------------------------------- |
| AIS   | Automatic Identification System                                                         |
| CAN   | Controller Area Network                                                                 |
| COBS  | Consistent Overhead Byte Stuffing                                                       |
| CRC   | cyclic redundancy check                                                                 |
| DBC   | the CAN database file format                                                            |
| HID   | Human Interface Device                                                                  |
| MQTT  | Message Queuing Telemetry Transport                                                     |
| NMEA  | National Marine Electronics Association — 0183 and 2000 are two protocols, not versions |
| PDU   | protocol data unit                                                                      |
| PGN   | parameter group number (NMEA 2000, J1939)                                               |
| SLIP  | Serial Line Internet Protocol                                                           |
