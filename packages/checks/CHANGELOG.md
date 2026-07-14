# @nodeve/checks

## 1.9.0

### Minor Changes

- catalog: gate the root `package.json` too. The check now scans every manifest the package manager installs from — each workspace package **and** the repo root — so a literal version pin in root `devDependencies` (shared tooling especially) fails the gate instead of slipping through.

## 1.8.0

### Minor Changes

- Add the `require-eslint` gate: fail commits in packages that have adopted eslint org-wide but lack a resolvable eslint config, keeping the org's lint baseline enforced.

## 1.7.0

### Minor Changes

- Add the `find-similar-svelte` bin: structural-similarity scan over `.svelte` files, surfacing near-duplicate components by shape.

## 1.6.0

### Minor Changes

- Add the `plural-arrays` check: fails when a count-plural variable name (`users`, `tags`) is bound to a map/object rather than an array — an object literal, `new Map()`, a `Record<…>`/index-signature type, or an `Object.fromEntries()`-style builder. A `Set` is treated as array-like and left alone. `pluralize` decides what reads as plural (so `status`, irregulars, and `xById`/`xMap`/`xToY` names are handled); the `pluralArrays.plural` / `pluralArrays.singular` word lists correct its domain misses, and `pluralArrays.allowlist` (as `relPath::name`) exempts a confirmed intentional binding. On by default over `apps/` and `packages/`.

## 1.5.2

### Patch Changes

- aa732e3: clones: fail loudly when jscpd can't be resolved instead of silently skipping. jscpd is a hard dependency, so an unresolvable binary means the install is broken and the copy-paste gate is blind — surfacing that is safer than a silent skip that leaves a repo believing it's covered.

## 1.5.1

### Patch Changes

- c689c52: helper-collisions: a missing lib-names index no longer silently passes. Previously `loadLibIndex` returned `[]` when the index file was absent, so a repo that opted into the gate (via `helperCollisions.libs`) but hadn't committed the generated index would see the check go green while checking nothing. It now fails loudly when `libs` is configured but the index is missing, pointing at `nodeve-build-lib-names` (or opting out with `libs: []`).

## 1.5.0

### Minor Changes

- Failing/warning check blocks now end with a name-specific rerun pointer (`Run just this check: pnpm exec nodeve-check <name> · bunx nodeve-check <name>`), so a developer who hits a gate can reproduce just that check by hand. Both package managers are shown since the bin is not a script and needs the resolver.

## 1.4.0

### Minor Changes

- clones: remove the `*.{ts,js}` lefthook trigger glob so the gate fires on every commit. The glob only gated whether the job ran based on staged file extensions, but `clones` ignores `{staged_files}` and scans its full configured scope — so a commit staging only a non-listed language (e.g. Rust) silently skipped the scan. The set of languages scanned is now owned solely by `clones.formats` in `nodeve.checks.js`, so opting a language in takes one config change and no lefthook override.

## 1.3.0

### Minor Changes

- ec17544: Add `nodeve-check`, a single dispatcher for every check, and unify their output.

  - `nodeve-check <name> [paths] [--explain]` runs one check; a bare `nodeve-check` (or `nodeve-check all`) runs the whole pre-commit suite **summary-first** — a status line per check, a tally, then a detail block for each that failed or warned; `nodeve-check list` lists them.
  - Every check now renders the **same uniform block**: `<glyph> <name> — <summary>`, indented detail rows, and the check's remediation guidance — so the parallel gate's failure dump is scannable instead of a wall of per-check formats. A new `--explain` flag expands each check's bulky per-finding detail inline (clones code fragments, inline-dupes file lists), which is otherwise summarized to keep the gate output tight.
  - Checks were refactored from "print + `process.exit`" into modules that return a structured `CheckResult`, with one shared reporter; behavior and exit codes are unchanged. The per-check `nodeve-check-<name>` bins remain for direct invocation, and `lefthook.checks.yml` now shells `nodeve-check <name>` per job (consumers pick it up from the existing `extends` line; run `pnpm install` to materialize the new bin).
  - The high-volume checks now lead with identifiers, not evidence: `clones` shows each duplicate's two `file:line-range` locations (the shared code fragment only under `--explain`), and `inline-dupes` shows each name + its file count (the full file list only under `--explain`). On a repo with many findings this is the difference between a scannable list and a thousand-line wall — the line ranges already point at the code.

## 1.2.1

### Patch Changes

- e337361: The clone-detection gate now uses jscpd's `consoleFull` reporter, so a failing run prints each duplicated block with both file locations and the offending code inline instead of just a summary table.

## 1.2.0

### Minor Changes

- 260fd11: Add `nodeve-check-commit-msg`: a Conventional Commits gate on the `commit-msg` hook. It validates the header (`<type>(<scope>)!: <subject>` against the standard type set and a subject-length cap) and requires a body once the staged diff grows past `commitMsg.bodyRequiredOverLines` (default 50) changed lines — so non-trivial commits explain the why. Merge/revert/fixup messages are skipped; `commitMsg.enforce: false` opts out. Wired in via the shared `lefthook.checks.yml`, so consumers pick it up from the existing `extends` line (run `lefthook install` once to register the new hook).

## 1.1.0

### Minor Changes

- Add `nodeve-check-clones`, a structural copy-paste gate backed by jscpd v5 (the Rust `cpd` binary): it flags duplicated code blocks living in function bodies that the name-based gates can't see, scanning the full configured scope and no-op'ing cleanly when the jscpd binary isn't installed. On by default (`apps/`, `packages/`), strict (`threshold: 0`, `minTokens: 50`).

  Also add `helperCollisions.aliases` — a map from a real lib export to the other names it's known by, seeded with the common lodash→remeda renames — so a reinvention whose name shares no tokens with the export still flags (e.g. local `upperFirst` ≈ remeda `capitalize`). Adds `jscpd` as a dependency.

### Patch Changes

- Updated dependencies
  - @nodeve/text@2.1.0

## 1.0.0

### Major Changes

- cc1b2a7: Single-source the config defaults. `DEFAULTS` is now authored in one place (`defaults.ts`) as a bare `export default {...} satisfies Config` — itself a valid `nodeve.checks.js` — so it doubles as the copyable reference.

  - **Breaking:** the package no longer ships `nodeve.checks.example.js`. Scaffold from `node_modules/@nodeve/checks/nodeve.checks.defaults.js` instead (the org defaults verbatim, every key at its real default value), and keep only the keys you change.
  - Adds an `@nodeve/checks/defaults` export so the defaults are importable (`import DEFAULTS from '@nodeve/checks/defaults'`).
  - `@nodeve/checks/config` still re-exports `DEFAULTS` unchanged.

## 0.5.0

### Minor Changes

- format-markdown: new `nodeve-format-markdown` fixer, wired into the shared lefthook config by default. It prettier-formats staged `*.md` in place and re-stages them (`stage_fixed`), so docs land formatted without a manual `prettier --write`. The bin bundles its own prettier — portable across pnpm and bun, nothing needed on PATH — while still honoring the repo's prettier config, `.prettierignore`, and plugins. Symlinked docs are skipped. Runs before the `checks` group so the gates see formatted content.

  page-size: enable the SvelteKit page budget by default. `pageSize` now ships a default rule of `{ glob: '*+page.svelte', maxLines: 280 }` instead of an empty rules list, so any `+page.svelte` over 280 lines fails the commit gate out of the box. The glob is a no-op in repos with no SvelteKit pages. The failure message now tells you to rip inline components out into their own files. Override or clear `pageSize.rules` in `nodeve.checks.js` to opt out or retune (the array replaces the default).

## 0.4.2

### Patch Changes

- Updated dependencies [63bcd90]
  - @nodeve/text@2.0.0

## 0.4.1

### Patch Changes

- Updated dependencies
  - @nodeve/text@1.0.0

## 0.4.0

### Minor Changes

- Add the `file-size` check (on by default): TS sources in `apps/` and `packages/` get a line budget — a non-blocking nudge past 225 lines, a hard fail past 300. Size is the cheapest proxy for a file that has taken on more than one job; the failure message reframes it as a step-back (name the distinct responsibilities, give each its own module, group related files in a directory without adding call-site friction) rather than a mechanical "split." Unlike the other `.ts` checks it does not auto-skip tests or `.d.ts` — a long file is a long file; genuinely single-responsibility files that run long (a schema, a lookup table, a table-driven test) go in `fileSize.allowlist`. Tune per repo via `fileSize: { warnLines, maxLines, globs, allowlist }`.

  Note for existing consumers: a repo with TS files over 300 lines in `apps/`/`packages/` will newly fail the commit gate until they're split, allowlisted, or the budget is raised.

  Internal: extracted the helper-manifest generator's source-parsing layer into `lib/manifest-ast.ts`, dogfooding the new budget.

## 0.3.0

### Minor Changes

- 0be521e: inline-dupes now scans `packages/` in addition to `apps/` by default, matching reshape and helper-collisions. Its guidance also now calls out the case where a whole _set_ of names recurs together (a shared prologue, the same handful of locals): pull them into one module behind a shared TS type rather than allowlist each name. Repos whose `packages/` legitimately repeat top-level names can still scope it back with `inlineDupes: { globs: ['apps/*.ts'] }`.

## 0.2.0

### Minor Changes

- Add the `require-deps` check (on by default): the workspace catalog must define each org-required dependency, defaulting to `remeda`. It gates the catalog, not each package's deps — so the blessed version is single-sourced and ready to adopt with `catalog:` without forcing the dep on packages that don't use it. Set `requireDeps: { deps: [] }` to opt out.

  Also: per-repo config now deep-merges over the defaults (via remeda `mergeDeep`) instead of a shallow per-section merge — nested records like `docTokens.overrides` merge key-by-key, while arrays like `docTokens.enforce` still replace wholesale.

  Note for existing consumers: a repo whose catalog doesn't define `remeda` will newly fail the commit gate until it's added to the catalog (or `require-deps` is opted out).

## 0.1.2

### Patch Changes

- doc-tokens: enforce README.md budgets by default. The default `enforce` pathspecs now include the root `README.md` and `*/README.md` (every README at any depth), alongside the existing CLAUDE.md / guide / docs scopes.

## 0.1.1

### Patch Changes

- Wrap the shared lefthook checks in a pre-commit job group named `checks` instead of emitting them as top-level parallel jobs. lefthook merges same-named group jobs, so a consumer that already has its own `checks` group (e.g. one that runs index-mutating fixers first, then a parallel typecheck/test group) now gets the shared bins merged INTO that group from a single `extends` line — no more piped/parallel conflict from the old top-level form, and no need to hand-copy each bin. Repos with no `checks` group are unaffected.
