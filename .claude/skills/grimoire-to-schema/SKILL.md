---
name: grimoire-to-schema
description: Port a device/concept from the dying @nodeve/grimoire package to @nodeve/schema (LinkML). Use when moving a catalog device, feature, or concept out of packages/grimoire into packages/schema — "move X from grimoire to schema", "port the Chint meter", "migrate this grimoire entry". @nodeve/schema replaces grimoire; nothing new lands there.
---

# Move a thing from grimoire → schema

Grimoire (`packages/grimoire`) is dying; `@nodeve/schema` (LinkML, relational) replaces it. Author a device as a **directory of yaml chunks** under `data/subject_node/<slug>/`, mirroring the FoxESS fixture. Everything is DATA + generated projections — never re-author shape.

## NEVER DROP DATA — no exceptions

A migration MUST carry EVERY authored field across. You do NOT know the downstream consumers, so "nothing consumes it" is NEVER a reason to drop a field. If the schema lacks a home for a grimoire field (a blend's `composition`, a formula, a rating condition), **ADD schema to hold it** — a slot, a facet, a child table. Schema is pre-1.0; reshape freely. Do NOT drop, "defer", or silently flatten. Model complexity is not a reason to lose data. Before finishing, diff source against emitted and account for every key. If you truly cannot model something, STOP and ask — never discard. Dropping data is an irreversible failure, on par with duplication.

**Read first:** `packages/schema/README.md`, `packages/schema/docs/mapping.md` (grimoire→LinkML table), and `packages/schema/docs/levels.md`. Reference fixtures: `data/subject_node/foxess-h3-ps10sh/` (full: features + register map + network) and `data/subject_node/chint-dtsu666-4wire/` (meter). For a pure-spec device (PV module, no registers) `data/subject_node/twmnh-66hd640/` is the minimal example.

## The mapping (grimoire → schema)

| grimoire | schema |
| --- | --- |
| archetype | `data/node_type/<slug>.yaml` — `facet:` map (product/feature_of_interest/register_map/network_interface/service_binding → `{cardinality, required?}`). Roles are NOT enumerated here; a model states its own. New node type (e.g. `pv-module`) = new file here. |
| feature | `data/feature_type/<slug>.yaml` — `quantity_binding` map (allowed kinds); `bound_as` (ac_ports/dc_ports/environments) |
| catalog entry | `data/subject_node/<slug>/` dir of chunks |
| `product:` + mfr `_defaults` | `product:` block (`organization` bare slug) + `data/organization/<slug>.yaml` (often already exists) |
| feature_spec intervals | `feature_of_interest:` tree (see below) |
| interval_item register link | register `target: {feature:{type,role}, part, quantity, interval?}` |
| settings_schema | `setting: {<knob>: {required, member:[...]}}` |
| parts (a/b/c, l1/l2) | `data/part_set/<slug>.yaml` — `part_set_member` map |
| modbus decode flags | `channel:` block + register `flag:` list |

## Device-model chunk files (dir merges: maps deep-merge, lists concat)

- `model.yaml` — `node_type`, `product` (`organization` bare slug), `setting`, `content.en{title,lede,body}`
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

- **New enum value/enum** → `linkml/enums.yaml` (feature-domain closed grammars: `Zone`, `Rating`, `Severity`, `TestCondition`, …) or the domain file that owns it. Check first — `Zone` already carries `mpp`/`open_circuit`/`short_circuit`, etc.
- **New slot on a class** → define the slot in the domain file (`linkml/modbus.yaml`, `features.yaml`, …) AND list it in the class's `slots:` (e.g. serial RTU framing on `RegisterMap`; `test_condition` on `Condition`). Give object-y slots a `camel:` annotation and a `title:` if user-facing.
- **New facet table** (a keyless 1:1 co-row like `Product`/`Physical`) → class with `sql_table:`, its slots, a `<table>s` slot on the `Catalog` container in `nodeve.yaml` ranging it (the bundle manifest — NOT `SubjectNode.slots`; `Physical`/`Refrigeration` aren't listed there), and a `facet:` entry on the node_type. `plainKey` routes it by `sql_table` (`ownerSlotFor(SubjectNode, cls) ?? key`) — no normalize code (e.g. `Physical`: width/height/thickness/mass; `Refrigeration`: refrigerant).
- **New bulk vocabulary** (a member set a device points AT — grimoire enumeration with refs/substance data, e.g. `refrigerant`) → a TABLE, never a schema enum (a typo'd code must die at the FK gate; refs are DATA). New domain file `linkml/<name>.yaml` (own class + implied-FK slots + facet in ONE file — `linkml/CLAUDE.md`), a `Catalog` slot ranging it, and bulk-load the WHOLE upstream set into `data/<name>/` at once (delegate the mechanical conversion; never add-when-needed). The device references one member by bare slug on a facet FK slot.

**Schema-only vs. normalize code — the seam.** Adding a slot is schema-only by default. The generic `columns()` routes any authored key straight to its column, validated by the slot. A plain scalar/enum passes through. A **global-vocab FK value** (bare slug → CURIE: `organization: emelson`, `refrigerant: r290`) now expands generically via `expandFk`, ZERO code. NEVER name a scalar or global-FK slot in `normalize/*.ts`. Touch the normalizer ONLY when the authored form is sugar the column shape can't express. Two cases. One: a value ASSEMBLED from decomposed coordinates (an interval FK from `feature/part/quantity`, a `setting`+`equals` gate). Two: an IN-DOC sibling FK resolved against the device's own rows, not a global table (`service_binding.network_interface` → `SIBLING_FK`). These are the sole reason `values.ts gate()` and `SIBLING_FK` exist; a plain axis or global-vocab FK needs none.

## Verify

```sh
cd packages/schema
pnpm generate   # format → normalize → data2schema; register resolution runs here
pnpm build      # generate + types + linkml-validate catalog + DDL + sqlite
```

`pnpm build` runs `linkml-validate -C Catalog gen/catalog.json` — the real end-to-end gate ("No issues found"). Register mis-links throw during `generate`. Then spot-check:

```sh
node -e 'const d=require("./gen/catalog.json").subject_nodes.find(m=>/<slug>/.test(m.node));
  console.log(d.node, d.dc_ports?.map(f=>f.role))'
```

(entries key off `node` — `node:<node-type>/<slug>` — not a bare `slug` field; `ac_ports`/`dc_ports`/`environments` may be absent, so optional-chain them.)

- `pnpm validate` hardcodes a single FILE path and breaks on directory models — ignore it; `pnpm build` is the gate.
- SAWarnings about overlapping backref FKs (`ac_ports`/`dc_ports`/`environments`) are pre-existing (README "Open") — not your change.

## Finish

`git rm` the grimoire source (`packages/grimoire/concepts/catalog/<vendor>/*.yaml`, `_defaults.yaml`) and remove the now-empty dir. Do NOT commit unless asked (user says when done).
