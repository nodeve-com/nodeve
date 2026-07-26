1. normalize(dir, out) parameterized; CLI entry.
2. Unprivate the package — exports, files, publishConfig. Wire schema-case for the camel projection.
3. Port the catalog (the actual gate — 11 devices in data/subject_node/, thousands to come).
4. familiar migration.

Continue shipping @nodeve/schema as the @nodeve/grimoire replacement. Read packages/schema/README.md and docs/pipeline.md first. Last commit: 9787234.

## How it ships

One public npm package, `@nodeve/schema`. CI publishes it — release.yml drives Changesets over OIDC Trusted Publishing, so no token and no local `npm login`. `pnpm release` = `pnpm build && changeset publish`, and the root `build` recurses into schema's own (`fix && check`). The release run projects `gen/` from source and packs it in the same job.

gen/ stays gitignored the whole time. npm's `files` allowlist overrides .gitignore, so the artifacts reach the tarball without ever landing in git — confirmed with `npm pack --dry-run`. Nothing about publishing needs a committed artifact, same as the gate.

A downstream consumer then: `normalize()` its own authored tree → rows, concatenate with `gen/catalog.json`, `load()` the union into its own SQLite. FKs resolve across both row-sets because the load defers enforcement to a closing `foreign_key_check`.

Production runs postgres, so the DDL ships in both dialects off the one schema — `bin/ddl.py <dialect>`. The postgres side is the richer target: 23 closed grammars become `CREATE TYPE … AS ENUM`, and every LinkML description becomes a `COMMENT ON`, so the database carries its own introspection surface. Both dialects declare the same 86 foreign keys. `load()` stays SQLite and dependency-free; a postgres consumer takes the DDL plus `gen/catalog.json` and uses its own migration tooling.

## The shipping decisions (open to review)

Ship a LIBRARY, not a data drop. Downstream (~/dev/familiar) appends its own rows before querying. Its sites/<name>/catalog/\*.yaml takes the same authored-nested form as data/subject_node/<slug>/. Schema already models the site layer in the same table core (inventory, network_interface, service_binding, emit/ingest). A site is just more rows.

Ship list:

| artifact                  | is                                          |
| ------------------------- | ------------------------------------------- |
| `normalize()` + `load()`  | the product — library + CLI                 |
| `gen/catalog.schema.json` | pre-database shape gate AND introspection   |
| `gen/catalog.json`        | catalog rows                                |
| `gen/nodeve.sqlite.sql`   | DDL — the gate + downstream build product   |
| `gen/nodeve.postgres.sql` | DDL — production; enum types + `COMMENT ON` |
| `gen/schema.ts`           | types                                       |
| `linkml/`                 | reference source (nothing runtime reads it) |

NOT shipped: gen/catalog.db. Downstream runs a load pass for its own rows anyway. A prebuilt db would mean a copy PLUS a partial load — two mechanisms where one suffices. The db is a downstream build product, like familiar's site.generated.json today.

Name minting is NOT a shippable step. The identity path IS the name, minted in the trail walk and stored as Node.permalink — `node:inverter/foxess-h3-ps10sh/ac-phase/out/a/voltage/running`. grimoire's intervalSensorId/measurandKey/sensor-id.ts have no landing here — deleted, not ported. Rust reads `SELECT permalink FROM node`.

## Previous Efforts

1. src/load.ts — rows → SQLite, replacing `ddl.py dump`. Two flattening shapes only: inlined list → child rows + `<parent_table>_node` backref; inlined single → child row + `<slot>_node` forward FK on parent. Both derived from sql_table annotations and slot ranges. FK enforcement OFF during load + foreign_key_check at the end, so row-sets insert in any order (this is what lets downstream concatenate its rows). Verified: all 40 tables byte-identical to the python build. 0.16s vs 1.75s. ddl.py shed the ORM half (163 → 91 lines), DDL output unchanged.

2. bin/check-catalog.ts — ajv over gen/catalog.schema.json, replacing `linkml-validate`.

3. gen-json-schema projects the JSON Schema from the STENCIL (gen/nodeve-projected.yaml), not the base schema — it resolves imports so it's self-contained, and it's a superset (86 $defs = 65 base + 21 stencil). AcPhaseInterval.quantity_kind is an anyOf of consts: that IS "what may an ac-phase feature carry", readable with no database, and what a GraphQL layer generates from. src/stencil.ts owns the artifact; bin/stencil-link.ts stamps `x-stencil-of` because gen-json-schema flattens `is_a` and a feature_type pin alone is ambiguous (PartSet carries one too). The per-feature-type quantity constraint now actually runs.

4. Both dialects get proven, not just emitted. `check:db:pg` applies `gen/nodeve.postgres.sql` to a throwaway cluster in gitignored gen/pg and loads the real rows — reusing the pure `inserts()` off `load.ts`, so no second flattening path and no pg driver. Postgres enforces per statement where SQLite defers, so the gate marks every FK deferrable (the list comes from `pg_constraint`, never restated) and loads in ONE transaction: COMMIT adjudicates the whole graph, the exact analog of `foreign_key_check`. Caught a bug on its first run — postgres reserves `end`, and the row loader spelled columns bare.

5. The gate covers authored rows, and lives in the package. `check` = drift gates → `project` → `check:catalog` (ajv) → `check:db` (SQLite) → `check:db:pg` (postgres) → typecheck, 6.1s. Root lefthook holds no schema job; `package-check` recursion finds the script, so the gate travels when the package moves repos. gen/ stays gitignored — `check` projects into the working tree, nothing needs committing. `fix` owns the source rewrites `check` must not do.

## Next

4. normalize(dir, out) — parameterize. normalize/catalog.ts hardcodes the data/ walk and abs('gen/catalog.json'). Everything else is already schema-driven (reads Catalog slot ranges + sql_table), so it works on a downstream tree unchanged. Ship as library AND CLI — familiar's CLAUDE.md relies on grimoire's self-documenting CLI for discovery without a checkout; the debug mode already exists (`node normalize/catalog.ts data/registry/x.yaml` prints one doc's rows).
5. Unprivate: `private: false`, exports, files, publishConfig — see the two open decisions below first (per-file `files`, and dist vs raw TS). Wire @nodeve/schema-case for the camel projection (it exists for exactly this and would otherwise die with grimoire). Unresolved: schema-case emits draft-07; the artifact is 2019-09 ($defs vs definitions).
6. Port the catalog. THE long pole: data/subject_node/ holds 11 real devices and scales to thousands as downstream seeds. Use the grimoire-to-schema skill. (grimoire's own concepts/catalog/ holds only fox-ess and mini-box — the remaining volume comes from new authoring, not porting.)
7. familiar migration: sites/<name>/ → normalize() → rows; catalog + site rows → site.db. site.generated.json and the ajv `validate-site` layer die (FKs do that work).

## Open decisions for the user

- `files: ["gen"]` overships. A `npm pack --dry-run` with that entry put `gen/catalog.db` (3.8MB) in the tarball — the one artifact this doc withholds on purpose — plus the `gen/nodeve-projected.yaml` intermediate, and now the whole `gen/pg` cluster. Name the five shipped files individually, not the directory.
- No `dist/`. Every sibling (text, encoding, schema-case) compiles `src` → `dist` via a build tsconfig and points `exports` there. schema has one `--noEmit` tsconfig, and its sources import each other with `.ts` extensions. So step 5 needs a prior call: add a build tsconfig and emit, or ship raw TS and state why. Raw TS narrows consumers to Node with type-stripping.
- Node-type stencils are near-vacuous: the 11 node_type classes pin the discriminator and add nothing. Nothing projects node_type.facets, so "an inverter must carry a product facet" goes unenforced. Worth fixing BEFORE GraphQL — it's the part a schema consumer most needs. See docs/open.md.

## Gotchas

- Verify with pnpm scripts: `pnpm build`, `pnpm check` (workspace), `pnpm test`. Never bun. Node >= 24 (node:sqlite is builtin, zero-dep).
- Bash cwd drifts after a `cd` in a compound command — use absolute paths or re-cd. I invalidated a whole comparison run this way.
- The pre-commit gate (pnpm check:gate) is strict and reads the STAGED index, so re-stage after fixing. It will reject: vale prose (>30-word sentences, passives, wordiness — you own ALL errors in any doc you touch), inline-dupes (a top-level name in 2+ files anywhere in the repo — check `grep -rE "^(const|type|function|export ...) <name>\b" packages` BEFORE picking a name), plural-arrays (plural name bound to a Map), helper-collisions (local fn fuzzy-matching a dep export, e.g. flatten≈remeda.flat).
- NEVER add allowlist entries yourself — surface the finding to the user.
- postgres reserves `end`; SQLite does not. SQLAlchemy quotes it in both DDLs; anything hand-writing SQL against these tables must quote identifiers too.
- python still runs the 4 `project:*` steps (gen-typescript, gen-json-schema, ddl.py ×2) via uvx. They all run from a `cd` into linkml/ or gen/ because linkml resolves imports relative to CWD. `uv` and `vale` come from the flake devShell (`nix develop`).
- node:sqlite enables foreign_keys by default, unlike the sqlite CLI.
- pnpm 11.5.3 reformats resolution: blocks across pnpm-lock.yaml on any `pnpm add` — a large diff, NOT a dependency prune. Check package-entry counts before alarm.
- grimoire is dying: skip it in verification sweeps, never flag its pre-existing failures.
