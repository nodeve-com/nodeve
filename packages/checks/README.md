# @nodeve/checks

Org-wide commit-gate checks and helper-index generators, shared across nodeve repos. Each check ships as a published bin that reads an optional per-repo `nodeve.checks.js` and derives the repo root from git — so it behaves the same whatever directory the hook runner invokes it from. Wiring is via lefthook.

## Install

```sh
pnpm add -D @nodeve/checks            # or: bun add -d @nodeve/checks
```

Extend the shared lefthook config from your `lefthook.yml`:

```yaml
extends:
  - node_modules/@nodeve/checks/lefthook.checks.yml
```

Then activate hooks once per clone with `lefthook install` (familiar/nodeve do this from their `prepare` script).

## Configure

Copy `node_modules/@nodeve/checks/nodeve.checks.example.js` to your repo root as `nodeve.checks.js` and trim to taste. Every section is optional; omitted keys fall back to org defaults. See the example for the full shape.

## Checks

| Bin | What it gates | Default |
| --- | --- | --- |
| `nodeve-check-doc-tokens` | markdown over a line/token budget | on (`CLAUDE.md`, `guide/`, `docs/`) |
| `nodeve-check-reshape` | callbacks that reproduce their input shape (no-op / pick / clone) | on (`apps/`, `packages/`) |
| `nodeve-check-inline-dupes` | non-exported top-level names declared in 2+ files | on (`apps/`, `packages/`) |
| `nodeve-check-helper-collisions` | local helpers that fuzzily match a dependency export | on (needs lib-names index) |
| `nodeve-check-page-size` | files over a per-glob line budget | on (`*+page.svelte` >280; no-op where the glob matches nothing) |
| `nodeve-check-file-size` | TS sources over a line budget (warn >225, fail >300) | on (`apps/`, `packages/`) |
| `nodeve-check-catalog` | dependency versions not single-sourced from a workspace catalog | on (a workspace must declare a catalog) |
| `nodeve-check-require-deps` | org-required deps missing from the workspace catalog | on (`remeda`; set `deps: []` to opt out) |

`require-deps` keeps the org's blessed libraries single-sourced and visibly expected: it fails when the workspace catalog (default or a named group) doesn't define a required name. It checks the catalog, not each package's deps — so it doesn't force the dep on packages that don't use it, it just guarantees the version is there to adopt with `catalog:`. Defaults to requiring `remeda`; set `requireDeps: { deps: [] }` to opt out.

`catalog` works with both pnpm (catalog in `pnpm-workspace.yaml`) and Bun (catalog in `package.json#workspaces`) — it auto-detects whichever the repo uses. A workspace is **required** to declare a catalog: a repo with none fails the gate, since the point is keeping versions aligned. Every dependency (deps, devDeps, and peers alike) must reference `catalog:` rather than a literal pin. Opt a repo out deliberately with `catalog: { enforce: false }`.

All blocking checks accept `--warn` (report-only, exit 0); `doc-tokens` accepts `--report` to list the whole backlog without failing. Pass explicit paths to scope a run (lefthook passes `{staged_files}`).

## Fixers

Unlike the gates above, fixers mutate staged files and let lefthook re-stage them (`stage_fixed: true`). They run before the `checks` group so the gates see the fixed content.

- `nodeve-format-markdown` — prettier-formats staged `*.md` in place, so docs land formatted without a manual `prettier --write`. Bundles its own prettier (nothing needed on PATH, portable across pnpm and bun) yet honors the repo's prettier config, `.prettierignore`, and plugins, which prettier resolves per file. Skips symlinked docs (e.g. `CLAUDE.md` → `README.md`), which prettier can't format and which get formatted via their real target's own staged entry.

### Running ad hoc

These are **bins**, not package scripts, so `pnpm run` / `bun run` won't find them — those run `package.json#scripts`. Invoke a bin through `exec` instead, which resolves `node_modules/.bin` for you (no hardcoded path needed):

```sh
pnpm exec nodeve-check-doc-tokens 'README.md'   # or: pnpm nodeve-check-doc-tokens ...
bunx nodeve-check-doc-tokens 'README.md'         # Bun repos
```

Quote globs so your shell doesn't expand them before the bin sees them. Day to day you shouldn't need this — the bins run through lefthook on commit.

## Generators

- `nodeve-build-lib-names` — writes the committed lib-names index that `helper-collisions` matches against (regenerate after dependency bumps). The index is committed so the gate never needs the libs installed at check time.
- `nodeve-build-helper-manifest` — **opt-in**; writes a greppable index of the public export surface of the configured packages. Grep it before adding a generic helper.

## Notes for Bun repos

The bins are plain Node ESM and run under Node from `node_modules/.bin`. lefthook in a Bun workspace still finds them on PATH; no `bunx` prefix is needed.
