# @nodeve/schema

Hardware catalog schema as a **relational** model, authored in [LinkML](https://linkml.io). One source projects to SQL DDL, JSON Schema, TS types, and Pydantic.

Replaces grimoire's *shape* layer. See [levels.md](docs/levels.md) for the level grammar.

## Files

| file | is |
| --- | --- |
| `linkml/nodeve.yaml` | the schema — classes = tables |
| `linkml/nodeve-slots.yaml` | slots + enums, imported by the above |
| `format.ts` | sort + desugar gate over the yaml (`--check` for precommit) |
| `project-overlay.ts` | registry rows → `gen/nodeve-projected.yaml`, the validation overlay |
| `check-refs.ts` | resolves one sample IRI per registry — network, so NOT in the gate (`pnpm check:refs`) |
| `bundle.ts` | sharded rows → `gen/catalog.yaml`, the one root object `linkml-sqldb` ingests |
| `data/<table>/<slug>.yaml` | one file per authored thing, dir per class — `device_model/`, `device_type/`, `feature_type/` |
| `data/registry/`, `data/quantity_kind/` | bulk vocabularies — QUDT-derived, seeded once from grimoire (now deleted). Authored here |
| `data/nodes.yaml` | the mint ledger — flat, not an entry; `format.ts` appends, never re-derives |
| `gen/` | every build output — DDL, overlay, catalog bundle, SQLite db. Gitignored |

## Commands

```sh
pnpm build      # generate → DDL → SQLite (1.3s, 1.2 MB db)
pnpm generate   # overlay + format + bundle, no python
pnpm validate   # a device model against its generated stencil
pnpm check      # format gate (--check), what precommit runs
pnpm check:refs # do registry iri_templates actually resolve? (network)
```

`linkml-*` resolve imports relative to **CWD**, not the schema file — every python
step runs from `linkml/`. That is what the `cd` in each script is for.

LinkML is not in nixpkgs; `uv` is in the flake and `uvx` fetches it.

## Design

Reusable tables that device types assemble — not wide tables repeating column names.

| grimoire | LinkML | note |
| --- | --- | --- |
| property | slot | global-by-default — the invariant grimoire hand-enforces is native |
| prop overlay | `slot_usage` | per-class refinement, no fork |
| (anti-slop rule) | zero `attributes:` | attributes = anonymous class-local slots; banned — every field is a global slot, one generic name (`range_kind`, not `kind`) |
| feature | class → table | `AcPort` is ONE table; out/grid/eps/load are four FKs to it |
| quantity_kind enum | `QuantityKind` table + `Ref` rows | enums can't be refined — `is_a` on an enum neither constrains nor inherits, so a typo'd projected value silently becomes a new permissible value. Master list is rows; every citation is an FK |
| `refs:` block | `Ref` → `Registry` tables | the ONE way a row links out. LinkML's `exact_mappings:` annotates SCHEMA elements; these are DATA, so mappings are data. `match` stays an enum — closed SKOS grammar |
| socket contract | `SocketBinding` rows | role vocabularies + required-ness projected from these, not hand-written |
| archetype | `DeviceType` row + projection | see [levels.md](docs/levels.md) — validation above the DB, not a table |
| `product:` block + mfr cascade | `Product` → `Manufacturer` tables | cascade = shared FK row |
| `compose` | `is_a` / `mixins` | single inheritance + mixins cover current uses |
| part (l1/l2/l3) | `Part` row FK | new part kind = new ROW, never a column. Schema enums stay only for closed grammar (rating, severity, lang) |
| i18n keys (en/pt) | `Content(lang)` rows | one reusable [title, lede, body, lang] table |
| repeated + instances | `ordinal` column | null = default template row; set = sparse override |
| energy channels | `flow_direction` + `period` columns | four rows on one kind |
| combined vs per-leg | `part` nullity + `part_scope` | combined = all discriminators absent; enforced via `value_presence` |
| modbus block | `RegisterMap`, own table | many products FK one family map — comms out of the device |

### Ingest

`data/` rows → `gen/catalog.yaml` (one root object, `Catalog` is `tree_root`) →
`linkml-sqldb dump` → `gen/catalog.db`. No hand-written loader. `bundle.ts` reads
the slot→dir mapping off the `Catalog` class itself: each bundle slot's range
names a class, that class's `sql_table` names its data dir.

`Catalog` is the ONE sanctioned `attributes:` — a container's bundle slots, not
domain fields. It costs an empty one-row table nothing FKs.

### Identity

Every class `is_a Node` — one id space. A slot with `range: Node` takes any entity, a 1:1 extension reuses its owner's id (shared PK), and minting is one table's business.

`gen-sqltables` FLATTENS inheritance: each table repeats `id` as its own PK with no emitted `FOREIGN KEY (id) REFERENCES Node(id)`. One-line-per-table DDL post-step, or `gen-sqla` joined-table inheritance. The schema carries the intent, not the constraint.

### PK/FK

- single-valued object slot → FK column on the parent (`Inverter.ac_out_id`)
- multivalued inlined slot → backref FK on the child (`Interval."AcPort_id"`)

## Open

- **No metaclass.** Layer discipline (feature never carries slots-of-classes, device type never carries scalar slots) stays a lint, not a schema fact.
- **Table names are the class name** — quoted PascalCase (`"DeviceModel"`). Every class carries `annotations: sql_table:` with the intended snake_case name; no generator reads it yet (`alias:` on a class is silently ignored). A DDL post-step or `gen-sqla` naming applies it.
- **Backref FK columns are quoted PascalCase** (`"AcPort_id"`); `Content` grows one nullable FK per referencing class. A production cut wants explicit association classes or tuned `gen-sqla` naming.
- **Overlapping backref FKs.** `ac_ports` / `dc_ports` / `environments` all copy `DeviceModel.node` into one `FeatureOfInterest.DeviceModel_node`; SQLAlchemy warns on every dump. Loads correctly today, but wants explicit association classes before it is load-bearing.
- **61 kinds are deprecated upstream**, now flagged with `replaced_by`. Nothing prefers the replacement yet — a binding may still cite a superseded kind, and only the flag says so.
- **9 registry `iri_template`s are untested** (`brick`, `cim`, `saref4grid`, `seas`, `skos`, `sosa`, `ssn`, `ssn-system`, `vim`) — no ref samples them, so `check:refs` cannot exercise them. The QUDT one was 404ing undetected until it was.
- **Kind-level value domains are dropped.** grimoire's per-kind `schema:` block (`count` integer >= 1, `mass` > 0) fed the old JSON-Schema shape layer. `ValuedRange` already owns bounds, and a kind-level floor is only checkable by joining Interval → ValuedRange → QuantityKind. If it matters, it is an owned check, not columns.
- **Cross-row semantics are not LinkML's.** `gated_by`, interval bounds within envelope, offered-kinds-only — LinkML validates shape. Those stay owned checks.
- **Upstream codes were discarded at seed time.** grimoire registries carry their own `code` (`wikidata: JDV86GJS`); the ledger minted fresh ones from the permalink, so the same thing has two handles until grimoire is gone.
- **`code` is 40 bits.** No collisions at 1247 rows, but it is a birthday problem — ~1-in-2000 odds by 50k rows, near-certain by 1M. `format.ts` does not check; a collision would mint a duplicate silently.
- **Desugaring is owned**, in `format.ts`: sugared yaml in, canonical rows out, `linkml-validate` sees only the flat form.
- **`mintNodes` reads a top-level `archetype` key**; data rows carry `device_type`. Stale rename — verify it still mints.
