---
'@nodeve/checks': major
---

`nodeve-format` skips `*.md`. A new `md-fmt` fixer formats staged markdown (rumdl's safe fixes, then dprint's layout) and an `md-lint` job in the `checks` group fails on broken relative links and heading structure. Both are native binaries from nodeve's flake (`packages.md-tools`), not node deps: a consumer needs them on PATH, as it already needs `vale`. Add `inputs.nodeve.packages.${system}.md-tools` to the repo's devShell.

`package-check` runs `check` only in the packages a commit touches (each staged path's nearest `package.json`); an untouched package never blocks a commit.
