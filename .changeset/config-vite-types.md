---
'@nodeve/config': patch
---

Ship type declarations for the `./vite` subpath. `vitestProjects` is imported into apps' `vite.config.ts` (a type-checked TS file), so the missing `.d.ts` + `types` export condition surfaced as an implicit-`any` error under `svelte-check`/`tsc`. Adds `vite/index.d.ts` and a `types` condition to the `./vite` export.
