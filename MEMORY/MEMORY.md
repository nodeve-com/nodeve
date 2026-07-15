# Memory Index

- [Why pnpm](why-pnpm.md) — pnpm owns everything, Node runs the scripts; NO Bun in this repo (user removed it)
- [nodeve ecosystem](nodeve-ecosystem.md) — nodeve(pnpm/publish) vs familiar(bun) vs platform(pnpm); @nodeve/config is the shared config source of truth
- [nodeve checks](nodeve-checks.md) — @nodeve/checks + @nodeve/text: shared lefthook commit-gate checks, config file, and adoption gotchas
- [nodeve release flow](nodeve-release-flow.md) — `pnpm release` is publish-only; run `changeset version` + commit first
- [run via pnpm scripts](run-via-pnpm-scripts.md) — verify with `pnpm test`/`pnpm typecheck`/`pnpm generate`, never `bun test`/`bunx tsc` directly
- [db table naming](db-table-naming.md) — DB tables (and in-memory Maps/dicts) are singular, not plural; confirmed in platform's schema
- [no eager commits](no-eager-commits.md) — don't commit per sub-task; user says when it's done
- [never allowlist](never-allowlist.md) — never add check-allowlist entries yourself; surface the finding, make the user do it
- [grimoire TS camel-only](grimoire-ts-camel-only.md) — TS emits camel wall-to-wall incl. data default export; snake in .ts is a generator bug, never style
- [typescript major upgrade](typescript-major-upgrade.md) — TS7 blocked by typescript-eslint; TS6 needs types:["node"] per node package + @types/node ^24
- [no inline string vocab](no-inline-string-vocab.md) — inline string-array/Set vocabularies in code are a total failure; derive from the authoritative source
- [grimoire no TS spec grammar](grimoire-no-ts-spec-grammar.md) — hand-written TS interfaces for the spec/measurand grammar are forbidden; YAML concepts are the only source
