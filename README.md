# nodeve

Org-scoped npm packages, published publicly.

## Toolchain

This monorepo uses **pnpm** for dependency management and publishing, and **Bun** for execution where we control the runtime.

- **pnpm** owns dependencies, workspaces, and releases. Its strict `node_modules` layout catches phantom dependencies before they reach consumers, and its `workspace:` protocol gives a clean publishing story for our scoped packages.
- **Bun** is used to run scripts and tests in our own apps and consumers, where the runtime is ours to choose.

## Guardrails

These keep the pnpm/Bun split safe for published packages:

1. **Correctness tests run on Node** in CI, across the supported `engines` range. Bun may be an additional matrix entry, never a replacement — this prevents "passes in Bun, breaks for a Node consumer" bugs.
2. **No Bun-isms in published code.** No `bun:*` imports or Bun globals in anything a package ships. Fine in app code and scripts.
3. **CI installs with pnpm, not Bun.** Use Bun to *execute* (`bun run`, `bun test`), but let pnpm install the publishable packages' deps so the strictness guarantee holds.
