---
'@nodeve/checks': minor
---

Checks scope the whole tree, not `apps/`/`packages/`. `file-size` budgets `.ts .js .mjs .svelte .rs .py`; `clones` scans `.` in typescript/javascript/rust/python; `reshape`, `plural-arrays`, `inline-dupes`, `helper-collisions` cover every `.ts`. Every scope ignores `.d.ts`. The lefthook `file-size` job glob matches the same extensions.
