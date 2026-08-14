# Replaced

Five in schema classes fold into new constructs. Nothing maps protocol to protocol: each construct takes rows from all three, which is the whole claim.

| replaced | lands on | note |
| --- | --- | --- |
| `RegisterMap` | PduCatalog · PduVariant | LANDED — `register_type` per variant, `word_order` per catalog; the map itself was per-device and is not |
| `RegisterRange` | Message | a span is a message |
| `ModbusRegister` | PduField · PduPlacement · PointMapping | LANDED — key and quantity → field; address, datatype, scale, decimals, unit → placement; the interval → mapping, on the device |
| `RegisterFlag` | PduFlag | LANDED — bit → the publisher's label, on the placement; the device's channel members mint from those labels |
| `VedirectField` | PduField · PduPlacement · PointMapping | LANDED — a field on the shared `PduCatalog`, its one placement keyed `_`, the mapping on the device |
| `usbhid_link` | Model · Message | endpoints, transfer and timeout → Model; the diag poll → Message |
| `usbhid_numeric` | Model · Transform | `byte_order` → Model; `scale_overrides` → Transform by reference |
| `usbhid_field` / `usbhid_fields` | Point · Transform · Binding |  |
| `usbhid_config` | Message | a get/set exchange over the same endpoints — magic byte `0x31` against the diag poll's `0x21` |
| `usbhid_params` | Point, on that message | addressed by index; its `sentinel` is Transform |

They were already copies by their authors' own account: `usbhid_field` calls itself "the USB-HID analogue of modbus_registers", and the `usbhid` archetype "mirrors the modbus medium".

`usbhid_config` and `usbhid_params` settle Encode. A write plane is not a second mechanism — a message whose points are writable.

## Nothing left to hold

`individual_read` and `invalid` exist only because no Message row does.

- `individual_read` says _do not pack these_ → a message of one point.
- `invalid` says _do not bridge this gap_ → a message covers a region or it does not. The reason rides `note`.

The foxess map authors `invalid`, and nothing reads it; familiar's `packages/site/registers.ts` filters `individual_read` alone. A fact with no consumer is what a missing construct looks like.

## Cost

Authored messages replace a derived grouping, so a reverse-engineered map gains real authoring work — foxess's 113 registers become explicit spans. A published model ships its own messages and gains none.
