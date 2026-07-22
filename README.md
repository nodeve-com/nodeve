# nodeve

Public npm packages (see `packages/`).

## Packages

- **@nodeve/checks** — org-wide commit-gate checks (doc budgets, reshape/dup/helper smells, page size) + helper-index generators, config-driven via lefthook.
- **@nodeve/config** — shared TypeScript, Prettier, and ESLint configuration.
- **@nodeve/encoding** — cross-runtime encoding/hashing helpers (stable short-codes and more).
- **@nodeve/schema** — central schema source authored as a relational LinkML model, projected for storage, validation, and code.
- **@nodeve/schema-case** — casing projections of a snake_case JSON Schema: camelCase sibling schema + key map, instance renaming, path back-references.
- **@nodeve/text** — small shared text utilities: fuzzy matching, boundary-aware trimming, slugify, word-wrap, sanitizing.

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
2. **No `bun:*` imports or Bun globals**.
3. **CI installs with pnpm.** Run via the pnpm scripts (`pnpm test`, `pnpm typecheck`, `pnpm generate`). Install with pnpm.
