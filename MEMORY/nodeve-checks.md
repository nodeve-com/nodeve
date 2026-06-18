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
    Opt-OUT (`catalog.enforce`, default true) but no-ops when the workspace
    defines no catalog, so non-catalog repos (incl. nodeve itself) aren't flagged.
    Needs the `yaml` dep. familiar's other two guards (grimoire-agnostic,
    interval-naming) are grimoire-specific prose guards, NOT ported.

**Wiring is lefthook, not the old bash gate.** Consumers add
`extends: [node_modules/@nodeve/checks/lefthook.checks.yml]` to their
`lefthook.yml`. Jobs invoke bins via the `node_modules/.bin/<name>` path
(portable across pnpm AND bun; lefthook does NOT add node_modules/.bin to PATH).

**Gotchas:** inline-dupes/helper-collisions are `apps/`-scoped by design — don't
point them at a CLI tool package's parallel bins (false positives on `root`,
`cfg`, `sourceFiles`). nodeve dogfoods only doc-tokens + reshape for that reason.
helper-collisions no-ops when the lib-names index is absent. Tests need esbuild's
build script allowed via `onlyBuiltDependencies: [esbuild]` in pnpm-workspace.yaml
(pnpm 11.4 reads it there, not package.json). familiar (bun) can only adopt after
@nodeve/checks is published — can't workspace-link across repos.
