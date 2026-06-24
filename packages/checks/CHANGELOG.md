# @nodeve/checks

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
