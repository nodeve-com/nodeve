# Facets — the foundational idea

An instance of a **NodeType** is one addressable identity. It has a `node` row and often `content` rows for title, lede, body.

A **facet** is one group of properties describing a SubjectNode. It shares the SubjectNode id. It says _more about the same thing_ exactly once.

You **compose** a NodeType from facets: the thing is the sum of its facets. To describe more, add a facet — never an identity.

If a facet needs to hold more than one row related to the (Subject) Node, it must itself have a unique node id row. Because `content` table has a `language` column, it uses `about` to reference the (Subject) Node ID.

## Facets fan out in storage, not in identity

One thing's facets project to different places — some columns on a row, some co-rows sharing the node, some inline on an enum member. That is projection detail. Identity stays singular. Never read the fan-out as separate things.

## Instances

- **`Interval`** — `Specification`, `Measurement`, `ValuedRange` are width facets. Same node, no segment. → [levels.md](levels.md#node--addressable-identity)
- **Concept** — `title`/`lede`, `meaning`, `*_mappings`, `i18n` are facets of one concept. → [concepts.md](concepts.md)
- **Enum member** — each permissible value carries its **whole facet set** inline. So never promote an enum to rows to attach refs or translations — the facets compose in place. → [concepts.md](concepts.md)

Same idea every time: one identity, many facets.
