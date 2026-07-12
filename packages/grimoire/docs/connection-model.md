# Connection model — the layered vocabulary & its standards crosswalk

How grimoire describes a device's connection: as a **stack of typed layers**, each layer a separate field that borrows its _value_ from a recognized registry. This doc is the crosswalk the package convention requires — it says which part of the model lifts a registry verbatim, and which part is our own decomposition (hence documented here rather than left implicit).

## The layers

| layer | field | values | value registry (normative) |
| --- | --- | --- | --- |
| application | `application_protocol` | modbus, vedirect, usbhid | modbus.org / Victron / USB-IF |
| transport | `transport_protocol` | tcp, udp | IANA protocol numbers |
| interface (management class) | `interface_type` | async_serial, usb, ethernet_csmacd, can | IANA ifType (IF-MIB); `async_serial` → ifType 33 (IANA names it `rs232`); `can` → ISO 11898-1 (no ifType entry) |
| physical (signalling) | `physical_layer` | rs485, rs232, ttl_5v, ttl_3v3, can_hs, current_loop_4_20ma, voltage_0_10v | per-member: TIA / JEDEC / ISO 11898-2 / IEC 60381 |

The `physical_layer` axis (ISO/IEC 7498-1 layer 1) is **one** axis, not a per-medium concept: digital signalling (RS-485/232, TTL, CAN's high-speed PHY) and analog process signals (4-20 mA, 0-10 V) all answer the same question — how a symbol is electrically carried — so they are members of one vocab, each crosswalked to its own defining standard. The analog members are pure physical layer with **nothing above them** (a 4-20 mA sensor has no `application_protocol` / framing — its current _is_ the value); that's honest, not a gap. CAN is the inverse: a self-framing link, so it's an `interface_type` of its own _and_ carries its differential PHY (`can_hs`) on the physical-layer axis.

### `interface_type` vs `physical_layer` are orthogonal, not duplicates

These two read similarly (and IANA's misnaming of ifType 33 as `rs232` invites the confusion), but they vary **independently** — the mapping is many-to-many, which is what makes them two axes rather than one:

- **one interface over many physical layers:** `async_serial` runs over `rs232` _or_ `rs485` _or_ `ttl_5v` _or_ `ttl_3v3` — one link discipline (a UART framing bytes), four electrical layers (and RS-485 isn't even serial-specific electrically — it also carries Profibus, DMX512); likewise `can` runs over `can_hs` (ISO 11898-2) _or_ fault-tolerant low-speed (11898-3).
- **one physical layer under many interfaces:** the reverse holds too — RS-485 carrying async-serial, Profibus, or DMX512 above it — which is what makes the mapping many-to-many rather than a renamed one-to-one.

So `interface_type` = the link/framing discipline (IANA ifType); `physical_layer` = the electrical signalling beneath it (ISO/IEC 7498-1 L1). Neither derives from the other. To keep them legible we code the async-serial interface `async_serial` (not `rs232`) — the only `rs232` token in the model is on `physical_layer`, where it means TIA-232-F. The ifType `rs232` name survives as the `refs` crosswalk.

Each field name is **global** — one meaning everywhere. That's why the two protocol layers are `application_protocol` / `transport_protocol`, never both bare `protocol`: the system speaks protocols at more than one layer, and a field name may not mean two things.

## What's normative vs. informative

Three distinct roles, kept apart on purpose:

- **Normative — what governs a field's value (carries a `ref`):** the per-axis _value_ registry above. An enumeration value is always a ref-backed value on a prop, never an object key (the rdf:type anti-pattern). This layer is a clean standards lift and is the part you can rely on programmatically.
- **Layering basis — why these axes stack the way they do (citable, but governs structure not values):**
  - **IETF IF-MIB `ifStackTable`, RFC 2863** — the actual published model of "a connection is a stack of typed sub-layers, lower under higher." Our `interface_type` already cites the same IANA ifType family, so the stacking concept comes from the same place as its values, not from OSI.
  - **IETF Internet model, RFC 1122** (link / internet / transport / application) — the citable frame for the IP-riding subset. When we say `transport_protocol` is "the transport layer," this is the standard meant, _not_ "OSI L4." RFC 1122's transport layer is exactly the IANA-protocol thing.
  - **Each application protocol self-identifies its layer in its own spec** — the Modbus Application Protocol spec places Modbus at the application layer over serial or TCP; USB-HID rides the USB spec's own function/device/bus layering. We don't need an external model to justify "modbus is L7."
- **Informative — reader shorthand only (NEVER a `ref`):** OSI layer numbers ("OSI-ish L7"). OSI is a reference abstraction, not a registry — you can't `$ref` it and it doesn't govern our field set. It stays as a lingua-franca hint in prose because it's the most widely-understood map that spans the whole range (app payload down to RS-485 volts), and nothing else covers all four axes at once. A comprehension aid, not a justification. Do not let "L4/L7" _stand in for_ the citations above.

## Where our decomposition is ours (and why that's allowed)

The registries hand us value pools; they do **not** dictate "a connection is a 4-tuple of these axes." That decomposition is ours. The two deliberate divergences:

1. **`physical_layer` split out from `interface_type`.** IANA ifType collapses all async serial into `rs232(33)` — a _management-layer_ classification, not a physical claim. TTL UART, RS-485, and true RS-232 all classify `rs232`. We re-introduce the electrical signalling layer as the orthogonal `physical_layer` axis (one vocab spanning rs485/rs232 → TIA, ttl*5v/ttl_3v3 → JEDEC JESD8, can_hs → ISO 11898-2, 4-20 mA/0-10 V → IEC 60381). This out-models ifType on purpose — but every member still carries a \_real* standard ref; there is no "de-facto, no-ref" member.
2. **`application_protocol` as a first-class layer.** Two of its three members (vedirect, usbhid) are vendor-proprietary, not open standards — each carries a crosswalk to its defining spec rather than a pretence of a neutral registry.

Per the package rule (borrow the standard; carry the crosswalk for anything coined), this doc _is_ that crosswalk: the four-layer decomposition is our model, it borrows its values, and RFC 2863 + RFC 1122 + each protocol's own spec back its stacking.

The [container-decomposition planning doc](../concepts/communication_protocol_standards.md) plans axes beyond these four (standard identity, connector, cable, data-link/network detail); this doc describes only the live model.
