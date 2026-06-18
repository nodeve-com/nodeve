# @nodeve/checks

## 0.1.1

### Patch Changes

- Wrap the shared lefthook checks in a pre-commit job group named `checks` instead of emitting them as top-level parallel jobs. lefthook merges same-named group jobs, so a consumer that already has its own `checks` group (e.g. one that runs index-mutating fixers first, then a parallel typecheck/test group) now gets the shared bins merged INTO that group from a single `extends` line — no more piped/parallel conflict from the old top-level form, and no need to hand-copy each bin. Repos with no `checks` group are unaffected.
