# @nodeve/checks

Org-wide commit-gate checks and helper-index generators, shared across nodeve repos. Each check reads an optional per-repo `nodeve.checks.js` and derives the repo root from git — so it behaves the same whatever directory the hook runner invokes it from. Wiring is via lefthook.

All checks run through one dispatcher, **`nodeve-check`**:

```sh
nodeve-check                 # run the whole pre-commit suite, summary-first
nodeve-check file-size       # run one check (paths/flags after the name)
nodeve-check file-size --explain   # show its full remediation prose
nodeve-check list            # list the check names
```

Every check renders the **same uniform block** — `<glyph> <name> — <summary>`, indented detail rows, and the check's remediation guidance — so the parallel gate's failure output is scannable rather than a wall of per-check formats. `--explain` expands each check's bulky per-finding detail inline (clones code fragments, inline-dupes file lists), which is otherwise summarized. A bare `nodeve-check` prints a status line per check, a tally, then a detail block for each that failed or warned.

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

Copy `node_modules/@nodeve/checks/nodeve.checks.defaults.js` to your repo root as `nodeve.checks.js` and keep ONLY the keys you change. That file is the org defaults verbatim — a valid `nodeve.checks.js` in the exact shape your config takes — so it doubles as the reference for every section and its default value. Omitted keys fall back to those defaults (deep-merged; arrays replace wholesale). It's importable too: `import DEFAULTS from '@nodeve/checks/defaults'`.

## Checks

| Check | What it gates | Default |
| --- | --- | --- |
| `doc-tokens` | markdown over a line/token budget | on (`CLAUDE.md`, `guide/`, `docs/`) |
| `reshape` | callbacks that reproduce their input shape (no-op / pick / clone) | on (`apps/`, `packages/`) |
| `plural-arrays` | count-plural names bound to a map/object instead of an array | on (`apps/`, `packages/`) |
| `inline-dupes` | non-exported top-level names declared in 2+ files | on (`apps/`, `packages/`) |
| `helper-collisions` | local helpers that fuzzily match a dependency export | on (needs lib-names index) |
| `clones` | structural copy-paste (duplicated code blocks) via jscpd v5 | on (`apps/`, `packages/`; no-op if the jscpd binary isn't installed) |
| `page-size` | files over a per-glob line budget | on (`*+page.svelte` >280; no-op where the glob matches nothing) |
| `file-size` | TS sources over a line budget (warn >225, fail >300) | on (`apps/`, `packages/`) |
| `catalog` | dependency versions not single-sourced from a workspace catalog | on (a workspace must declare a catalog) |
| `require-deps` | org-required deps missing from the workspace catalog | on (`remeda`; set `deps: []` to opt out) |
| `require-eslint` | repo ships no root eslint flat config (eslint is org-mandatory) | on (set `requireEslint: { enforce: false }` to opt out) |
| `commit-msg` | commit message off Conventional Commits, or a sizeable change with no body | on (`commit-msg` hook; body required past 50 changed lines) |

Run any of them as `nodeve-check <name>`. Each also has a standalone `nodeve-check-<name>` bin (identical behavior) for direct invocation.

`commit-msg` is the one gate that runs on the `commit-msg` hook rather than `pre-commit`: lefthook hands it the message file (`{1}`). It validates the header against Conventional Commits — `<type>(<scope>)!: <subject>`, where `type` must be one of `commitMsg.types` (the standard set) and the subject stays under `maxSubjectLength`. Past `commitMsg.bodyRequiredOverLines` changed lines — measured from the **staged** diff, not the commit type — a body becomes mandatory, because at that size the subject alone can't carry the "why". Merge, revert, and `fixup!`/`squash!`/`amend!` messages are skipped (git or rebase owns those). Set `commitMsg: { enforce: false }` to opt out, or `requireScope: true` to also mandate a scope.

`doc-tokens`, `page-size` and `file-size` are one engine (`lib/length.ts`) over one config shape — scope `globs`, a default `warn` and/or `fail` tier, and per-glob `overrides`. A tier bounds `maxLines` and/or `maxTokens` (omit an axis to leave it unbounded); `fail` blocks the commit, `warn` only nudges. An override merges its tiers per-axis over the default for files matching its glob (later overrides win), or drops them with `tiers: 'exempt'` — that one mechanism covers a one-off bigger budget, a soft pre-warn, and a full exemption alike:

```js
export default {
	fileSize: {
		// long-but-cohesive CLIs get 400 lines; everything else stays at the 225/300 default
		overrides: [{ glob: 'packages/scripts/*.ts', tiers: { fail: { maxLines: 400 } } }],
	},
	docTokens: {
		overrides: [{ glob: 'packages/content/README.md', tiers: { fail: { maxLines: 200 } } }],
	},
};
```

`page-size` is the opt-in member: its default `globs` is empty, so only files a configured override glob matches get a budget. `require-deps` keeps the org's blessed libraries single-sourced and visibly expected: it fails when the workspace catalog (default or a named group) doesn't define a required name. It checks the catalog, not each package's deps — so it doesn't force the dep on packages that don't use it, it just guarantees the version is there to adopt with `catalog:`. Defaults to requiring `remeda`; set `requireDeps: { deps: [] }` to opt out.

`catalog` works with both pnpm (catalog in `pnpm-workspace.yaml`) and Bun (catalog in `package.json#workspaces`) — it auto-detects whichever the repo uses. A workspace is **required** to declare a catalog: a repo with none fails the gate, since the point is keeping versions aligned. Every dependency (deps, devDeps, and peers alike) across every installed manifest — each workspace package **and the root `package.json`** — must reference `catalog:` rather than a literal pin. Opt a repo out deliberately with `catalog: { enforce: false }`.

`plural-arrays` reads a count-plural variable name as a promise of a list, and fails when the binding provably isn't one — an object literal, `new Map()`, a `Record<…>`/index-signature type, or an `Object.fromEntries()`-style builder. A `Set` is left alone on purpose: it's array-like (ordered, iterable, spreads to an array with `[...set]`), so a plural name over it reads fine. It only flags what it can prove from the declaration's type or initializer; a plural bound to an array, a `.map()` chain, an opaque call, or nothing is left alone. [`pluralize`](https://www.npmjs.com/package/pluralize) decides what reads as plural (so `status`, irregulars like `children`/`people`, and `xById`/`xMap`/`xToY` names are handled), and two word lists correct its domain misses — `plural` forces a word to count (`plural: ['props']`), `singular` exempts an `-s` noun it over-counts (seeded with `data`, `metadata`, `series`, `news`):

```js
export default {
	pluralArrays: {
		plural: ['props', 'attrs'], // force-count these even if pluralize disagrees
		singular: ['data', 'series'], // never count these
		allowlist: ['src/store.ts::sessions'], // a confirmed intentional map, as relPath::name
	},
};
```

`helper-collisions` compares local helper declarations to dependency function exports in `.nodeve/lib-names.json`. Some libraries expose generic function names whose domain is implied by the package name, such as `date-fns.format`; configure `helperCollisions.libKeywords` to also match each real export with those domain words appended/prepended:

```js
export default {
	helperCollisions: {
		libs: ['remeda', 'date-fns'],
		libKeywords: { 'date-fns': ['Date'] },
	},
};
```

With that config, `formatDate` reports as a collision with `date-fns.format`, while the recommended function remains the real dependency export.

A reinvention often borrows a _different_ library's name, which shares no tokens with the blessed export — lodash's `upperFirst` is remeda's `capitalize`. `helperCollisions.aliases` maps each real export to the other names it's known by, so those still match; the defaults seed the common lodash→remeda renames (`capitalize: ['upperFirst']`, `fromEntries: ['fromPairs']`, …).

`clones` is the structural counterpart to the name-based gates: it shells [jscpd v5](https://jscpd.dev) (a fast Rust copy-paste detector) over `clones.paths` and fails on any duplicated block past `clones.minTokens`/`minLines`. It catches reuse hiding in function _bodies_ that `inline-dupes`/`helper-collisions` can't see by name. Tune `minTokens`/`threshold`, narrow with `clones.ignore` globs, or `--warn` to downgrade. jscpd's native binary is an optional dependency, so the gate cleanly no-ops where it isn't installed rather than blocking a commit.

All blocking checks accept `--warn` (report-only, exit 0) and `--explain` (expand the remediation prose under the result); `doc-tokens` accepts `--report` to list the whole backlog without failing. Pass explicit paths to scope a run (lefthook passes `{staged_files}`).

## Fixers

Unlike the gates above, fixers mutate staged files and let lefthook re-stage them (`stage_fixed: true`). They run before the `checks` group so the gates see the fixed content.

- `nodeve-format-markdown` — prettier-formats staged `*.md` in place, so docs land formatted without a manual `prettier --write`. Bundles its own prettier (nothing needed on PATH, portable across pnpm and bun) yet honors the repo's prettier config, `.prettierignore`, and plugins, which prettier resolves per file. Skips symlinked docs (e.g. `CLAUDE.md` → `README.md`), which prettier can't format and which get formatted via their real target's own staged entry.

### Running ad hoc

`nodeve-check` is a **bin**, not a package script, so `pnpm run` / `bun run` won't find it — those run `package.json#scripts`. Invoke it through `exec` instead, which resolves `node_modules/.bin` for you (no hardcoded path needed):

```sh
pnpm exec nodeve-check doc-tokens 'README.md'   # or: pnpm nodeve-check doc-tokens ...
bunx nodeve-check doc-tokens 'README.md'         # Bun repos
pnpm exec nodeve-check                            # whole suite, summary-first
```

Quote globs so your shell doesn't expand them before the check sees them. Day to day you shouldn't need this — the checks run through lefthook on commit.

## Generators

- `nodeve-build-lib-names` — writes the committed lib-names index that `helper-collisions` matches against (regenerate after dependency bumps). The index is committed so the gate never needs the libs installed at check time.
- `nodeve-build-helper-manifest` — **opt-in**; writes a greppable index of the public export surface of the configured packages. Grep it before adding a generic helper.

## Notes for Bun repos

The bins are plain Node ESM and run under Node from `node_modules/.bin`. lefthook in a Bun workspace still finds them on PATH; no `bunx` prefix is needed.
