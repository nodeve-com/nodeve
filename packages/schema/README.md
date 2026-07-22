# @nodeve/schema

Single source of truth for **describing things**. [LinkML](https://linkml.io) schemas check authored descriptions and normalized rows; projections generate SQL DDL, validation schemas, program types, and databases. Replaces `@nodeve/grimoire`.

Docs: [levels.md](docs/levels.md) (level grammar), [authoring-storage.md](docs/authoring-storage.md) (authored docs → schema-checked rows), [pipeline.md](docs/pipeline.md) (pipeline stages).

## Status

Pre-1.0: break schema, data shape, and DDL freely — no deprecation, no migrations. Reshape, don't accrete.

**`docs/` normative; `data/` and `gen/` not.** Rows are placeholder fixtures, often lagging or wrong; on conflict docs win — fix the rows. Never infer a rule from `data/`, never read a `gen/` artifact as intent. Hand-typed ids (`i1`, `vr-m2`) scaffold, not a scheme. `data/` holds authored input only.

## Invariants

1. Every addressable thing → one `node` row; every pointer target has one.
2. Facets and 1:1 extensions share the owner's `node` — no separate id space.
3. Children own a `node`, reference the parent's.
4. Every interval carries an authored slug; `quantity_kind` + `slug` keys it.
5. A row that won't normalize lacks identity axes — author them, don't special-case.

Answer identity questions from [levels.md](docs/levels.md) before inventing a scheme.

## Files

| file | is |
| --- | --- |
| `linkml/nodeve.yaml` | schema root — prefixes, defaults, import assembly |
| `linkml/{core,taxonomy,features,product,network,modbus}.yaml` | domain classes with owned slots |
| `linkml/shared.yaml` | shared slots |
| `linkml/enums.yaml` | shared closed-grammar enums |
| `bin/format.ts` | yaml formatting gate (`--check` for precommit) |
| `bin/data2schema.ts` | binding rows → `gen/nodeve-projected.yaml`, the projected validation schema |
| `bin/check-refs.ts` | resolves one sample IRI per registry — network, so ungated (`pnpm check:refs`) |
| `normalize/catalog.ts` | THE normalizer — authored docs → rows → `gen/catalog.json`, the root object `linkml-sqldb` ingests; pass a data file to print rows |
| `bin/ddl.py` | DDL **and** database — replaces `gen-sqltables` + `linkml-sqldb`, which expose no backref-column hook |
| `data/device_model/<slug>.yaml` | authored nested device descriptions; FoxESS is the migration fixture |
| `data/<table>/<slug>.yaml` | authored vocabulary + policy rows. **Placeholder fixtures — not normative** |
| `data/registry/`, `data/quantity_kind/` | bulk QUDT-derived vocabularies, seeded once from grimoire |
| `gen/` | all build output — DDL, projected schema, catalog bundle, SQLite db. Gitignored |

## Commands

```sh
pnpm build      # generate → DDL → SQLite (1.3s, 1.2 MB db)
pnpm generate   # format → normalize → data2schema, no python
pnpm validate   # device model against its generated stencil
pnpm check      # format gate (--check), what precommit runs
pnpm check:refs # registry iri_templates resolve? (network)
```

`linkml-*` resolve imports relative to **CWD**, not the schema file — every python step runs from `linkml/` (the `cd` in each script). LinkML skips nixpkgs; `uv` sits in the flake, `uvx` fetches it.

## Design

- [mapping.md](docs/mapping.md) — every grimoire construct → its LinkML landing, plus identity and PK/FK rules.
- [open.md](docs/open.md) — known gaps and deliberate deferrals (no metaclass, overlapping backref FKs, untested registries, `code` collision risk, …).
