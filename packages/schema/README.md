# @nodeve/schema

Hardware catalog schema as a **relational** model, authored in [LinkML](https://linkml.io). One source projects to SQL DDL, JSON Schema, TS types, and Pydantic.

Replaces grimoire's *shape* layer. See [levels.md](docs/levels.md) for the level grammar.

## Files

| file | is |
| --- | --- |
| `linkml/nodeve-energy.yaml` | the schema — classes = tables |
| `linkml/nodeve-energy-slots.yaml` | slots + enums, imported by the above |
| `linkml/nodeve-energy-projected.yaml` | validation overlay — per-device-type stencils (`Inverter`). Never generates tables |
| `format.ts` | sort + desugar gate over the yaml (`--check` for precommit) |
| `data/` | rows — one catalog entry, the definition registry, minted nodes |
| `gen/` | SQL exports, gitignored — not a layer we commit yet |

## Commands

```sh
uvx --from linkml linkml-validate -s linkml/nodeve-energy-projected.yaml -C Inverter data/foxess_h3_ps10sh.yaml
uvx --from linkml gen-sqltables linkml/nodeve-energy.yaml > gen/nodeve-energy.sql
node format.ts                                       # sort, desugar, mint nodes
```

LinkML is not in nixpkgs; `uv` is in the flake and `uvx` fetches it.

## Design

Reusable tables that device types assemble — not wide tables repeating column names.

| grimoire | LinkML | note |
| --- | --- | --- |
| property | slot | global-by-default — the invariant grimoire hand-enforces is native |
| prop overlay | `slot_usage` | per-class refinement, no fork |
| (anti-slop rule) | zero `attributes:` | attributes = anonymous class-local slots; banned — every field is a global slot, one generic name (`range_kind`, not `kind`) |
| feature | class → table | `AcPort` is ONE table; out/grid/eps/load are four FKs to it |
| archetype | `DeviceType` row + projection | see [levels.md](docs/levels.md) — validation above the DB, not a table |
| `product:` block + mfr cascade | `Product` → `Manufacturer` tables | cascade = shared FK row |
| `compose` | `is_a` / `mixins` | single inheritance + mixins cover current uses |
| part (l1/l2/l3) | `Part` row FK | new part kind = new ROW, never a column. Schema enums stay only for closed grammar (rating, severity, lang) |
| i18n keys (en/pt) | `Content(lang)` rows | one reusable [title, lede, body, lang] table |
| repeated + instances | `ordinal` column | null = default template row; set = sparse override |
| energy channels | `flow_direction` + `period` columns | four rows on one kind |
| combined vs per-leg | `part` nullity + `part_scope` | combined = all discriminators absent; enforced via `value_presence` |
| modbus block | `RegisterMap`, own table | many products FK one family map — comms out of the device |

### Identity

Every class `is_a Node` — one id space. A slot with `range: Node` takes any entity, a 1:1 extension reuses its owner's id (shared PK), and minting is one table's business.

`gen-sqltables` FLATTENS inheritance: each table repeats `id` as its own PK with no emitted `FOREIGN KEY (id) REFERENCES Node(id)`. One-line-per-table DDL post-step, or `gen-sqla` joined-table inheritance. The schema carries the intent, not the constraint.

### PK/FK

- single-valued object slot → FK column on the parent (`Inverter.ac_out_id`)
- multivalued inlined slot → backref FK on the child (`Interval."AcPort_id"`)

## Open

- **No metaclass.** Layer discipline (feature never carries slots-of-classes, device type never carries scalar slots) stays a lint, not a schema fact.
- **Backref FK columns are quoted CamelCase** (`"AcPort_id"`); `Content` grows one nullable FK per referencing class. A production cut wants explicit association classes or tuned `gen-sqla` naming.
- **Cross-row semantics are not LinkML's.** `gated_by`, interval bounds within envelope, offered-kinds-only — LinkML validates shape. Those stay owned checks.
- **Desugaring is owned**, in `format.ts`: sugared yaml in, canonical rows out, `linkml-validate` sees only the flat form.
- **`mintNodes` reads a top-level `archetype` key**; data rows carry `device_type`. Stale rename — verify it still mints.
