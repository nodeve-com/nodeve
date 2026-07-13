# @nodeve/schema-case

Casing projections of a snake_case JSON Schema (draft-07).

A schema authored snake_case is the wire contract; TypeScript consumers code camelCase. This package performs the conversion — the draft-07 grammar (which positions hold property **names** vs **values**) is stated and tested here.

```ts
import { camelizeSchema, camelizeInstance, snakePath } from '@nodeve/schema-case';

const camel = camelizeSchema(snakeSchema); // camelCase sibling schema, `x-key-map` stamped per node
camelizeInstance(camel, snakeData); // data renamed BY THE MAP — declared props only, before validation
snakePath(camel, '/ingest/ingestKind'); // → '/ingest/ingest_kind' (errors point at the snake source)
```

- **Names rename; values never do.** `properties` keys, `required` members, `dependencies` — including inside `allOf`/`if`/`then`/`else` — move. `enum`/`const`/`default`/`pattern`, `patternProperties`/`$defs` keys, `$ref` targets, and data-bearing instance keys (slugs, locale tags, record keys) are untouched.
- **Mapping-driven, never algorithmic.** `camelizeSchema` stamps each renamed object node with `x-key-map` (snake→camel, differing keys only). Instance renames and reverse path lookups read the map; no runtime string transformation.
- Zero dependencies; pure functions; inputs never mutated.
