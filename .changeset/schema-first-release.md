---
'@nodeve/schema': minor
---

Publish the LinkML schema package: `buildCatalog(root)` walks an authored tree into catalog rows, `load()` builds a SQLite database from them with `foreign_key_check` as the gate, and the `nodeve-schema` bin drives both from a shell. Ships both DDL dialects, the JSON Schema shape gate, the catalog rows, and the TypeScript types. Replaces `@nodeve/grimoire`.
