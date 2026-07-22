---
name: grimoire-to-schema
description: Port a device/concept from the dying @nodeve/grimoire package to @nodeve/schema (LinkML). Use when moving a catalog device, feature, or concept out of packages/grimoire into packages/schema — "move X from grimoire to schema", "port the Chint meter", "migrate this grimoire entry". @nodeve/schema replaces grimoire; nothing new lands there.
---

# Move a thing from grimoire → schema

Grimoire (`packages/grimoire`) is dying; `@nodeve/schema` (LinkML, relational) replaces it. Author a device as a **directory of yaml chunks** under `data/device_model/<slug>/`, mirroring the FoxESS fixture. Everything is DATA + generated projections — never re-author shape.

**Read first:** `packages/schema/README.md` (the grimoire→LinkML mapping table + invariants) and `packages/schema/docs/levels.md`. The FoxESS entry `data/device_model/foxess-h3-ps10sh/` is the reference — copy its shapes.

## The mapping (grimoire → schema)

| grimoire | schema |
| --- | --- |
| archetype | `data/device_type/<slug>.yaml` — `socket_binding` map (role → feature_type, required?) |
| feature | `data/feature_type/<slug>.yaml` — `quantity_binding` map (allowed kinds); `bound_as` (ac_ports/dc_ports/environments) |
| catalog entry | `data/device_model/<slug>/` dir of chunks |
| `product:` + mfr `_defaults` | `product:` block + `data/manufacturer/<slug>.yaml` |
| feature_spec intervals | `feature_of_interest:` tree (see below) |
| interval_item register link | register `target: {feature:{type,role}, part, quantity, interval?}` |
| settings_schema | `setting: {<knob>: {required, member:[...]}}` |
| parts (a/b/c, l1/l2) | `data/part_set/<slug>.yaml` — `part_set_member` map |
| modbus decode flags | `channel:` block + register `flag:` list |

## Device-model chunk files (dir merges: maps deep-merge, lists concat)

- `model.yaml` — `device_type`, `product` (`manufacturer` bare slug), `setting`, `content.en{title,lede,body}`
- `feature-*.yaml` — the `feature_of_interest:` tree
- `register-map.yaml` — `register_map:` scalars (`slug`, `unit_id`, `register_type`, `word_order`, + serial framing for RTU)
- `registers-*.yaml` — each carries `register_map: {register: [...]}`; the lists concat into ONE map. Split by bank/subsystem.
- move any `.md` notes with `git mv`

## feature_of_interest tree

```yaml
feature_of_interest:
  <feature_type>: # e.g. ac-phase
    <role>: # a socket_binding role of the device_type
      $: { part_set: <slug> } # or { count: N }; omit if no parts
      _: { <quantity>: { <islug>: { facets } } } # _ = COMBINED (part null)
      '*': { <quantity>: { <islug>: { facets } } } # per-part DEFAULT template
      a: {} # part rows (empty = exists, carries no own interval)
      b: {}
```

- **Interval facets:** `valued_range` (point+band), `specification` (behavioural: rating/zone/severity/conditions), `measurement` (measurable channel: resolution/flow_direction/period). An interval is **measurable iff it has a `measurement` facet**.
- **Band sugar:** `value` + `margin_lower/upper` (relative fraction) or `tolerance_*` (absolute) → min/max derived. `fraction_*` auto-renames to `margin_*`.
- **Register target → interval resolution** (`normalize/registers.ts intervalRef`):
  - `interval:` given → that named interval slug (exact part, then `*`).
  - `interval:` omitted → the ONE measurable interval of (feature, part, quantity); exact part first, else the `*` default. Must resolve to **exactly one** — 0 or 2 measurable intervals throws.
  - `part: _` = combined; omit part ⇒ `_`.
- Two register banks reading the same measurand → both omit `interval`, both resolve to the SAME `measured` interval (differ only in scale/decimals/unit). No duplication.

## ZERO-duplication rule (CLAUDE.md is absolute here)

Put a per-part interval shared across a/b/c under `'*'` ONCE. When per-part specs genuinely differ (per-phase nominal 220 vs line-to-line 380), split into **two roles/features** (`phase` + `line`), each with its own `'*'`. Never repeat a block across a/b/c.

## Schema gaps: extend, don't work around

Schema is pre-1.0 — reshape freely, no migrations (README "Status"). If grimoire uses something the schema lacks, ADD it:

- **New enum value/enum** → `linkml/shared.yaml` (e.g. `float32` on `RegisterDatatype`; `Parity`/`PhysicalLayer`).
- **New slot on a class** → define the slot in the domain file (`linkml/modbus.yaml` etc.) AND list it in the class's `slots:` (e.g. serial RTU framing on `RegisterMap`). Give object-y slots a `camel:` annotation and a `title:` if user-facing.

## Verify

```sh
cd packages/schema
pnpm generate   # format → normalize → data2schema; register resolution runs here
pnpm build      # generate + types + linkml-validate catalog + DDL + sqlite
```

`pnpm build` runs `linkml-validate -C Catalog gen/catalog.json` — the real end-to-end gate ("No issues found"). Register mis-links throw during `generate`. Then spot-check:

```sh
node -e 'const d=require("./gen/catalog.json").device_models.find(m=>m.slug==="<slug>");
  console.log(d.ac_ports.map(f=>f.role), d.register_map.registers.length)'
```

- `pnpm validate` hardcodes a single FILE path and breaks on directory models — ignore it; `pnpm build` is the gate.
- SAWarnings about overlapping backref FKs (`ac_ports`/`dc_ports`/`environments`) are pre-existing (README "Open") — not your change.

## Finish

`git rm` the grimoire source (`packages/grimoire/concepts/catalog/<vendor>/*.yaml`, `_defaults.yaml`) and remove the now-empty dir. Do NOT commit unless asked (user says when done).
