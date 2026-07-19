# Developing `@nodeve/grimoire`

Contributor guide: how the package is laid out, the authoring rules, and how the bake works. For _using_ the published package see the [root README](../README.md).

## Authoring non-negotiables

- **Borrow the standard; crosswalk.** Reuse an industry vocabulary; any coined term ships its translation _in the def_.
- **Compose, don't restate.**
- **Define the schema.**
- **Describe things.** Shared vocab for what a thing _is_.

> **Lean on industry standards.** When a concept already has an established description in QUDT, ISO 80000, OWL/RDF, HA `device_class`, or any recognized standard, **borrow it** — names, structure, IRI where one exists — so any tool outside this repo already understands it. Match the standard's _own_ distinctions: a kind of quantity is a `qudt:QuantityKind` (HA `device_class`), distinct from a valued `qudt:Quantity` — name it `QuantityKind`.
>
> **Coin a term → document its crosswalk.** Anything not a direct lift maps explicitly to its QUDT / ISO / HA term, noting where and why it diverges. A homegrown code with no translation strands the concept in this repo. No silent local dialects.

## The line is instances, not schemas

grimoire holds schemas (`concepts/`) + agnostic catalog instances (`catalog/`) — **never site instances**, which live in the deploying repo (`sites/<name>/`) and are baked via `bakeSite`.

As goal 3 fills out, the catalog moves to its own repo/DB; keep entries self-contained and the package free of `src/` imports so that move stays mechanical.

The catalog is **composable**: a device entry is atoms assigned to named slots by an archetype, not a monolithic per-kind type. **The model is documented in full in [`concepts/README.md`](../concepts/README.md) — read before editing the catalog.**

## Layout

```
concepts/                 # SCHEMA ONLY — the composed layers (concepts/README.md)
  property/<cat>/          #   single fields (one scalar + its `schema:`)
  enumeration/<name>/      #   named value sets (one literal per file; `enums:`/`parts:` targets)
  features/                #   groupings of props
  archetypes/              #   classes (cataloguable / instantiable)
  catalog/<brand>/…        #   agnostic instances of archetypes + _defaults.yaml cascade
src/                      # the npm-surfaced runtime: index.ts entry + loaders (catalog, site,
  generated/              #   vocab, sensor-id, display-policy) and the committed generated TS
artifacts/                # generated JSON (data trees, .schema.json, catalog entries) — gitignored;
                          #   `pnpm generate` bakes it, CI attaches it to the GitHub release
kit/                      # codegen only: generate.ts entry + compile/project/emit helpers
scripts/                  # validation guards
tests/                    # schema-behavior + example-drift tests
```

- **[`concepts/README.md`](../concepts/README.md)** — the composable model: atoms, archetypes, the `catalog/<brand>/…` tree + `_defaults.yaml` cascade, inline labels/hints/ui.

## Conventions

- [catalog generation pipeline](catalog-generation-pipeline.md) — `generate.ts` flow, `resolveRepeatedFeatures` (default→part/instances; nature from `concept_settings`), register→spec-node backfill
- [feature model](feature-model.md) — flat one-level features; `count`'s presence discriminates single vs repeated; interval (a measuring range is an `interval_kind: measurable` interval) / condition
- [reference model](reference-model.md) — every pointer is `(Class, id)`; internal=archetype vs external=registry, public=grimoire vs private=site; `column.references` FK + `guard-refs`
- [site overlay](site-overlay.md) — a `site_catalog` entry patches its device via `catalog_patch`: author device facts (mac_address…) at top level, the bake folds them in, the reader merges arrays by `identity.slug` (not index)
- [cadence field is `update_interval_ms`](cadence-field.md) — integer ms, fetch-neutral
- [holds every sensible default](device-defaults.md) — known defaults live here; only the default-less TCP host (and site instances) go downstream
- [TypeBox vs zod](typebox-vs-zod.md) — TypeBox because `schema.json` is a shipped contract; JSON emits snake (+ a `.camel.schema.json` sibling), TS emits camel wall-to-wall — schema, type, AND authored data fields as named exports; snake in a `.ts` emit is a generator bug — rename at the parse edge, before validation, via `@nodeve/schema-case`'s stored alias
- [translations & labels](translations-and-labels.md) — author labels/hints/ui inline per locale in the concept YAML; the bake carries them into the generated artifacts
- **Borrow before coining** — prefer a standard vocabulary; any coined term carries a crosswalk (callout above)

## Generation

`pnpm generate` bakes everything, DATA FIRST, mirroring the `concepts/` source tree flat into TWO roots split by target:

- **TS → `src/generated/`** (committed; `<layer>/<slug>.ts` camelCase **everywhere** — type, `schema` const, and authored data fields as named exports — the module IS the def node; the npm surface never shows a snake key; tree-shakeable; `index.ts` the opt-in all-concepts module; every module a layer subpath export, `<layer>/index.ts` the per-layer aggregate — see [Using the concepts](../README.md#using-the-concepts); `catalog/<slug>.ts` + `catalog/index.ts` the pure-code reader path; `enumeration/<name>.ts` vocab modules).
- **JSON → `artifacts/`** (gitignored build artifact, attached to the GitHub release by CI; `<layer>/<slug>.json` resolved data tree — labels/ui/refs at every node — plus, per concept, the standalone `<slug>.schema.json` wire contract and its `<slug>.camel.schema.json` sibling; `enumeration/<name>.json` member data; `catalog/<slug>.json` one file per entry — no all-in-one; a JSON reader assembles its own bundle).

Every property/feature/catalog doc validates against its archetype before the bake emits anything. Pre-commit regenerates + re-stages; `tests/generate.test.ts` asserts committed mirrors match. **Don't edit generated files.**
