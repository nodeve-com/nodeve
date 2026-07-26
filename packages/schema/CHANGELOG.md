# @nodeve/schema

## 0.2.0

### Minor Changes

- 1bebae0: Publish the LinkML schema package: `buildCatalog(root)` walks an authored tree into catalog rows, `load()` builds a SQLite database from them with `foreign_key_check` as the gate, and the `nodeve-schema` bin drives both from a shell. Ships both DDL dialects, the JSON Schema shape gate, the catalog rows, and the TypeScript types. Replaces `@nodeve/grimoire`.

### Patch Changes

- Updated dependencies [5c575aa]
  - @nodeve/text@2.2.0
