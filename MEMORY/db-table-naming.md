---
name: db-table-naming
description: DB tables are named singular across the ecosystem (platform confirms it); keyed collections follow suit
metadata:
  node_type: memory
  type: project
  originSessionId: fb798591-14f7-46aa-8cd9-577460fcbfe2
---

Database tables are named **singular**, not plural. Confirmed in `pumpspotting/platform` (`packages/db/src/schema/*.schema.ts`): every `pgTable` is singular — `mutation`, `relation`, `action`, `file`, `image`, `role`, `email`, `content`, `device`, `domain`, `content_tag`, … (SQL name snake_case, exported const singular camelCase). No plurals anywhere in the schema.

**Why:** a table is a keyed-by-id collection; naming it singular reads at the row/query site (`select().from(role).where(...)`).

**How to apply:** new tables singular. The rule generalizes to in-memory keyed collections too — a `Map` (or plain-object dictionary) is the same shape as a table, so it takes a singular / `xById`-style name, never a bare count-plural. This is the principle behind the `plural-arrays` check ([[nodeve-checks]]): a count-plural name must hold an array; a `Map`/object is flagged because it should be singular. A `Set` is exempt (array-like). See [[nodeve-ecosystem]] for the platform repo.
