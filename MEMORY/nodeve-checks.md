---
name: nodeve-checks
description: "The @nodeve/checks + @nodeve/text packages — shared commit-gate checks, lefthook wiring, and how org repos adopt them"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1c2eedb0-2921-4d96-8b11-d7fb6d07d28c
---

nodeve publishes two packages that carry the org's shared pre-commit gate,
extracted/generalized from the pumpspotting/platform `scripts/precommit.sh` gate.
See [[nodeve-ecosystem]].

- **`@nodeve/text`** — dependency-free utils with subpath exports:
  `./damerau-levenshtein`, `./similarity` (identifierSimilarity, tokenizeIdentifier),
  `./trim` (trimText). Pulled out of `@pumpspotting/utils`; vitest tests migrated.
- **`@nodeve/checks`** — one published bin per check, all reading an optional
  repo-root `nodeve.checks.js` (defaults baked in) and deriving repo root from
  `git rev-parse --show-toplevel`. Bins: doc-tokens, reshape, inline-dupes,
  helper-collisions (always-on defaults); page-size + build-helper-manifest are
  opt-in (no-op until configured); build-lib-names generates the committed
  `.nodeve/lib-names.json` index helper-collisions matches against.
  - **catalog** (`nodeve-check-catalog`) — ported from familiar's bun
    `scripts/guard-catalog.ts`: every dep version must single-source through a
    workspace catalog (no literal pins; `workspace:`/`link:`/`file:` exempt).
    One bin handles BOTH layouts — pnpm (`pnpm-workspace.yaml` catalog/catalogs)
    and bun (`package.json#workspaces`) — auto-detecting which the repo uses.
    Default-on; a workspace is REQUIRED to declare a catalog — no catalog at all
    FAILS the gate (alignment is the point). `catalog.enforce: false` is the only
    deliberate opt-out. Checks deps, devDeps AND peerDependencies. Needs `yaml` dep.
    nodeve dogfoods it: pnpm-workspace.yaml now carries a `catalog:` and all three
    packages (incl. @nodeve/config's peers) reference `catalog:`; pnpm rewrites
    catalog:/workspace: to concrete versions at publish. familiar's other two
    guards (grimoire-agnostic, interval-naming) are grimoire-specific, NOT ported.
    NOTE: pnpm 11.4 migrated `onlyBuiltDependencies` → `allowBuilds: { esbuild: true }`
    in pnpm-workspace.yaml (an undecided placeholder → ERR_PNPM_IGNORED_BUILDS).

**Wiring is lefthook, not the old bash gate.** Consumers add
`extends: [node_modules/@nodeve/checks/lefthook.checks.yml]` to their
`lefthook.yml`. Jobs invoke bins via the `node_modules/.bin/<name>` path
(portable across pnpm AND bun; lefthook does NOT add node_modules/.bin to PATH).

**As of @nodeve/checks 0.1.1 the shared file wraps all bins in a pre-commit job
group named `checks`** (was: top-level `parallel: true` jobs). This is the
integration seam: lefthook MERGES same-named group jobs, so a consumer whose own
`lefthook.yml` already has a `checks` group (e.g. familiar runs index-mutating
fixers piped first, then a parallel `checks` group with typecheck/test) gets the
shared bins merged INTO that group from the one `extends` line — fixers stay
ahead, no piped/parallel conflict. The OLD 0.1.0 top-level form merged the bins
OUTSIDE the consumer's group and set BOTH parallel+piped (broken for piped gates);
verify any consumer is on >=0.1.1. A repo with no `checks` group just gets the
group as-is. Confirm the merged result with `lefthook dump`.

**familiar adopted this (0.1.1):** single `extends` line; its old
`scripts/guard-catalog.ts` + `guard-catalog` npm script deleted (the shared
`catalog` bin replaces them — note that bin scans only workspace-MEMBER manifests,
not the repo-root package.json, so root literal pins like `@nodeve/config` are not
gated). Its repo-root `nodeve.checks.js` starts narrow: docTokens.enforce scoped
to `CLAUDE.md` only, `.ts` check globs add `:!apps/nori/**` (nori is outside the
bun workspace), helper-collisions no-ops until `.nodeve/lib-names.json` is built.

**Gotchas:** inline-dupes/helper-collisions are `apps/`-scoped by design — don't
point them at a CLI tool package's parallel bins (false positives on `root`,
`cfg`, `sourceFiles`). nodeve dogfoods only doc-tokens + reshape for that reason.
helper-collisions no-ops when the lib-names index is absent. Tests need esbuild's
build script allowed via `onlyBuiltDependencies: [esbuild]` in pnpm-workspace.yaml
(pnpm 11.4 reads it there, not package.json). familiar (bun) can only adopt after
@nodeve/checks is published — can't workspace-link across repos.
