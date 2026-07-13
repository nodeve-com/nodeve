# nodeve

Public npm packages (see `packages/`).

## Toolchain

**pnpm** for everything. **Node** runs the scripts — no Bun in this repo.

- **pnpm** owns dependencies, workspaces, and releases. Strict `node_modules` catches phantom dependencies; `workspace:` gives scoped packages a clean publishing story.
- **Node runs the code** — `generate`, guards, and every other owned script run on Node directly (Node strips TS). The test runner is **vitest** — invoke it via `pnpm test`.
- **Pre-commit gate is lefthook** (`lefthook.yml`)
- **Don't reshape data unless reshape is the point.**

### Running checks

- `pnpm check` — whole check suite over the **working tree**, stage-free, no side effects. Use while editing.
- `pnpm check:gate` — the **actual pre-commit gate** via lefthook: staged-file scoped, plus the markdown fixer and dist rebuild. Use to preview a commit without committing.

## Guardrails

Keep published packages Node-clean:

1. **Correctness tests run on Node** in CI, across the `engines` range.
2. **No `bun:*` imports or Bun globals** anywhere — everything runs on Node.
3. **CI installs with pnpm.** Run via the pnpm scripts (`pnpm test`, `pnpm typecheck`, `pnpm generate`). Install with pnpm.
