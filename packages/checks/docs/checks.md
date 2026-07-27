# Check behavior

Per-check semantics and config. The check list and wiring live in the [README](../README.md).

## The length engine — `doc-tokens`, `page-size`, `file-size`

Three checks, one engine (`lib/length.ts`) over one config shape: scope `globs`, an `ignore` list, a default `warn` and/or `fail` tier, and per-glob `overrides`. A tier bounds `maxLines` and/or `maxTokens` (omit an axis to leave it unbounded); `fail` blocks the commit, `warn` only nudges. An override merges its tiers per-axis over the default for files matching its glob (later overrides win), or drops them with `tiers: 'exempt'`. That one mechanism covers a one-off bigger budget, a soft pre-warn, and a full exemption alike:

```js
export default {
	fileSize: {
		// long-but-cohesive CLIs get 400 lines; everything else stays at the 225/300 default
		overrides: [{ glob: 'packages/scripts/*.ts', tiers: { fail: { maxLines: 400 } } }],
	},
	docTokens: {
		overrides: [{ glob: 'packages/content/README.md', tiers: { fail: { maxTokens: 2500 } } }],
	},
};
```

`ignore` outranks both `globs` and every override glob — an ignored path stays out of scope past any later override, broad ones included.

`doc-tokens` budgets EVERY tracked `.md`, the same scope the prose gate covers, so staging a doc means it conforms. An index (`README`/`CLAUDE`/`AGENTS`) gets half the token budget: its cost lands on every visit, while a detail page costs only when opened. Over budget means CUT — delete what isn't load-bearing, then compress what survives. Splitting adds a file, a link table, and re-stated context, so it pays only for an index that grew. Split one by moving each section to the page that owns it, leaving one line per link. CHANGELOGs sit in the default `ignore`: a generator writes them, so cutting can't hold them under a budget.

`page-size` is the opt-in member: its default `globs` is empty, so only files a configured override glob matches get a budget.

## `commit-msg`

The one gate on the `commit-msg` hook, not `pre-commit`: lefthook hands it the message file (`{1}`). It checks the header against Conventional Commits — `<type>(<scope>)!: <subject>`, `type` one of `commitMsg.types`, subject under `maxSubjectLength`. Past `commitMsg.bodyRequiredOverLines` changed lines (from the **staged** diff, not the commit type) a body becomes mandatory — at that size the subject alone can't carry the "why". It skips merge, revert, and `fixup!`/`squash!`/`amend!` messages (git or rebase owns those). Set `commitMsg: { enforce: false }` to opt out, or `requireScope: true` to mandate a scope.

## `catalog` and `require-deps`

`catalog` works with both pnpm (catalog in `pnpm-workspace.yaml`) and Bun (catalog in `package.json#workspaces`), auto-detecting whichever the repo uses. A workspace **must** declare a catalog — a repo with none fails, since the point is keeping versions aligned. Every dependency (deps, devDeps, peers) across every installed manifest — each workspace package **and the root `package.json`** — must reference `catalog:`, not a literal pin. Opt out with `catalog: { enforce: false }`.

`require-deps` keeps the org's blessed libraries single-sourced: it fails when the workspace catalog (default or a named group) lacks a required name. It checks the catalog, not each package's deps. So it never forces the dep on a package that skips it — it just guarantees the version is there to adopt with `catalog:`. Defaults to `remeda`; set `requireDeps: { deps: [] }` to opt out.

## `plural-arrays`

Reads a count-plural variable name as a promise of a list. It fails when the binding provably isn't one — an object literal, `new Map()`, a `Record<…>`/index-signature type, or an `Object.fromEntries()`-style builder. It leaves a `Set` alone: array-like (ordered, iterable, spreads with `[...set]`), so a plural name over it reads fine. It flags only what the type or initializer proves; a plural bound to an array, a `.map()` chain, an opaque call, or nothing stays. [`pluralize`](https://www.npmjs.com/package/pluralize) decides what reads as plural — it handles `status`, irregulars like `children`/`people`, and `xById`/`xMap`/`xToY` names. Two word lists correct its domain misses: `plural` forces a word to count, `singular` exempts an `-s` noun it over-counts (seeded with `data`, `metadata`, `series`, `news`):

```js
export default {
	pluralArrays: {
		plural: ['props', 'attrs'], // force-count these even if pluralize disagrees
		singular: ['data', 'series'], // never count these
		allowlist: ['src/store.ts::sessions'], // a confirmed intentional map, as relPath::name
	},
};
```

## `helper-collisions`

Compares local helper declarations to dependency function exports in `.nodeve/lib-names.json`. Some libraries expose generic function names whose domain the package name implies, such as `date-fns.format`; configure `helperCollisions.libKeywords` to also match each real export with those domain words appended/prepended:

```js
export default {
	helperCollisions: {
		libs: ['remeda', 'date-fns'],
		libKeywords: { 'date-fns': ['Date'] },
	},
};
```

With that config, `formatDate` reports as a collision with `date-fns.format`, while the recommended function remains the real dependency export.

A reinvention often borrows a _different_ library's name, sharing no tokens with the blessed export — lodash's `upperFirst` is remeda's `capitalize`. `helperCollisions.aliases` maps each real export to its other known names so those still match; the defaults seed the common lodash→remeda renames (`capitalize: ['upperFirst']`, `fromEntries: ['fromPairs']`, …).

## `clones`

The structural counterpart to the name gates: it shells [jscpd v5](https://jscpd.dev) (a fast Rust copy-paste detector) over `clones.paths`, failing on any duplicated block past `clones.minTokens`/`minLines`. That's reuse hiding in function _bodies_ that `inline-dupes`/`helper-collisions` can't see by name. Tune `minTokens`/`threshold`, narrow with `clones.ignore` globs, or `--warn` to downgrade. jscpd's native binary is optional, so the gate no-ops where it isn't installed rather than blocking.
