# @nodeve/checks

Org-wide commit-gate checks and helper-index generators, shared across nodeve repos. Each check reads an optional per-repo `nodeve.checks.js` and derives the repo root from git, so it behaves the same from any directory the hook runner uses. Wiring goes through lefthook.

All checks run through one dispatcher, **`nodeve-check`**:

```sh
nodeve-check                       # whole pre-commit suite, summary-first
nodeve-check file-size             # one check (paths/flags after the name)
nodeve-check file-size --explain   # its full remediation prose
nodeve-check list                  # the check names
```

Every check renders the **same uniform block**: `<glyph> <name> — <summary>`, indented detail rows, remediation guidance. So the parallel gate's failures scan cleanly, not a wall of per-check formats.

Flags on every blocking check: `--warn` (report-only, exit 0) and `--explain` (remediation prose plus bulky per-finding detail). `doc-tokens` adds `--report`, the whole backlog without failing. Explicit paths scope a run; lefthook passes `{staged_files}`.

It's a **bin**, not a package script, so `pnpm run` won't find it — reach it through `pnpm exec nodeve-check …` (Bun repos: `bunx`). Quote globs so your shell leaves them for the check. Day to day lefthook runs the suite on commit.

## Install

```sh
pnpm add -D @nodeve/checks            # or: bun add -d @nodeve/checks
```

Extend the shared lefthook config from your `lefthook.yml`:

```yaml
extends:
  - node_modules/@nodeve/checks/lefthook.checks.yml
```

Activate hooks once per clone with `lefthook install` (familiar/nodeve do this from `prepare`).

## Configure

Copy `node_modules/@nodeve/checks/nodeve.checks.defaults.js` to your repo root as `nodeve.checks.js` and keep ONLY the keys you change. That file is the org defaults verbatim — a valid config in the exact shape yours takes — so it doubles as the reference for every section. Omitted keys fall back (deep-merged; arrays replace wholesale). Importable too: `import DEFAULTS from '@nodeve/checks/defaults'`.

## Checks

| Check | What it gates | Default |
| - | - | - |
| `doc-tokens` | markdown over a line/token budget | on (every tracked `.md`; an index gets half the tokens) |
| `reshape` | callbacks that reproduce their input shape (no-op / pick / clone) | on (tree-wide `.ts`) |
| `plural-arrays` | count-plural names bound to a map/object instead of an array | on (tree-wide `.ts`) |
| `inline-dupes` | non-exported top-level names declared in 2+ files | on (tree-wide `.ts`) |
| `helper-collisions` | local helpers that fuzzily match a dependency export | on (needs lib-names index) |
| `clones` | structural copy-paste (duplicated code blocks) via jscpd v5 | on (tree-wide ts/js/rs/py) |
| `page-size` | files over a per-glob line budget | on (`*+page.svelte` >280; no-op where nothing matches) |
| `file-size` | source over a line budget (warn >225, fail >300) | on (tree-wide `.ts .js .mjs .svelte .rs .py`) |
| `catalog` | dependency versions not single-sourced from a workspace catalog | on (a workspace must declare a catalog) |
| `require-deps` | org-required deps missing from the workspace catalog | on (`remeda`; set `deps: []` to opt out) |
| `require-eslint` | repo ships no root eslint flat config (eslint is org-mandatory) | on (`requireEslint: { enforce: false }` opts out) |
| `commit-msg` | commit message off Conventional Commits, or a sizeable change lacking a body | on (`commit-msg` hook; body required past 50 changed lines) |

Per-check semantics, tuning, and examples: **[docs/checks.md](docs/checks.md)**. Each check also has a standalone `nodeve-check-<name>` bin.

## Prose gate (Vale)

A second engine gates markdown _wording_ — [Vale](https://vale.sh) against the org house rules in `styles/nodeve/` (`Narration`, `Ephemeral`, `Hedging`, `Filler`, `SentenceLength`), an unguarded `md-prose` job (`packages.md-tools`) in `lefthook.checks.yml`. ALWAYS ON: it runs the package's own `.vale.ini` with vendored styles — no per-repo `.vale.ini`, no `vale sync`. Fails the commit if `md-prose` is missing. Rules: **[PROSE.md](PROSE.md)**.

It covers every staged `.md` — the scope `doc-tokens` budgets. One contract: stage a doc, it answers to both.

Run the rules ad hoc with **`nodeve-prose`** — one jumpable error per line, no `--config`:

```sh
pnpm exec nodeve-prose docs/levels.md   # Bun: bunx nodeve-prose …
```

## Fixers

Unlike the gates above, fixers mutate staged files and let lefthook re-stage them (`stage_fixed: true`). They run before the `checks` group so the gates see the fixed content.

- `nodeve-format` — prettier-formats staged code and config in place. Bundles its own prettier (nothing on PATH) yet honors the repo's prettier config, `.prettierignore`, and plugins. Skips symlinks. Exclude machine output and vendored code with `.prettierignore` — the lefthook glob stays wide.
- `md-fmt` — formats staged markdown; `md-lint` in `checks` fails on broken links. Both from nodeve's flake `packages.md-tools`, on PATH.

## Generators

- `nodeve-build-lib-names` — writes the committed lib-names index `helper-collisions` matches against (regenerate after dependency bumps). The committed index lets the gate skip installing the libs.
- `nodeve-build-helper-manifest` — **opt-in**; writes a greppable index of the public export surface of the configured packages. Grep it before adding a generic helper.

## Notes for Bun repos

The bins are plain Node ESM and run under Node from `node_modules/.bin`. lefthook in a Bun workspace still finds them on PATH; no `bunx` prefix needed.
