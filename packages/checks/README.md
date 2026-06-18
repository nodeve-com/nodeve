# @nodeve/checks

Org-wide commit-gate checks and helper-index generators, shared across nodeve
repos. Each check ships as a published bin that reads an optional per-repo
`nodeve.checks.js` and derives the repo root from git — so it behaves the same
whatever directory the hook runner invokes it from. Wiring is via lefthook.

## Install

```sh
pnpm add -D @nodeve/checks            # or: bun add -d @nodeve/checks
```

Extend the shared lefthook config from your `lefthook.yml`:

```yaml
extends:
  - node_modules/@nodeve/checks/lefthook.checks.yml
```

Then activate hooks once per clone with `lefthook install` (familiar/nodeve do
this from their `prepare` script).

## Configure

Copy `node_modules/@nodeve/checks/nodeve.checks.example.js` to your repo root as
`nodeve.checks.js` and trim to taste. Every section is optional; omitted keys
fall back to org defaults. See the example for the full shape.

## Checks

| Bin | What it gates | Default |
| --- | --- | --- |
| `nodeve-check-doc-tokens` | markdown over a line/token budget | on (`CLAUDE.md`, `guide/`, `docs/`) |
| `nodeve-check-reshape` | callbacks that reproduce their input shape (no-op / pick / clone) | on (`apps/`, `packages/`) |
| `nodeve-check-inline-dupes` | non-exported top-level names declared in 2+ files | on (`apps/`) |
| `nodeve-check-helper-collisions` | local helpers that fuzzily match a dependency export | on (needs lib-names index) |
| `nodeve-check-page-size` | files over a per-glob line budget | **opt-in** (no rules → no-op) |

All blocking checks accept `--warn` (report-only, exit 0); `doc-tokens` accepts
`--report` to list the whole backlog without failing. Pass explicit paths to
scope a run (lefthook passes `{staged_files}`).

## Generators

- `nodeve-build-lib-names` — writes the committed lib-names index that
  `helper-collisions` matches against (regenerate after dependency bumps). The
  index is committed so the gate never needs the libs installed at check time.
- `nodeve-build-helper-manifest` — **opt-in**; writes a greppable index of the
  public export surface of the configured packages. Grep it before adding a
  generic helper.

## Notes for Bun repos

The bins are plain Node ESM and run under Node from `node_modules/.bin`. lefthook
in a Bun workspace still finds them on PATH; no `bunx` prefix is needed.
