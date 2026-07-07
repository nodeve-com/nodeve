# Memory Index

- [Why pnpm](why-pnpm.md) — pnpm owns deps/publishing, Bun only for execution; the rationale and guardrails
- [nodeve ecosystem](nodeve-ecosystem.md) — nodeve(pnpm/publish) vs familiar(bun) vs platform(pnpm); @nodeve/config is the shared config source of truth
- [nodeve checks](nodeve-checks.md) — @nodeve/checks + @nodeve/text: shared lefthook commit-gate checks, config file, and adoption gotchas
- [nodeve release flow](nodeve-release-flow.md) — `pnpm release` is publish-only; run `changeset version` + commit first
- [db table naming](db-table-naming.md) — DB tables (and in-memory Maps/dicts) are singular, not plural; confirmed in platform's schema
