# @nodeve/schema

Central source of truth for **describing things**. [LinkML](https://linkml.io) schemas validate authored descriptions and normalized storage rows. Generated projections supply SQL DDL, validation schemas, program types, and databases.

Replaces `@nodeve/grimoire`. See [levels.md](docs/levels.md) for the level grammar, [authoring-storage.md](docs/authoring-storage.md) for how authored docs normalize into schema-validated rows, and [pipeline.md](docs/pipeline.md) for the named pipeline stages.

## Status

Break the schema, the data shape, and the generated DDL freely — no deprecation path, no migrations. Reshape rather than accrete.

**`docs/` is normative. `data/` and `gen/` are not.** The docs state how the system is meant to work; the rows are placeholder fixtures that illustrate it, often lagging or plain wrong. Where they disagree the docs win, and the rows are the thing to fix. Never infer a rule from what `data/` happens to contain, and never treat a `gen/` artifact as evidence of intent. Hand-typed ids (`i1`, `vr-m2`) are scaffolding, not a scheme. `data/` is authored-only — nothing generated lives there.

## Invariants

1. Every addressable thing has exactly one row in node; every pointer target has a node row.
2. Multiple facets and 1:1 extensions share their owner's node; they have no separate id space.
3. Children have their own node and reference their parent node.
4. Every interval has an authored slug; `quantity_kind` + `slug` is its key.
5. A row that cannot normalize is underspecified: author its identity axes, not a special case.

Answer identity questions from [levels.md](docs/levels.md) before inventing a scheme.

## Files

| file | is |
| --- | --- |
| `linkml/nodeve.yaml` | schema root — prefixes, defaults, import assembly |
| `linkml/{core,taxonomy,features,product,network,modbus}.yaml` | domain classes with owned slots |
| `linkml/shared.yaml` | shared slots + enums |
| `format.ts` | formatting gate over authored yaml (`--check` for precommit) |
| `data2schema.ts` | binding rows → `gen/nodeve-projected.yaml`, the projected validation schema |
| `check-refs.ts` | resolves one sample IRI per registry — network, so NOT in the gate (`pnpm check:refs`) |
| `normalize/catalog.ts` | THE normalizer — authored docs → normalized rows → `gen/catalog.json`, the one root object `linkml-sqldb` ingests; pass a data file to print its rows |
| `ddl.py` | DDL **and** database — replaces `gen-sqltables` + `linkml-sqldb`, which expose no hook over backref columns |
| `data/device_model/<slug>.yaml` | authored nested device descriptions; FoxESS is the migration fixture |
| `data/<table>/<slug>.yaml` | table-like authored vocabularies and policy rows. **Placeholder fixtures — not normative** |
| `data/registry/`, `data/quantity_kind/` | bulk vocabularies — QUDT-derived, seeded once from grimoire. Authored here |
| `gen/` | every build output — DDL, projected schema, catalog bundle, SQLite db. Gitignored |

## Commands

```sh
pnpm build      # generate → DDL → SQLite (1.3s, 1.2 MB db)
pnpm generate   # format → normalize → data2schema, no python
pnpm validate   # a device model against its generated stencil
pnpm check      # format gate (--check), what precommit runs
pnpm check:refs # do registry iri_templates actually resolve? (network)
```

`linkml-*` resolve imports relative to **CWD**, not the schema file — every python step runs from `linkml/`. That is what the `cd` in each script is for.

LinkML is not in nixpkgs; `uv` is in the flake and `uvx` fetches it.

## Design

Validation ownership: [levels.md](docs/levels.md#validation-across-levels).

Reusable tables that device types assemble — not wide tables repeating column names.

| grimoire | LinkML | note |
| --- | --- | --- |
| property | slot | global-by-default — the invariant grimoire hand-enforces is native |
| prop overlay | `slot_usage` | per-class refinement, no fork |
| (anti-slop rule) | zero domain `attributes:` | attributes = anonymous class-local slots; every domain field is a global slot, one generic name (`range_kind`, not `kind`) |
| feature | class → table | `AcPort` is ONE table; out/grid/eps/load are four FKs to it |
| quantity_kind enum | `QuantityKind` table + `Ref` rows | enums can't be refined — `is_a` on an enum neither constrains nor inherits, so a typo'd projected value silently becomes a new permissible value. Master list is rows; every citation is an FK |
| `refs:` block | `Ref` → `Registry` tables | the ONE way a row links out. LinkML's `exact_mappings:` annotates SCHEMA elements; these are DATA, so mappings are data. `match` stays an enum — closed SKOS grammar |
| socket contract | `SocketBinding` rows | role vocabularies + required-ness projected from these, not hand-written |
| archetype | `DeviceType` + binding rows | projected into a validation class; never a type-specific table |
| `product:` block + mfr cascade | `Product` → `Manufacturer` tables | cascade = shared FK row |
| `compose` | `is_a` / `mixins` | single inheritance + mixins cover current uses |
| part (l1/l2/l3) | `Part` row | new part kind = new ROW, never a column. Schema enums stay only for closed grammar (rating, severity) |
| i18n keys (en/pt) | `Content(language)` rows | localized content with BCP 47 language tags |
| repeated + instances | `Part` rows + `ordinal` | one row per instance; `ordinal` is its sort key, assigned from authored position, never hand-typed |
| energy channels | `flow_direction` + `period` columns | four rows on one kind |
| combined vs per-leg | `part` column, non-null | member slug, `_` = the whole, `*` = the per-part default; the slug pattern produces neither marker |
| modbus block | `RegisterMap`, own table | many products FK one family map — comms out of the device |
| settings_schema | `Setting` + `DomainMember` rows | commissioning knob; a gate FKs the setting AND the member, so a typo'd value dies at the database's FK gate |
| modbus decode | `Channel` + `RegisterFlag` rows | categorical sibling of `Interval` — enum-valued, no quantity_kind. Flag words are registers in the ONE map (`flag:` list, index = bit, null = unidentified); channel members mint from the labels + `empty`. Semantics on the model, wire mapping on the map |

### Identity

Addressable identity, facets, and node paths: [levels.md](docs/levels.md#node--addressable-identity).

### PK/FK

- single-valued object slot → FK column on the parent (`inverter.ac_out_node`)
- multivalued inlined slot → backref FK on the child (`interval.ac_port_node`)

## Open

- **No metaclass.** Layer discipline (feature never carries slots-of-classes, device type never carries scalar slots) stays a lint, not a schema fact.
- **Backref FK columns are named for the parent** (`specification_node`); `content` grows one nullable backref per referencing class. A production cut wants explicit association classes.
- **Overlapping backref FKs.** `ac_ports` / `dc_ports` / `environments` all copy `device_model.node` into one `feature_of_interest.device_model_node`; SQLAlchemy warns on every dump. Loads correctly today, but wants explicit association classes before it is load-bearing.
- **61 kinds are deprecated upstream**, now flagged with `replaced_by`. Nothing prefers the replacement yet — a binding may still cite a superseded kind, and only the flag says so.
- **9 registry `iri_template`s are untested** (`brick`, `cim`, `saref4grid`, `seas`, `skos`, `sosa`, `ssn`, `ssn-system`, `vim`) — no ref samples them, so `check:refs` cannot exercise them. The QUDT one was 404ing undetected until it was.
- **Kind-level value domains are dropped.** grimoire's per-kind `schema:` block (`count` integer >= 1, `mass` > 0) fed the old JSON-Schema shape layer. `ValuedRange` already owns bounds, and a kind-level floor is only checkable by joining Interval → ValuedRange → QuantityKind. If it matters, it is an owned check, not columns.
- **Cross-row semantics are not LinkML's.** `conditions`, interval bounds within envelope, offered-kinds-only — LinkML validates shape. Those stay owned checks.
- **Upstream codes were discarded at seed time.** grimoire registries carry their own `code` (`wikidata: JDV86GJS`); the ledger minted fresh ones from the permalink, so the same thing has two handles until grimoire is gone.
- **`code` is 40 bits.** No collisions at 1247 rows, but it is a birthday problem — ~1-in-2000 odds by 50k rows, near-certain by 1M. `format.ts` does not check; a collision would mint a duplicate silently.
