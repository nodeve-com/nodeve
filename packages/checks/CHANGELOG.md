# @nodeve/checks

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
