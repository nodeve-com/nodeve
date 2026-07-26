# Pipeline

## generate

`pnpm generate` = format → normalize. (No stage named "generate.")

### format

Style authority for authored yaml (prettier ignores the tree). Comment-preserving; only stage that mutates source. `--check` twin precommit runs: exit 1 on drift.

- **style** — inline flow only if one-line render fits width and holds no block child/comment; bottom-up, so a block child forces its parent block.
- **data fixes** — pre-parse: bare `*` (empty-anchor alias, a loader error) quoted to literal in key/value/seq (`quoteBareStars`); `*name` left be. Post-parse: `valued_range` band sugar `fraction_lower`/`upper` → `margin_lower`/`upper`.
- **schema sorts** (`linkml/*.yaml`) — enums alpha (`permissible_values` stay authored — semantic order), slots scalar-then-object alpha, `camel:` on snake_case slots.

### normalize

THE trail walk ([authoring.md](authoring.md#the-normalizer)): nested docs → flat source-tagged rows → `gen/catalog.json`, the root object downstream ingests. Structural errors (bad slug, part outside its set, duplicate coordinate) die here with the key trail.

## build

Python projects the model three ways — `gen-typescript` (types), `gen-json-schema` (`-t Catalog --closed`, over the **stencil**), `ddl.py` (DDL) — and touches nothing after that. Both gates and the load run on Node.

`gen/catalog.schema.json` is the pre-database contract and the introspection surface in one document. 86 `$defs`: every base class, plus the 21 stencil classes projected from the policy rows. Imports resolve into it, so it stands alone.

`AcPhaseInterval.quantity_kind` is an `anyOf` of consts — the answer to "what may an ac-phase feature carry", readable without a database. `stencil-link.ts` stamps `x-stencil-of` back on: gen-json-schema flattens `is_a` away, and a `feature_type` pin alone is ambiguous, since PartSet carries one too.

`check-catalog.ts` is the shape gate over that artifact, replacing `linkml-validate`. Two passes: the bundle against the base classes, then each row against the class its own discriminator selects. Dispatch reads the pins and the base off the artifact, never restating them.

The gate runs the SHIPPED document, not a private path, so a downstream repo validating its own rows exercises what passed here. `format` needs `ajv-formats` — ajv ships none, and a schema must not declare a constraint its validator drops.

The FK check at load still owns referential integrity; owned checks still own cross-row rules.

`src/load.ts` then loads. Each top-level row-set inserts into its class's `sql_table`, nested facets flattening on the way in:

- inlined list → child rows carrying a `<parent_table>_node` backref
- inlined single → a child row plus a `<slot>_node` forward FK on the parent

FK enforcement is off during the load, so row-sets insert in any order. `PRAGMA foreign_key_check` at the end is the one integrity gate, and a failed FK there is the last word. That order-independence lets a downstream bundle concatenate its own rows onto the catalog's, no topological sort.

## check-refs (out of band)

`check-refs.ts` — do registry `iri_template`s resolve? One live request per registry. Network-dependent, never in the gate; run when registry rows change.
