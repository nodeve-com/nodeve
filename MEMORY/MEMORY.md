# Memory Index

- [schema translations in schema](schema-translations-in-schema.md) — @nodeve/schema translations live on the schema element (annotations.i18n), projected schema→data; never in data/
- [schema is the source not data2schema](schema-is-the-source-not-data2schema.md) — author structure in the LinkML schema; YAML→YAML projection (data2schema) is slop; project schema→rows, never rows→schema

- [Why pnpm](why-pnpm.md) — pnpm owns everything, Node runs the scripts; NO Bun in this repo (user removed it)
- [nodeve ecosystem](nodeve-ecosystem.md) — nodeve(pnpm/publish) vs familiar(bun) vs platform(pnpm); @nodeve/config is the shared config source of truth
- [nodeve checks](nodeve-checks.md) — @nodeve/checks + @nodeve/text: shared lefthook commit-gate checks, config file, and adoption gotchas
- [nodeve release flow](nodeve-release-flow.md) — CI-driven via release.yml (Changesets + OIDC Trusted Publishing, no token/login); local `pnpm release` is publish-only fallback
- [run via pnpm scripts](run-via-pnpm-scripts.md) — verify with `pnpm test`/`pnpm typecheck`/`pnpm generate`, never `bun test`/`bunx tsc` directly
- [db table naming](db-table-naming.md) — DB tables (and in-memory Maps/dicts) are singular, not plural; confirmed in platform's schema
- [no eager commits](no-eager-commits.md) — don't commit per sub-task; user says when it's done
- [never allowlist](never-allowlist.md) — never add check-allowlist entries yourself; surface the finding, make the user do it
- [grimoire TS camel-only](grimoire-ts-camel-only.md) — TS emits camel wall-to-wall incl. data default export; snake in .ts is a generator bug, never style
- [typescript major upgrade](typescript-major-upgrade.md) — TS7 blocked by typescript-eslint; TS6 needs types:["node"] per node package + @types/node ^24
- [no inline string vocab](no-inline-string-vocab.md) — inline string-array/Set vocabularies in code are a total failure; derive from the authoritative source
- [bulk-load vocabularies](bulk-load-vocabularies.md) — bounded enums (refrigerant, quantity_kind) load the WHOLE upstream set at once; never add-when-needed
- [grimoire no TS spec grammar](grimoire-no-ts-spec-grammar.md) — hand-written TS interfaces for the spec/measurand grammar forbidden; YAML concepts the only source
- [grimoire settings external sensors](grimoire-settings-external-sensors.md) — settings_schema will grow external-sensor refs (ESPHome import pattern); setting gates stay pointed at the same keys
- [grimoire shape slop cleanup](grimoire-shape-slop-cleanup.md) — hand-authored shapes, dup defs, opaque Obj bags all trace to one missing desugar-at-openSite edge; multi-thread cleanup, gate currently red
- [grimoire global slots](grimoire-global-slots.md) — global-by-default property defs are a wanted invariant, hand-enforced many ways; native in LinkML
- [grimoire ignored](grimoire-ignored.md) — grimoire is dying; skip it in verification sweeps, never flag its pre-existing failures
- [schema urgency](schema-urgency.md) — LinkML schema is an urgent grimoire replacement; pre-1.0, break freely, propose reshapes not compatible patches
- [nodeve identity model](nodeve-identity-model.md) — Node table permalink PK (slot `permalink`, meaning wikidata:Q1048975, mint-once), derived code, kebab slugs; no uuid
