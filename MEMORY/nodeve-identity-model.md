---
name: nodeve-identity-model
description: "LinkML schema identity — Node table with permalink PK (slug_qualified), derived code, kebab slugs"
metadata: 
  node_type: memory
  type: project
  originSessionId: ec1ffa7f-0df0-4bb4-9e52-5e8495d3e74a
  modified: 2026-07-20T14:15:14.255Z
---

Decided 2026-07-20 for `packages/schema/linkml` (supersedes the uuid-PK and authored-code models tried the same day):

- **No `is_a: Node` inheritance** — every class carries a `node` slot (`identifier: true, range: Node`): PK that is FK to the Node table. Enforced one identity space, not convention.
- **Node = `[slug_qualified, code]`.** No uuid. `slug_qualified` is the permalink PK — a `uriorcurie` CURIE `node:<archetype-kebab>/<slug trail>` (prefix `node: https://nodeve.dev/node/`) captured at mint time; mint-once, NEVER re-derived on rename (append-only `examples/nodes.yaml`, minted by `format.ts`).
- **Docs self-describe class**: `archetype` slot (`designates_type: true, range: uriorcurie`) holds the exact class CURIE (`nodeve:Inverter` — upper-first, validator-enforced); permalink root = kebab of its local name.
- **`code`** = 8-char Crockford of `sha1(https://nodeve.dev/node/<path>)` last 5 bytes — a human handle DERIVED from the permalink, not authored.
- **`slug` is kebab-case** (url idiom). Wire/HA snake form derives mechanically (`s/-/_/`), like the [[grimoire-ts-camel-only]] camel annotation: authored form one, derived forms mechanical.

**Why:** uuids added opacity without stability the frozen permalink didn't already give; authored codes contradicted code-derives-from-id.

**How to apply:** never re-derive a minted `slug_qualified` or `code`; formatter passes inject/mint, hand edits only delete.
