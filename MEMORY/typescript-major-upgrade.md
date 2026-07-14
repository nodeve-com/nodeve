---
name: typescript-major-upgrade
description: 'TS7 blocked by typescript-eslint; TS6 needs explicit types:["node"] and @types/node ^24'
metadata:
  node_type: memory
  type: project
  originSessionId: 5acd3e68-c8f1-4166-8f4e-a8f0258a03e8
---

Catalog TS is **6.x** (`^6.0.3`), not 7. Two blockers found upgrading past 5.x:

- **TS7 blocked**: `typescript-eslint` (through canary `8.64.1-alpha`) caps peer at `typescript <6.1.0`. Repo runs eslint as an org-wide commit gate ([[nodeve-checks]]), so TS7 breaks lint. Revisit when typescript-eslint ships TS7 support.
- **TS6 dropped ambient `@types/*` auto-scan**: node globals (`process`, `Buffer`, `TextEncoder`) go unresolved (TS2591/TS2304) unless the package tsconfig sets `"types": ["node"]`. Added to the 4 node packages (checks, encoding, grimoire, schema-case) — NOT the shared `@nodeve/config` tsconfig, since text/config have no `@types/node` and would error on missing 'node' type.
- `@types/node` catalog is `^24` (matches `engines: >=24`); TS6 also needs ≥24.

**Why:** blockers aren't in the changelog; rediscovering costs a full install+typecheck loop. **How to apply:** before retrying TS7, re-check `typescript-eslint` peer range; any new node package needs `types:["node"]`.
