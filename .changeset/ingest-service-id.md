---
'@nodeve/grimoire': minor
---

`ingest.service_id`: new optional pointer naming which of the ingested device's offered `services` a polled-master adapter dials (slug into that device's own `services`, mirroring `network_interface_id`). Unblocks `platform: telegraf` site adapters, whose bundles carried `service_id` from before the schema gate.
