---
name: typescript-major-upgrade
description: 'TS7 (native, GA 7.0.2) drives per-package typecheck via catalog:ts7; API-consumers (checks, ts-eslint/root) stay TS6'
metadata:
  node_type: memory
  type: project
  originSessionId: 5acd3e68-c8f1-4166-8f4e-a8f0258a03e8
  modified: 2026-07-24T14:50:11.837Z
---

**TS7 adopted for typecheck only, via a role-split (2026-07-24).** TS 7.0.2 is GA (native Go compiler, bin `tsc`, ~10x). Two `typescript` versions coexist by role:

- **Default `catalog.typescript` stays 6.x** (`^6.0.3`) — feeds typescript-eslint's parser (root eslint, `ts.configs.recommended`, NOT type-checked). ts-eslint@8.65 still peer-caps `typescript <6.1.0`.
- **Named catalog `catalogs.ts7.typescript: 7.0.2`** — packages that are ONLY type-checked reference `catalog:ts7` for their `check`/`typecheck` (+ build emit; TS7 emits fine). Currently: encoding, text, schema-case, schema.
- **API-consumers MUST stay `catalog:` (6.x)**: any package importing the `typescript`/`ts-morph` compiler API at runtime — **@nodeve/checks** (ast.ts, manifest-ast.ts, reshape/plural-arrays/inline-dupes/helper-collisions) — breaks under TS7 (native pkg ships no JS compiler API; `import ts from 'typescript'` resolves to `lib/version`, missing `createSourceFile`/`isX`/`ts.Node`). Same wall ts-eslint hits. `.npmrc` `strict-peer-dependencies=false` + workspace `peerDependencyRules.allowedVersions.typescript: '7'` silence the cosmetic @nodeve/config peer warning.
- `tsc --noEmit` spikes deceive: they resolve `import ts from 'typescript'` against the INSTALLED typescript, so an API-consumer looks clean under a dlx TS7 until TS7 is actually installed in its node_modules.

**Legacy blocker (still true):** TS6 dropped ambient `@types/*` auto-scan**: node globals (`process`, `Buffer`, `TextEncoder`) go unresolved (TS2591/TS2304) unless the package tsconfig sets `"types": ["node"]`. Added to the 4 node packages (checks, encoding, grimoire, schema-case) — NOT the shared `@nodeve/config` tsconfig, since text/config have no `@types/node` and would error on missing 'node' type.

- `@types/node` catalog is `^24` (matches `engines: >=24`); TS6 also needs ≥24.

**Why:** blockers aren't in the changelog; rediscovering costs a full install+typecheck loop. **How to apply:** before retrying TS7, re-check `typescript-eslint` peer range; any new node package needs `types:["node"]`.
