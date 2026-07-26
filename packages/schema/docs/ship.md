Continue shipping @nodeve/schema as the @nodeve/grimoire replacement. Read packages/schema/README.md and docs/pipeline.md first, then the Next list below. Last commit: 7ff6657.

## How it ships

One public npm package, `@nodeve/schema`. CI publishes it — release.yml drives Changesets over OIDC Trusted Publishing, so no token and no local `npm login`. `pnpm release` = `pnpm build && changeset publish`, and the root `build` recurses into schema's own (`fix && project && tsc -p tsconfig.build.json`) — the artifacts a release needs, not the gate, which the commit hook already ran. The release run projects `gen/`, emits `dist/`, and packs both in the same job.

gen/ stays gitignored the whole time. npm's `files` allowlist overrides .gitignore, so the artifacts reach the tarball without ever landing in git — confirmed with `npm pack --dry-run`. Nothing about publishing needs a committed artifact, same as the gate.

A downstream consumer then: `buildCatalog()` over its own authored tree → rows, concatenate with `gen/catalog.json`, `load()` the union into its own SQLite. FKs resolve across both row-sets because the load defers enforcement to a closing `foreign_key_check`.

The schema-projected row-sets (Property, the derived node_type stubs) stay OFF by default. They are identical in every tree, so only this package emits them. A downstream kind with no shipped node_type row authors one.

Production runs postgres, so the DDL ships in both dialects off the one schema — `bin/ddl.py <dialect>`. The postgres side is the richer target: 23 closed grammars become `CREATE TYPE … AS ENUM`, and every LinkML description becomes a `COMMENT ON`, so the database carries its own introspection surface. Both dialects declare the same 86 foreign keys. `load()` stays SQLite and dependency-free; a postgres consumer takes the DDL plus `gen/catalog.json` and uses its own migration tooling.

## The shipping decisions (open to review)

Ship a LIBRARY, not a data drop. Downstream (~/dev/familiar) appends its own rows before querying. Its sites/<name>/catalog/\*.yaml takes the same authored-nested form as data/subject_node/<slug>/. Schema already models the site layer in the same table core (inventory, network_interface, service_binding, emit/ingest). A site is just more rows.

Ship list:

| artifact                                 | is                                                   |
| ---------------------------------------- | ---------------------------------------------------- |
| `dist/`                                  | the product — `normalize()` + `load()` + types + CLI |
| `gen/catalog.schema.json`                | pre-database shape gate AND introspection            |
| `gen/catalog.camel.schema.json`          | its camelCase sibling for TS consumers               |
| `gen/catalog.json`                       | catalog rows                                         |
| `gen/nodeve.sqlite.sql`                  | DDL — the gate + downstream build product            |
| `gen/nodeve.postgres.sql`                | DDL — production; enum types + `COMMENT ON`          |
| `linkml/`                                | RUNTIME input — `model.ts` parses it per lookup      |
| `data/{feature_type,node_type,part_set}` | RUNTIME input — `registers.ts` loads it per import   |
| `docs/`                                  | the design record the README links into              |

NOT shipped: the authored vocabularies. data/quantity_kind (182K) and data/refrigerant (50K) already ride gen/catalog.json as rows, so the yaml would ship the same facts twice. Only the three dirs `registers.ts` reads at import travel as yaml. Tarball: 303K.

NOT shipped: gen/catalog.db. Downstream runs a load pass for its own rows anyway. A prebuilt db would mean a copy PLUS a partial load — two mechanisms where one suffices. The db is a downstream build product, like familiar's site.generated.json today. If a consumer ever wants the prebuilt db, it rides the GitHub release, not the tarball — release.yml already attaches grimoire's JSON tree to its tag that way.

Name minting is NOT a shippable step. The identity path IS the name, minted in the trail walk and stored as Node.permalink — `node:inverter/foxess-h3-ps10sh/ac-phase/out/a/voltage/running`. grimoire's intervalSensorId/measurandKey/sensor-id.ts have no landing here — deleted, not ported. Rust reads `SELECT permalink FROM node`.

## Previous Efforts

1. src/load.ts — rows → SQLite, replacing `ddl.py dump`. Two flattening shapes only: inlined list → child rows + `<parent_table>_node` backref; inlined single → child row + `<slot>_node` forward FK on parent. Both derived from sql_table annotations and slot ranges. FK enforcement OFF during load + foreign_key_check at the end, so row-sets insert in any order (this is what lets downstream concatenate its rows). Verified: all 40 tables byte-identical to the python build. 0.16s vs 1.75s. ddl.py shed the ORM half (163 → 91 lines), DDL output unchanged.

2. bin/check-catalog.ts — ajv over gen/catalog.schema.json, replacing `linkml-validate`.

3. gen-json-schema projects the JSON Schema from the STENCIL (gen/nodeve-projected.yaml), not the base schema — it resolves imports so it's self-contained, and it's a superset (86 $defs = 65 base + 21 stencil). AcPhaseInterval.quantity_kind is an anyOf of consts: that IS "what may an ac-phase feature carry", readable with no database, and what a GraphQL layer generates from. src/stencil.ts owns the artifact; bin/stencil-link.ts stamps `x-stencil-of` because gen-json-schema flattens `is_a` and a feature_type pin alone is ambiguous (PartSet carries one too). The per-feature-type quantity constraint now actually runs.

4. Both dialects get proven, not just emitted. `check:db:pg` applies `gen/nodeve.postgres.sql` to a throwaway cluster in gitignored gen/pg and loads the real rows — reusing the pure `inserts()` off `load.ts`, so no second flattening path and no pg driver. Postgres enforces per statement where SQLite defers, so the gate marks every FK deferrable (the list comes from `pg_constraint`, never restated) and loads in ONE transaction: COMMIT adjudicates the whole graph, the exact analog of `foreign_key_check`. Caught a bug on its first run — postgres reserves `end`, and the row loader spelled columns bare.

5. The gate covers authored rows, and lives in the package. `check` = drift gates → `project` → `check:catalog` (ajv) → `check:db` (SQLite) → `check:db:pg` (postgres) → typecheck, 6.1s. Root lefthook holds no schema job; `package-check` recursion finds the script, so the gate travels when the package moves repos. gen/ stays gitignored — `check` projects into the working tree, nothing needs committing. `fix` owns the source rewrites `check` must not do.

6. The package publishes. `tsconfig.build.json` emits the closure of `src/index.ts` — 12 modules, 312K, no gate machinery rides along. `abs()` walks up to the package.json instead of hopping one dir, so one code path resolves linkml/ and data/ from `src/` and from `dist/src/`. package.json goes public at 0.1.0: `files` names dist, linkml, the three runtime data dirs, and four gen/ artifacts, never a bare `gen` (that entry packed the 3.8MB catalog.db, the nodeve-projected.yaml intermediate, and the whole gen/pg cluster). `exports` gives `.`, `./types`, and one path per artifact. yaml + @nodeve/text + @nodeve/encoding became dependencies — dist imports them; ajv stays dev, bin/ alone uses it. Proven off a 303K tarball in a bare project: `normalize()` on a foreign tree, `buildDatabase()` over the shipped rows and DDL.

7. The walk takes its root as an argument, and a CLI drives it. `buildCatalog(root)` replaces the hardcoded data/ walk and the hardcoded gen/catalog.json write; it returns the bundle, so a consumer concatenates in memory with no temp file. `src/cli.ts` ships as the `nodeve-schema` bin — `catalog <dir> [out]`, `rows <file>`, and a no-arg help that states what the package does for a consumer with no checkout. Proving the concatenate story caught the defect behind the `schemaRows` switch: the walk re-emitted the 128 schema-projected Property rows and the derived node_type stubs on EVERY tree, so a downstream union died on `UNIQUE constraint failed: property.node`. Off by default now — a foreign tree unions clean (6453 + 2 nodes), and data/ still builds byte-identical to the pre-refactor catalog.json.

8. Published. `@nodeve/schema@0.1.0` reached npm 2026-07-26 by hand — a new name has nothing for CI's OIDC to publish against until the trusted publisher exists. It does now, so every later version rides release.yml. Two changesets wait for that first CI run: schema → 0.2.0 with its first CHANGELOG, text → 2.2.0. Getting there took one unrelated fix — grimoire's `kit/generate.ts` had failed since before `8b539a6`, and the root `build` recursion carried that failure into `pnpm release`, so nothing in the repo could publish. grimoire left the recursion.

9. The camel sibling ships. `bin/camel-schema.ts` closes `project:jsonschema` — after stencil-link, so `x-stencil-of` rides across — and @nodeve/schema-case (draft-07 grammar, but it walks `$defs` and passes `$schema` through, so the 2019-09 artifact cost nothing) projects `gen/catalog.camel.schema.json`, 114.5K into the tarball's `files` and `exports`. 49 names move; `enum`/`const` values, `$defs` keys and `$ref` targets do not, so both siblings dispatch on the same class names. It stays a devDependency — dist never imports it. One gate fix rode along: `check:db:pg` reused gen/pg unconditionally, so a postgres major bump bricked it with `control file appears to be corrupt`; it now compares the cluster's PG_VERSION against `pg_ctl --version` and re-initdbs, both majors read off the tools.

10. fox-ess verified against its grimoire source, mechanically — not by eye. All 56 value registers match on address, datatype, scale, decimals, unit and target `(feature, part, quantity, interval)`; all 6 flag words and every bit label match, and the channel members derive right (run-state 4 + `unknown`, fault-code 19 + `none`). Map scalars, all 5 constraint ranges, both NICs, both service bindings, `grid-region`, and product all carry. Every remaining spec difference is a schema-side ADDITION: measurable `_` bands where grimoire had a register pointing at a property with no interval to link, `severity: notice` to tell the two same-rating derate rows apart, `zone: mppt` on string 3 so the override selects the row it overrides. One real defect found and fixed: the port had split the temperature ladder onto a new `environment/ambient` feature while the sensor (invtemp, 39141) stayed on `enclosure`, so the active-power derates gated on bands nothing reads — the box exposes no ambient probe. Merged back onto `enclosure`, as grimoire and m4-atx both have it. Still unlanded: grimoire's authored `identity.code` (`S2P331EC` — schema derives `35ESA3A2` off the permalink instead) and `join: '; '` on the decodes (no slot; `Channel` models the set and leaves rendering downstream).

## Next

1. Port the catalog. THE long pole: data/subject_node/ holds 11 real devices and scales to thousands as downstream seeds. Use the grimoire-to-schema skill. (grimoire's own concepts/catalog/ holds only fox-ess and mini-box — the remaining volume comes from new authoring, not porting.)
2. familiar migration: sites/<name>/ → normalize() → rows; catalog + site rows → site.db. site.generated.json and the ajv `validate-site` layer die (FKs do that work).
