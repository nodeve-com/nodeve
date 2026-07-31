# Decode

One PDU catalog of points over an ordered pipeline. Reading and writing devices, every protocol, one table set. Whoever publishes a measurand defines it once; many devices reference it.

Terms: [glossary.md](glossary.md). Classes this replaces: [decode-replaces.md](decode-replaces.md).

## Constructs

| construct | holds | class |
| --- | --- | --- |
| **PDU catalog** | wire config, declared once: register type, word order, endianness, endpoints | `PduCatalog` |
| **PDU** | ordered steps, ordered fields | — |
| **Field** | address, datatype, width, role | `PduField` |
| **Transform** | scale, offset, decimals, sentinel, enum lookup | `Transform` |
| **Mapping** | one field → one interval of one device, and its `part` | `PointMapping` |
| **Adapter** | `admit`, `emit`, read mode | `Ingest` |

A device authors none of them. It references catalogs at a base, binds each to a feature, and the points expand.

VE.Direct runs on these today. One `ve-direct` catalog published by Victron holds all 19 keys; `Transform` rows hold the arithmetic; the MPPT 100/30 authors four mappings on a `link_binding` naming that catalog. The PDU level lands with modbus spans — VE.Direct's block is one PDU, and one row with no steps on it decides nothing.

Modbus is next onto these tables: map → catalog, spans → PDUs, `RegisterDatatype`'s `uint16` → `uint` + a width, and the interval FKs → the device's mappings. That last move is what makes a shared map shared — today a family-wide map carries one device's interval FKs, and `walkDevices` keeps whichever device walked first.

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
- **transform** answers _what the number means_ — arithmetic and units, never bytes.
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
| `decapsulate` | hand a range on as its own PDU, addressed from zero | NMEA 2000 29-bit CAN id → PGN; AIS 6-bit de-armor; AIS payload inside `!AIVDM` |
| `reassemble` | join fragments into one byte source | AIS multi-fragment, NMEA 2000 fast-packet |
| `decode` | positional or keyed fields → raw scalars | every protocol |

## Adapter

Adapter is a role, not a kind of node. A node adapts another when its `admit` names that node's device and service. The adapting node is a device itself — a gateway, an ESPHome board — and is adaptable in turn.

Read mode is the adapter's alone, and is the fork the word earns: same device, same catalog, a polling master and a passive tap are two adapters.

## Encode

The inverse — value → scalar → octets. No second mechanism: a write plane is a PDU whose fields are writable, with an access mode per point.
