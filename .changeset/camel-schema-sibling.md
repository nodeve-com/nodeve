---
'@nodeve/schema': minor
---

Ship the camelCase sibling schema. `gen/catalog.camel.schema.json` joins the tarball and `exports` as `./catalog.camel.schema.json` — snake_case stays the wire contract, TypeScript consumers check against the sibling. Projected by `@nodeve/schema-case`, which stamps `x-key-map` per renamed node, so an instance renames by the map rather than a runtime string transform. Class names under `$defs`, `$ref` targets, and every `enum`/`const` value stay put, so both siblings dispatch on the same names.
