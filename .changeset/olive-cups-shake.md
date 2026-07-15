---
'@nodeve/checks': major
---

Format code, not just docs. The `format-markdown` fixer is now `format`, and the shared lefthook glob covers code and config (`ts,tsx,js,jsx,mjs,cjs,mts,cts,svelte,json,css,html,yml,yaml`) alongside `md`. `eslint-config-prettier` turns off every stylistic eslint rule, so with a markdown-only fixer nothing in the gate judged code formatting at all.

BREAKING: the `nodeve-format-markdown` bin is now `nodeve-format`. Repos that only `extends` the shared `lefthook.checks.yml` need no change — the job and the bin rename together. A repo shelling the old bin name directly must update it.

On adoption the first commit touching a long-unformatted file will reformat it. Exclude machine output and vendored code with `.prettierignore`; the glob stays wide.
