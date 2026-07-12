# grimoire reference model — one pointer, `(Class, id)`

Every cross-thing pointer in grimoire is the same primitive: **a reference names a Class and an id within it.** A device's maker (`manufacturer_id → organization`), a standards crosswalk (`{registry: qudt_quantity_kind, term: Temperature}`), a site pointing at a NetBox record (`{registry: netbox, term: 42}`) — all one shape. What differs is only **how the id resolves** and **which file owns the row**.

This doc is the single source for that model. The mechanics it drives: the `column.references` FK declaration ([`features/column.yaml`](../concepts/features/column.yaml)), the `ref` crosswalk row ([`features/ref.yaml`](../concepts/features/ref.yaml)), and [`guard-refs`](../scripts/guard-refs.ts).

## The primitive

```
reference = (class, id, match?)
```

- **class** — a named kind of thing with an id-space and a resolver.
- **id** — the key of one row/entry within it.
- **match?** — SKOS mapping strength (`exact` / `close`), meaningful only when two Classes model the SAME concept (a crosswalk). An internal FK is identity → `exact` implicit, so `match` is external-only in practice.

Two SHAPES carry it — same target vocabulary, same resolver, different cardinality:

- **scalar typed FK** — a single required 1:1 relation, an ATTRIBUTE of the thing (`manufacturer_id`). [`column.references`](../concepts/features/column.yaml) fixes the Class on the column; the value is the bare id.
- **`refs` list** — N crosswalks/links ([`features/refs.yaml`](../concepts/features/refs.yaml)), each row `{registry, term, match}`.

`catalog_item {archetype, slug}` ([`property/catalog/catalog_item.yaml`](../concepts/property/catalog/catalog_item.yaml)) is the same FK with the Class chosen AT THE ROW instead of pinned on the column. `manufacturer_id` and `catalog_item` are not two mechanisms — they are the general two-column (compound) FK and its class-fixed specialization.

## A Class is why the layers are flat

The concept layers ARE relational normalization ([`concepts/README.md`](../concepts/README.md)):

| layer | relational | consequence |
| --- | --- | --- |
| property | column | one field + its `schema` |
| feature | table | flat `prop:` map — tables don't nest, so features don't |
| archetype | view / class | joins its feature-tables — composes features, never props directly |
| catalog entry | row | identity `(archetype, slug)` = `(view, PK)` |

So the only internal thing you point AT is an **archetype** — the formal Class. You never reference a feature or a prop; those are a table and a column, not an addressable entity.

## Two axes

A reference varies on two orthogonal axes. They decide the resolver and the owning file — nothing else.

### Internal vs external — where the rows resolve

- **internal** — the Class is a grimoire **archetype**; the rows ARE in our catalog. Resolver: look the id up in the catalog (implicit — no template needed).
- **external** — the Class is a **registry**; the rows are NOT here. The registry carries its own resolver:
  - `iri_template` → an IRI / page `#anchor` (qudt, sosa, iso)
  - `base_url` → an external DB record (netbox, home_assistant)

  A registry is the external analog of an archetype — "a Class whose rows live elsewhere." It carries `published_by → organization` (the body that owns the id-space). The `iri_template` is grimoire already admitting external things are Classes. A header-with-anchor on a page and a row in a database are the same target — a named Class + an id.

### Public vs private — where the reference lives

The line grimoire already enforces (agnostic instances here, site instances in `sites/<name>/` — [`README.md`](../README.md) "the line is instances, not schemas", [`guard-grimoire-agnostic.sh`](../../../scripts/guard-grimoire-agnostic.sh)):

- **public** — grimoire publishes it: archetypes (internal Classes), and public registry descriptors (qudt/iana/iso + their resolvers, the `organization` entries, the `netbox` registry _descriptor_).
- **private** — a **site catalog** defines it: this install's NetBox `base_url` + the actual record refs, site-only vendors, HA entity ids. A private id can't live in the agnostic catalog.

```
grimoire catalog (public)
  archetypes ................. internal Classes — rows live here
  public registry descriptors  external public Classes — resolver + published_by

site catalog (private, sites/<name>/)
  private registry values .... external private rows (netbox #42, an HA entity)
  + refs INTO them
```

## Resolution reuses the two build tiers — no new machinery

| reference | resolved by | when |
| --- | --- | --- |
| internal (our rows, `exact`) | [`guard-refs`](../scripts/guard-refs.ts) — id ∈ the archetype's catalog slugs | `grimoire-generate` |
| external public (crosswalk) | `guard-refs` — `iri_template` _shape_ (can't fetch the IRI offline) | `grimoire-generate` |
| private (site → external row) | [`generate-site`](../scripts/generate-site.ts) — already walks every `catalog_item` / ref and resolves it | site build |

Same `(Class, id)` primitive top to bottom. Only the resolver and the file that owns the row change with the axes.

## Build stages (against this doc)

1. **`organization`** — the pointable entity (`manufacturer` was too specific). Rename the archetype; `manufacturer_id`'s [`column.references`](../concepts/property/identity/manufacturer_id.yaml) → `organization`; move the maker entries to `catalog/organizations/`.
2. **`registry` refold** — reframe [`archetypes/registry.yaml`](../concepts/archetypes/registry.yaml) as the external-Class descriptor: `iri_template` | `base_url` + `published_by → organization`; move from `enumeration/registry/` to `catalog/`; flip [`ref.registry`](../concepts/features/ref.yaml) from enum-membership to an FK. This dissolves the `victron` clash — `organization/victron` (the body) and `registry/ve_direct` (`published_by: victron`) stop sharing one bare stem.
