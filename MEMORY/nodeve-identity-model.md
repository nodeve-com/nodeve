---
name: nodeve-identity-model
description: 'LinkML schema identity — Node = [permalink, code, node_type, slug, url]; slug/node_type/url on the node, node_types compose facets by cardinality'
metadata:
  node_type: memory
  type: project
  originSessionId: ec1ffa7f-0df0-4bb4-9e52-5e8495d3e74a
  modified: 2026-07-23T17:13:51.334Z
---

For `packages/schema/linkml`. Started 2026-07-20 (supersedes uuid-PK/authored-code); reshaped 2026-07-23:

- **No `is_a: Node`** — every facet class carries a `node` slot (`identifier: true, range: Node`): PK that is FK to Node. One identity space.
- **Node = `[permalink, code, node_type, slug, url]`.** `slug` (leaf, local id), `node_type` (root, the kind), `url` are IDENTITY — they live on the node, NOT repeated on facet tables. `slug` removed from all ~15 facet tables; the mint derives `node_type = node:node-type/<root-seg>`, `slug = <leaf-seg>` from the path.
- **`permalink`** = PK, `uriorcurie` CURIE `node:<node_type>/<slug path>`, meaning `wikidata:Q1048975` (exact), mint-once, never re-derived on rename.
- **`code`** = 8-char Crockford derived from the permalink hash; not authored.
- **`slug` from the filename** (or the DIRECTORY name for `subject_node`), NEVER authored — the normalizer rejects an authored `slug`. kebab-case; path segments kebab-ified (snake table names → kebab leaves). Pattern allows `_` (the one unnamed interval).
- **`node:` block** — node-level attrs (`url`) authored under a `node:` block, merged onto the minted node. Content is a child facet (own node ids, one per language), authored `content: {en:…}`, `about` → node.
- **`node_type` is universal**
- **Node types compose facets** — `NodeType` has `facets` (→ `Facet` rows keyed by `table`): each composed facet is `cardinality: single` (shares node id) or `child` (own node ids), plus `required`. Replaced the made-up `socket_binding`. A `content` facet (child) is AUTO-composed into every node_type at normalize (never authored). A table exists only for a type's exclusive columns; registry/organization compose only content → node_types, effectively table-less. See [[schema-is-the-source-not-data2schema]].

**How to apply:** never author `slug`/`code`; never re-derive a minted `permalink`.
