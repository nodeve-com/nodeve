# @nodeve/grimoire — concept schema + catalog

Single source of truth for **describing things**: one validated definition per concept.

## Define once

**Author a concept once, as data. Branch every tool off that one def — never author it twice.** Everything downstream is a _projection_: generated, checked, never hand-maintained!

```
                       ┌─ JSON Schema ($defs/$ref, $id = standard IRI) ── the wire/contract
                       ├─ flat / bundled JSON Schema ─────────────────── ref-blind consumers
   ONE concept def ───►├─ camelCase TS type + runtime validator ──────── in-process code
    (the source)       ├─ labels / hints / ui ────────────────────────── i18n + forms, inline in the def
                       ├─ standards crosswalk (QUDT / ISO / HA) ───────── travels WITH the def, as a field
                       └─ .proto / other emits ──────────────────────── only when a real consumer needs them
```

### Non-negotiables:

- **Borrow the standard; crosswalk.** Reuse an industry vocabulary; any coined term ships its translation _in the def_.
- **Compose, don't restate.**
- **Define the schema.**
- **Describe things** Shared vocab for what a thing _is_.

## Goals

- **Read values from devices.** Where a device exposes values, its catalog entry carries the register map: `connectivity.modbus` + transport + MQTT `emit`. A gateway reads this and **translates only** — scale, decode, publish; filter/combine/derive belongs to whatever consumes the output, downstream.
- **Catalog specs even when we don't read them.** An entry earns its place on its datasheet alone. A `pv_module` or power-draw appliance is pure spec, no register map — goal 2 is optional per entry. **More models = more valuable; entries encouraged.**

> **Lean on industry standards.** When a concept already has an established description in QUDT, ISO 80000, OWL/RDF, HA `device_class`, or any recognized standard, **borrow it** — names, structure, IRI where one exists — so any tool outside this repo already understands it. Match the standard's _own_ distinctions: a kind of quantity is a `qudt:QuantityKind` (HA `device_class`), distinct from a valued `qudt:Quantity` — name it `QuantityKind`.
>
> **Coin a term → document its crosswalk.** Anything not a direct lift maps explicitly to its QUDT / ISO / HA term, noting where and why it diverges. A homegrown code with no translation strands the concept in this repo. No silent local dialects.

The catalog is **composable**: a device entry is atoms assigned to named slots by an archetype, not a monolithic per-kind type. **Model documented in full in [`concepts/README.md`](concepts/README.md) — read before touching the catalog.**

> **The line is instances, not schemas.** grimoire holds schemas (`concepts/`) + agnostic catalog instances (`catalog/`) — **never site instances**, which live in the deploying repo (`sites/<name>/`) and are baked via `bakeSite`.
>
> As goal 3 fills out, the catalog moves to its own repo/DB; keep entries self-contained and the package free of `src/` imports so that move stays mechanical.

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

- **[`concepts/README.md`](concepts/README.md)** — the composable model: atoms, archetypes, the `catalog/<brand>/…` tree + `_defaults.yaml` cascade, inline labels/hints/ui.

## Using the catalog

```ts
import { loadDevice, modbusMediumOf, listDevices } from '@nodeve/grimoire';

loadDevice({ archetypeId: 'inverter', slug: 'foxess_h3_ps10sh' }); // CatalogDevice (identity guaranteed)
modbusMediumOf(loadDevice({ archetypeId: 'ac_phase_three_meter', slug: 'chint_dtsu666_4wire' })); // register map + transport + emit (goal 2)
```

A device's key is its **identity** — `archetype_id` + `slug` (`catalog_item: { archetype_id: inverter, slug: foxess_h3_ps10sh }`), the stable reference downstream configs use. The tree path (`foxess/h3/ps-10.0-sh`) is filing only.

## Using the concepts

Every generated module is a layer subpath — one concept, or the whole layer. **This is the ONLY way to type a concept shape in a consumer.** Writing an inline/structural TS type that mirrors a concept (a featureSpec, an interval, any YAML-defined shape) — in a consumer OR in this package's own `src/` — re-authors the def and WILL drift; the YAML already generated the type, so import it (e.g. `type PvTracker` from `@nodeve/grimoire/features/pv_tracker` types `featureSpec.instances[n].voltage.intervals[].interval` all the way down). Missing type? Fix the codegen, never hand-write the shape.

```ts
// One concept — the module IS the def node: authored fields + live TypeBox schema + parsed type
import { title, schema, type Inverter } from '@nodeve/grimoire/archetypes/inverter';
import * as inverter from '@nodeve/grimoire/archetypes/inverter'; // …or the whole node

// A layer: camel slug → authored data tree, live TypeBox schema riding along as `schema`
import { archetype } from '@nodeve/grimoire/archetypes';
import { feature } from '@nodeve/grimoire/features';
import { property } from '@nodeve/grimoire/property';
Object.keys(archetype); // ['acPhaseThreeMeter', 'airConditioner', 'ambientTank', …]
archetype.inverter.title.en; // 'Inverter'
Value.Check(archetype.inverter.schema, candidate); // or parseConcept('inverter', data) from the root

// A vocabulary
import rating from '@nodeve/grimoire/enumeration/rating';
```

Validating an instance goes through the root API: `parseConcept('solarArray', data)` (renames snake → camel at the edge, then checks the baked schema).

## Conventions

- [catalog generation pipeline](docs/catalog-generation-pipeline.md) — `generate.ts` flow, `resolveRepeatedFeatures` (default→part/instances; nature from `concept_settings`), register→measurement backfill
- [feature model](docs/feature-model.md) — flat one-level features; `count`'s presence discriminates single vs repeated; interval (a measuring range is a `rating: measurable` interval) / condition
- [reference model](docs/reference-model.md) — every pointer is `(Class, id)`; internal=archetype vs external=registry, public=grimoire vs private=site; `column.references` FK + `guard-refs`
- [site overlay](docs/site-overlay.md) — a `site_catalog` entry patches its device via `catalog_patch`: author device facts (mac_address…) at top level, the bake folds them in, the reader merges arrays by `identity.slug` (not index)
- [cadence field is `update_interval_ms`](docs/cadence-field.md) — integer ms, fetch-neutral
- [holds every sensible default](docs/device-defaults.md) — known defaults live here; only the default-less TCP host (and site instances) go downstream
- [TypeBox vs zod](docs/typebox-vs-zod.md) — TypeBox because `schema.json` is a shipped contract; JSON emits snake (+ a `.camel.schema.json` sibling), TS emits camel wall-to-wall — schema, type, AND authored data fields as named exports; snake in a `.ts` emit is a generator bug — rename at the parse edge, before validation, via `@nodeve/schema-case`'s stored alias
- [translations & labels](docs/translations-and-labels.md) — author labels/hints/ui inline per locale in the concept YAML; the bake carries them into the generated artifacts
- **Borrow before coining** — prefer a standard vocabulary; any coined term carries a crosswalk (callout above)
- **Generation** — `pnpm generate` bakes everything, DATA FIRST, mirroring the `concepts/` source tree flat into TWO roots split by target: **TS → `src/generated/`** (committed; `<layer>/<slug>.ts` camelCase **everywhere** — type, `schema` const, and authored data fields as named exports — the module IS the def node; the npm surface never shows a snake key; tree-shakeable; `index.ts` the opt-in all-concepts module; every module a layer subpath export, `<layer>/index.ts` the per-layer aggregate — see [Using the concepts](#using-the-concepts); `catalog/<slug>.ts` + `catalog/index.ts` the pure-code reader path; `enumeration/<name>.ts` vocab modules) and **JSON → `artifacts/`** (gitignored build artifact, attached to the GitHub release by CI; `<layer>/<slug>.json` resolved data tree — labels/ui/refs at every node — plus, per concept, the standalone `<slug>.schema.json` wire contract and its `<slug>.camel.schema.json` sibling; `enumeration/<name>.json` member data; `catalog/<slug>.json` one file per entry — no all-in-one; a JSON reader assembles its own bundle). Every property/feature/catalog doc validates against its archetype before the bake emits anything. Pre-commit regenerates + re-stages; `tests/generate.test.ts` asserts committed mirrors match. **Don't edit generated files.**
