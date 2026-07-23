# @nodeve/schema

Source of truth for **describing things**. [LinkML](https://linkml.io) schemas. Authored data normalized to rows; projections generate SQL DDL, validation schemas, program types, and databases. Replaces `@nodeve/grimoire`.

## Status

Pre-1.0: break schema, data shape, and DDL freely — no deprecation, no migrations. Reshape, don't accrete.

## [Facets](docs/facets.md)

We intend for the database schema to be flexible and able to contain any kind of Thing (NodeType). Narrow SQL tables are facets, composed to include required properties needed to define a named Thing. Singular facets share a PK with the `node` table.

1. Every addressable thing → one `node` row; every pointer target has one.
2. Facets are 1:1 extensions of the `node` — no separate id space.
3. Any many-to-one relationship requires a unique node rows.
4. The database defines NodeType.

## Files

| file | is |
| --- | --- |
| `linkml/nodeve.yaml` | schema root — prefixes, defaults, import assembly |
| `linkml/{core,taxonomy,features,product,network,modbus}.yaml` | domain classes with owned slots |
| `linkml/shared.yaml` | shared slots |
| `linkml/enums.yaml` | shared closed-grammar enums |
| `bin/format.ts` | yaml formatting gate (`--check` for precommit) |
| `bin/check-refs.ts` | resolves one sample IRI per registry — network, so ungated (`pnpm check:refs`) |
| `normalize/catalog.ts` | THE normalizer — authored docs → rows → `gen/catalog.json`, the root object `linkml-sqldb` ingests; pass a data file to print rows |
| `bin/ddl.py` | DDL **and** database — replaces `gen-sqltables` + `linkml-sqldb`, which expose no backref-column hook |
| `data/device_model/<slug>.yaml` | authored nested device descriptions; FoxESS is the migration fixture |
| `data/<table>/<slug>.yaml` | authored vocabulary + policy rows. **Placeholder fixtures — not normative** |
| `data/registry/`, `data/quantity_kind/` | bulk QUDT-derived vocabularies, seeded once from grimoire |
| `gen/` | all build output — DDL, catalog bundle, SQLite db. Gitignored |

## Commands

```sh
pnpm build      # generate → DDL → SQLite (1.3s, 1.2 MB db)
pnpm generate   # format → normalize, no python
pnpm validate   # device model against the schema
pnpm check      # format gate (--check), what precommit runs
pnpm check:refs # registry iri_templates resolve? (network)
```

`linkml-*` resolve imports relative to **CWD**, not the schema file — every python step runs from `linkml/` (the `cd` in each script). LinkML skips nixpkgs; `uv` sits in the flake, `uvx` fetches it.

## Design

- [levels.md](docs/levels.md) (identity path grammar)
- [authoring-storage.md](docs/authoring-storage.md) (authored docs → schema-checked rows), [pipeline.md](docs/pipeline.md) (pipeline stages).
- [overlay.md](docs/overlay.md) — device types as an overlay over the reusable table core: socket constraints enforced at normalize today, `required` and row-projection still inert, load path still intent.
- [mapping.md](docs/mapping.md) — every grimoire construct → its LinkML landing, plus identity and PK/FK rules.
- [open.md](docs/open.md) — known gaps and deliberate deferrals (no metaclass, overlapping backref FKs, untested registries, `code` collision risk, …).
