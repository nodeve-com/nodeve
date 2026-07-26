---
name: org-recursive-package-check
description: 'org gate: shared lefthook runs `pnpm -r --if-present check`; each package aggregates its own checks under a `check` script'
metadata:
  node_type: memory
  type: project
  originSessionId: ae49ce42-e548-413a-ae47-3c80706bdb64
  modified: 2026-07-26T16:04:04.433Z
---

Org-wide recursive per-package gate, modeled on pumpspotting/platform (which uses `turbo run check`; nodeve chose plain `pnpm -r --if-present` since packages are small and typecheck runs sub-second — caching buys little). Restored 2026-07-24 after an AI regression had collapsed root `check` to a one-off `nodeve-check && eslint .` and dropped typecheck from the commit gate entirely.

- **Shared `@nodeve/checks/lefthook.checks.yml`** carries a top-level `pre-commit` job `package-check` (sibling of the `checks` static-analysis group, NOT inside it — typecheck needs the whole package program, can't scope to staged files). The org mandates it; every consumer inherits it via the one `extends` line. **PM-agnostic by lockfile**: `bun.lock`/`bun.lockb` → `bun run --filter '*' check`, else `pnpm -r --if-present check` — org repos run pnpm OR bun, both inherit with no per-repo override.
- **Three-verb script contract** ([packages/checks/docs/package-scripts.md](../packages/checks/docs/package-scripts.md)): `check` = STATIC-verification cluster (typecheck + schema validation + authoring/semantic gates — NO tests/build); `build` = compile/generate; `test` = run output (depends on build, the cargo ordering). `check` guards commits; `build`/`test` are CI. So each package's `check` is static only — leaf = `tsc --noEmit`; schema = `check:format && check:prefixes && check:meta && typecheck`. **check:meta folds in** — external mapping (meaning/exact/close/related, or 2+ narrow/broad) + title required per slot, enum value, class; now GREEN (2026-07-24, all 23 mapped). check:meta has no allowlist by design. Root `check` = `pnpm -r --if-present check`; `check:smells` = `nodeve-check && eslint .`.
- **The gate belongs IN the package, never in root `lefthook.yml`.** User's rule (2026-07-26): packages move repos or spin out into their own, so a per-package job at the root gets left behind. Root `lefthook.yml` holds only facts about the _repo_ (nodeve's sole job: rebuilding `@nodeve/checks` dist, since this repo IS its source). Anything package-specific goes in that package's `check` script, which `package-check` recursion finds wherever it lives.
- **`check` may PROJECT derived artifacts, but must never rewrite an AUTHORED file.** Resolves the contract's old "no codegen" line. @nodeve/schema's `check` projects JSON Schema/DDL/TS into gitignored `gen/` and validates rows against them — so `check` is standalone, needs no committed artifact, and a fresh clone gates correctly. Source rewrites live in `fix`; `build` = `fix && check`. Reason: a drift gate (check:prefixes, check:format) running after its own generator asserts against fresh output and can never fail.
- **Opt-out = no `check` script** (both PMs skip a missing script). grimoire (dying, [[grimoire-ignored]]) opts out via `check:frozen` instead of `check`. A repo wanting turbo caching overrides the job's `run` with `turbo run check`.
- Before this, eslint ran at commit but **nothing type-checked** — commits could land type-broken. Uses the TS7 split ([[typescript-major-upgrade]]).
