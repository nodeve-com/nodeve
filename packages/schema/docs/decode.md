# Decode

Think CCSDS SOIS Electronic Data Sheets (SEDS), but easier to author.

One PDU catalog of points over an ordered pipeline. Reading and writing devices, every protocol, one table set. Whoever publishes a measurand defines it once; many devices reference it.

Terms: [glossary.md](glossary.md). Still to replace: grimoire's `usbhid_*` — the M4-ATX diag poll and config plane.

## Constructs

| construct | holds | class |
| --- | --- | --- |
| **PDU catalog** | wire config, declared once: register type, word order, endianness, endpoints | `PduCatalog` |
| **PDU** | ordered steps, ordered fields | — |
| **Field** | address, datatype, width, role | `PduField` |
| **Transform** | scale, offset, decimals, sentinel, enum lookup | `Transform` |
| **Observes** | feature of interest, part, quantity kind — on the field | `PointTarget` (slot `target`) |
| **Adapter** | `admit`, `emit`, read mode | `Ingest` |

A device references a catalog on its `link_binding`, or names PDUs under `pdu:`.

Three catalogs, three shapes:

- `ve-direct` — 19 keys as a `pdu_field` map, each with a `pdu_placement` keyed `_`.
- `chint` — a `pdu` list, one `start` per PDU; the catalog declares the feature of interest once.
- `foxess` — a `pdu` list, a `placement` list per PDU; a device picks one by `start` and overrides fields under `when`.

The model holds `PduCatalog`, `PduField` and `link_binding.pdu_catalog`. It holds no PDU, no placement, and no device reference to a PDU.

## Layers

```
octets
  ↓  decode — ordered steps, declared per PDU
raw scalars        field → int, float, bool, string, array, bytes, enum
  ↓  transform — per field
engineering value  value + unit, or null
  ↓  map — per point
point              quantity kind, feature slot
```

Three jobs, strictly separated:

- **decode** answers _what bits are there_ — byte layout, nothing else.
- **transform** answers _what the number means_ — arithmetic, never bytes.
- **map** answers _which point it names_ — identity, no arithmetic.

Scale, offset, decimals and sentinel→null are transform. A decode step that scales has broken the model.

Decode emits `(field, scalar)` pairs, never anonymous values.

## Steps

A PDU declares which of the octet-side steps it runs, in order. Only `decode` is mandatory. Each is a row carrying its own parameters. Any step may appear any number of times; each wire authors its own order.

| step | does | cases |
| --- | --- | --- |
| `admit` | take octets off the link | modbus poll, serial listen, CAN tap |
| `frame` | find PDU boundaries; carry the request when there is one | modbus span, HID poll, VE.Direct block, NMEA `$`…`*hh` |
| `verify` | check the declared checksum | NMEA XOR, CRC-16, Fletcher |
| `decapsulate` | hand a range on as its own PDU, addressed from zero, through a codec when one wraps it | NMEA 2000 29-bit CAN id → PGN; AIS 6-bit de-armor; AIS payload inside `!AIVDM` |
| `reassemble` | join fragments into one byte source | AIS multi-fragment, NMEA 2000 fast-packet |
| `decode` | positional or keyed fields → raw scalars | every protocol |

Kaitai Struct is the reference for this layer. It covers `decode` and `decapsulate` natively, and reaches neither `frame` nor `reassemble`, which act on the byte stream before a Kaitai stream exists. It has no scale and no unit: `transform` starts where Kaitai stops.

## Adapter

Adapter is a role, not a kind of node. A node adapts another when its `admit` names that node's device and service. The adapting node is a device itself — a gateway, an ESPHome board — and is adaptable in turn.

Read mode is the adapter's alone, and is the fork the word earns: same device, same catalog, a polling master and a passive tap are two adapters.

## Encode

The inverse — value → scalar → octets. No second mechanism: a write plane is a PDU whose fields are writable, with an access mode per point.
