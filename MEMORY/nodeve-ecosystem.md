---
name: nodeve-ecosystem
description: nodeve vs familiar vs platform — which package manager each uses and the shared config package
metadata: 
  node_type: memory
  type: project
  originSessionId: 703fc84a-f135-4527-9f8e-8ccdd6694500
---

Three related repos share one config source of truth, but use different package managers — running the wrong one in the wrong repo fails confusingly.

- **nodeve** (`~/dev/nodeve`, GitHub org `nodeve-com`, npm scope `@nodeve`): **pnpm** workspace; the repo that *publishes* public packages via changesets (`pnpm release` = build + `changeset publish`). Home of **`@nodeve/config`** — the shared config package exposing `@nodeve/config/tsconfig` (uniform ES2023 + NodeNext + declaration), `@nodeve/config/prettier`, and `@nodeve/config/prettier/base`.
- **familiar** (`~/dev/familiar`): **bun** workspace (catalog lives under `workspaces.catalog` in package.json). Use `bun install` — never `pnpm` (pnpm can't read bun's catalog → `ERR_PNPM_CATALOG_ENTRY_NOT_FOUND`). Consumes `@nodeve/config`. Its old `.prettierrc` used spaces; the shared base uses tabs, so adopting it reformats the whole codebase.
- **pumpspotting/platform** (`~/dev/pumpspotting/platform`, npm scope `@pumpspotting`): **pnpm** workspace, consumer. Migrating to `@nodeve/config` slowly. `@pumpspotting/prettier-config` is now a thin re-export shim of `@nodeve/config`. tsconfig still on its bundler/esnext base; moves to NodeNext incrementally.

**Why:** uniform formatting + TS config across all three, with nodeve as the single published source. Direction is Bun + ES2023 + NodeNext.

**How to apply:** publish/release only from nodeve with pnpm; install in familiar with bun and in platform with pnpm. After publishing a new `@nodeve/config`, the npm read CDN can lag several minutes (GET 404s while the package is already live) — installs that 404 immediately after publish are just propagation, not a real failure.
