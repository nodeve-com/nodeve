# Facets — the foundational idea

An instance of a **NodeType** is one addressable identity. It has a `node` row and often `content` rows for title, lede, body.

A **facet** is one group of properties describing a node. It shares the node id. It says _more about the same thing_ exactly once.

You **compose** a NodeType from facets — its `node_type.facets` rows name which ones, as data, never a hardcoded class. The thing sums its facets. To describe more, add a facet — never an identity.

A **1:1 facet** (`product`, `physical`) shares the node PK. A **child facet** that holds more than one row per node (`feature_of_interest`, `setting`, …) gets its own node id per row, tied back by `node.parent` — the nearest ancestor in the permalink trail. `content` is the universal child facet: it uses its own `about` FK (it must, being about-attached to any node) rather than the trail.

## Facets fan out in storage, not in identity

One thing's facets project to different places — some columns on a row, some co-rows sharing the node, some inline on an enum member. That is projection detail. Identity stays singular. Never read the fan-out as separate things.

## Instances

- **`Interval`** — `Specification`, `Measurement`, `ValuedRange` are width facets. Same node, no segment. → [levels.md](levels.md#node--addressable-identity)
- **Concept** — `title`/`lede`, `meaning`, `*_mappings`, `i18n` are facets of one concept. → [concepts.md](concepts.md)
- **Enum member** — each permissible value carries its **whole facet set** inline. So never promote an enum to rows to attach refs or translations — the facets compose in place. → [concepts.md](concepts.md)

Same idea every time: one identity, many facets.
