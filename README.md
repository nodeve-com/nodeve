# nodeve

Public npm packages (see `packages/`).

## Toolchain

**pnpm** for dependencies and publishing, **Bun** for execution where we own the runtime.

- **pnpm** owns dependencies, workspaces, and releases. Strict `node_modules` catches phantom dependencies; `workspace:` gives scoped packages a clean publishing story.
- **Bun** runs scripts and tests in our own apps and consumers.
- **Pre-commit gate is lefthook** (`lefthook.yml`)
- **Don't reshape data unless reshape is the point.**

## Guardrails

Keep the pnpm/Bun split safe for published packages:

1. **Correctness tests run on Node** in CI, across the `engines` range. Bun is an extra matrix entry.
2. **No Bun-isms in published code** — no `bun:*` imports or Bun globals in shipped code. Fine in apps and scripts.
3. **CI installs with pnpm.** Execute with Bun (`bun run`, `bun test`), install with pnpm.
