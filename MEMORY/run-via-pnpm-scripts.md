---
name: run-via-pnpm-scripts
description: 'Run repo commands through pnpm scripts (vitest/tsc/node), never bun — no Bun in this repo'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 90e5dfc9-c5cb-4a5a-96c5-aeb833033476
---

Verify with the repo's own `pnpm` scripts — `pnpm test` (vitest), `pnpm typecheck` (tsc), `pnpm generate`/`pnpm guards` (which run `node generate.ts` / `node scripts/*.ts`). **Never run `bun` anything** — there is no Bun in this repo.

**Why:** pnpm owns the command surface; Node runs the scripts ([[why-pnpm]]). Reaching for `bun` (`bun test`, `bunx tsc`, `bun generate.ts`) runs a different runtime/runner than the repo uses and misleads. User corrected this directly, twice — and then removed Bun from the repo entirely because ad-hoc `bun` invocations kept causing confusion.

**How to apply:** before running a check, read `package.json` scripts and invoke the named pnpm script.
