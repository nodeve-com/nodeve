---
name: schema-is-the-source-not-data2schema
description: '@nodeve/schema — author structure in the LinkML schema, never manufacture schema from data rows; YAML→YAML projection is slop'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 5b802928-91c1-4a8b-b6b7-83e00664c434
  modified: 2026-07-22T22:54:57.501Z
---

A LinkML schema holds authored data too — YAML just serializes it, no format wins over another. So authoring a constraint in `data/*.yaml` only to have `data2schema.ts` regenerate it as `gen/nodeve-projected.yaml` (YAML → YAML) is AI slop — the same fact authored twice, backward direction.

**Rule: author structure once, in the schema. Project schema → outward** (DDL, validation, and — if the DB wants the constraint sets as rows — seed rows). Never rows → schema.

Concretely: a device type (`Inverter`) is a schema concept — hand-author it as a LinkML class with `slot_usage` + hand-listed role/quantity enums:

```yaml
Inverter:
  is_a: DeviceModel
  slot_usage:
    role: { range: InverterRole }
```

The only thing `data2schema`'s class/enum projection bought was not retyping an allowed-role list already sitting in `SocketBinding` rows — a DRY win that isn't worth manufacturing structure from data. DRY = put it in the schema. If the database needs it, save the schema AS data.

**How to apply:** delete `data2schema`'s per-device-type class/enum projection; write each device type as a LinkML class. `SocketBinding`/`QuantityBinding` rows stop being the source of truth for structure — they go away or become seed data derived from the schema. Constraints LinkML can't hold (referential integrity — a cited quantity exists) stay SQL FK gates. Same law as [[schema-translations-in-schema]].
