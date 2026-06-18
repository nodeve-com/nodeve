---
name: why-pnpm
description: Why nodeve uses pnpm for deps/publishing and Bun only for execution
metadata: 
  node_type: memory
  type: project
  originSessionId: 703fc84a-f135-4527-9f8e-8ccdd6694500
---

nodeve publishes org-scoped packages publicly, so pnpm owns dependency management and publishing while Bun is used only to execute scripts/tests where we control the runtime.

**Why:** pnpm's strict `node_modules` layout catches phantom dependencies before they reach external consumers, and its `workspace:` protocol gives a clean publishing story. Bun's flatter layout would hide those bugs until a consumer hits them on Node.

**How to apply:** CI installs with pnpm (never Bun) and runs correctness tests on Node across the supported `engines` range; keep Bun-isms (`bun:*`, Bun globals) out of published code. Bun is fine for `bun run`/`bun test` in app code.
