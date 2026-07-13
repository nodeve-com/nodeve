---
name: why-pnpm
description: nodeve uses pnpm for everything and Node to run scripts — no Bun in this repo
metadata:
  node_type: memory
  type: project
  originSessionId: 703fc84a-f135-4527-9f8e-8ccdd6694500
---

nodeve publishes org-scoped packages publicly. pnpm owns everything — dependencies, workspaces, publishing — and **Node** runs every owned script (Node strips TS, so `node generate.ts` just works). **No Bun in this repo** — the user removed it deliberately (it caused confusion about which runtime to use).

**Why:** pnpm's strict `node_modules` layout catches phantom dependencies before they reach external consumers, and its `workspace:` protocol gives a clean publishing story. Running on Node (not Bun) means the dev runtime IS the consumer runtime — no Bun/Node behavior gap hiding bugs until a consumer hits them.

**How to apply:** CI installs with pnpm and runs correctness tests on Node across the supported `engines` range. Package `scripts` invoke `node …`, never `bun …`; the test runner is vitest via `pnpm test`. Keep `bun:*` imports and Bun globals out of the whole repo. (Cross-repo: `familiar` is still a Bun workspace, and `@nodeve/checks` supports Bun _consumers_ — that's separate from nodeve's own runtime.) See [[run-via-pnpm-scripts]].
