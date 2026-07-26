# @nodeve/schema

Source of truth for **describing things** within a relational database. [LinkML](https://linkml.io) schemas. Authored data normalized to rows; projections generate SQL DDL, validation schemas, program types, and databases. Replaces `@nodeve/grimoire`.

## Status

Pre-1.0: break schema, data shape, and DDL freely — no deprecation, no migrations. Reshape, don't accrete.

## [Facets](docs/facets.md)

We intend for the database schema to be flexible and able to contain any kind of Thing (NodeType). Narrow SQL tables are facets, composed to include required properties needed to define a named Thing. Singular facets share a PK with the `node` (identity) table.

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
| `bin/check-*.ts` | perform validation checks — `check-catalog.ts` is the shape gate, ajv over `gen/catalog.schema.json` |
| `bin/data2schema.ts` | policy rows → `gen/nodeve-projected.yaml`, the closed stencil |
| `bin/stencil-link.ts` | stamps `x-stencil-of` on the projected JSON Schema — gen-json-schema drops `is_a` |
| `bin/camel-schema.ts` | the camelCase sibling of that artifact — `@nodeve/schema-case` over the linked document |
| `normalize/catalog.ts` | THE normalizer — `buildCatalog(root)` walks an authored tree into the bundle `src/load.ts` ingests; the root is a parameter, so a downstream tree uses the same walk |
| `src/cli.ts` | the `nodeve-schema` bin over both — `catalog <dir> [out]`, `rows <file>`; no args prints what the package does |
| `bin/ddl.py` | DDL, `sqlite` or `postgresql` — replaces `gen-sqltables`, which exposes no backref-column hook |
| `src/index.ts` | the published surface — `tsconfig.build.json` emits its import closure to `dist/`, nothing else |
| `src/load.ts` | rows → SQLite — flattens nested facets into their tables; `foreign_key_check` as the gate |
| `bin/check-db-pg.ts` | the postgres twin of that gate — throwaway cluster, deferred FKs, one COMMIT |
| `data/subject_node/<node_type>/<slug>/` | authored nested device descriptions (a dir per device, filed under its kind) — real devices, seeds for downstream databases; grows to thousands |
| `data/<table>/<slug>.yaml` | authored vocabulary + policy rows — normative. `feature_type` + `node_type` are the stencil source (`data2schema`) |
| `data/registry/`, `data/quantity_kind/` | bulk QUDT-derived vocabularies, seeded once from grimoire |
| `gen/` | all build output — both DDL dialects, catalog bundle, JSON Schema, TS types, SQLite db, the postgres check cluster. Gitignored |
| `gen/catalog.schema.json` | the pre-database contract **and** the introspection surface: base classes + stencil, imports resolved, stands alone |
| `gen/catalog.camel.schema.json` | its camelCase sibling for TS consumers — declared names renamed, `x-key-map` stamped per node, values and `$ref` targets untouched |

## Commands

```sh
pnpm check      # THE gate: drift gates → project → shape gate → SQLite FK → postgres FK → typecheck (6.1s)
pnpm build      # what a release needs: fix, project gen/, emit dist/. The gate is `check`
pnpm fix        # rewrite what's derived: nodeve.yaml prefixes block, yaml formatting
pnpm project    # rows + stencil + types/JSON Schema/DDL. No validation
node src/cli.ts # the CLI consumers get as `nodeve-schema` — same walk, any tree
pnpm check:refs # registry iri_templates resolve? (network)
```

`check` asserts; `fix` rewrites. Nothing inside `check` touches an authored file, so `check:format` and `check:prefixes` see the tree as committed — a drift gate that ran after its own generator would always pass.

The gate is the package's `check` script, not a root lefthook job: the shared `package-check` recursion finds it wherever the package lives, so it survives a move to another repo. `gen/` stays gitignored — `check` projects into the working tree; nothing needs committing. Needs `uvx`/linkml on PATH (`nix develop`).

`linkml-*` resolve imports relative to **CWD**, not the schema file — every python step runs from `linkml/` (the `cd` in each script). LinkML skips nixpkgs; `uv` sits in the flake, `uvx` fetches it.

## Design

- [levels.md](docs/levels.md) — identity path grammar
- [parts.md](docs/parts.md) — feature subdivision (`count`/`part_set`) and the `_`/`*` markers
- [intervals.md](docs/intervals.md) — what an interval is: one quantity band, slug-discriminated, facts as width facets
- [authoring.md](docs/authoring.md) — authored nested docs → schema-checked rows
- [pipeline.md](docs/pipeline.md) — pipeline stages
- [overlay.md](docs/overlay.md) — node types as an overlay over the reusable table core: socket constraints enforced at normalize today, `required` and row-projection still inert, load path still intent.
- [mapping.md](docs/mapping.md) — every grimoire construct → its LinkML landing, plus identity and PK/FK rules.
- [open.md](docs/open.md) — known gaps and deliberate deferrals (no metaclass, overlapping backref FKs, untested registries, `code` collision risk, …).
