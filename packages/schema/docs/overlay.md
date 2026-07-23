# Schema & Validation

## Two Schema Layers

### Database Schema - (facets)

Each facet (`feature`, `interval`, `register_map`, `product`, …) are reusable SQL narrow tables. They hold facts any NodeType can use. When a facet needs to hold more than one row related to the Node it must itself have a unique node id row. Adding a NodeType typically does not add a table with unique columns — see [mapping.md](mapping.md).

The most common NodeType definition may have a facet table named after them. Organization is also a table that holds organization-specific data.

### Runtime Schema - (NodeTypes)

A `node_type` (`data/node_type/<slug>.yaml`) sits _on top of_ those tables and says how one node type assembles facets. It refines the shared core, authored once per node type, never a device-shaped table.

## Content — the universal facet

Content attaches to ANY node through its own `about` FK (→ `node`), so Content is one top-level `Catalog.contents` row-set — never a `contents` slot per class. A per-class `contents` slot makes the relmodel transformer mint one nullable backref column on `content` per parent; with none, `content` is `node/about/language/title/lede/body` + one `catalog_id`. Auto-composed into every node type, never authored in `facet:`. A new pointer target (registry, feature type, …) adds no column — `about` already reaches it.

## Why overlay instead of wider tables

A 1:1 facet shares its node PK, so its FK-to-`node` column IS the ID column — no separate id space. Child facets attach to the node directly and tie back through `node.parent`, retiring the old `subject_node` hub row (which stamped a backref FK on every child). `subject_node` survives only as a thin marker `{ node, register_map }` — a catalogued device plus the one non-owned reference, the shared family register map.

## What runs today

`normalize/tree.ts` walks each `data/subject_node/<slug>/` device and enforces:

- unknown `node_type` → dies (constructor)
- an authored feature whose `feature_type` isn't a known row → dies (`featureType`)
- a part key outside the feature's `part_set` members or `count` → dies (`checkPart`)
- a quantity the feature type disallows → dies (`part`)

Each feature names its own role freely — the node type composes facet _tables_, coarser than the old per-role socket. Facet composition itself is data: `node_type.facets` rows.

## Emitted as rows

- **`node_type` + `facet` rows** — `normalize/catalog.ts` emits the `node_types` row-set (authored device kinds + derived stubs), each carrying its `facets`. Composition is live data, not a normalize-time lookup only.
- **facet row-sets** — each device fans out into top-level row-sets (`products`, `feature_of_interests`, …) tied to its node by `node.parent` (children) or a shared PK (1:1). No container nesting.

## Declared but inert

- **`required`** — every `facet` binding carries it, yet `normalize/` reads it nowhere. No check yet fires when a required facet is missing.

## One-line model

The NodeType declaration defines **how to author and fetch** (tables to join) its data.
