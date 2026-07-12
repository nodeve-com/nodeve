# @nodeve/grimoire — concept schema + catalog

Single source of truth for **describing things**: one validated definition per concept.

## Define once

**Author a concept once, as data. Branch every tool off that one def — never author it twice.** Everything downstream is a _projection_: generated, checked, never hand-maintained!

```
                       ┌─ JSON Schema ($defs/$ref, $id = standard IRI) ── the wire/contract
                       ├─ flat / bundled JSON Schema ─────────────────── ref-blind consumers (eKuiper)
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
generated/                # every generated artifact — never hand-edited
tests/                    # schema-behavior + example-drift tests
kit/                      # shared helpers: cascade, seal, parse, json-schema, bundle
scripts/                  # validation helpers
index.ts                  # public entry: archetype schemas/types + loadDevice(path)
```

- **[`concepts/README.md`](concepts/README.md)** — the composable model: atoms, archetypes, the `catalog/<brand>/…` tree + `_defaults.yaml` cascade, inline labels/hints/ui.

## Using the catalog

```ts
import { loadDevice, loadDeviceAs, modbusMediumOf, listDevices } from '@nodeve/grimoire';

loadDevice('foxess/h3/ps-10.0-sh'); // CatalogEntry (discriminated by `archetype`)
loadDeviceAs('foxess/h3/ps-10.0-sh', 'inverter'); // narrowed to the Inverter variant
modbusMediumOf(loadDevice('chint/dtsu666')); // register map + transport + emit (goal 2)
```

A device's key is its **identity** — `archetype` + `slug` (`catalog_item: { archetype: inverter, slug: foxess_h3_ps10sh }`), the stable reference downstream configs use. The tree path (`foxess/h3/ps-10.0-sh`) is filing only.

## Conventions

- [catalog generation pipeline](docs/catalog-generation-pipeline.md) — `generate.ts` flow, `resolveRepeatedFeatures` (default→part/instances; nature from `concept_settings`), register→measurement backfill
- [feature model](docs/feature-model.md) — flat one-level features; `count`'s presence discriminates single vs repeated; interval (a measuring range is a `rating: measurable` interval) / condition
- [reference model](docs/reference-model.md) — every pointer is `(Class, id)`; internal=archetype vs external=registry, public=grimoire vs private=site; `column.references` FK + `guard-refs`
- [site overlay](docs/site-overlay.md) — a `site_catalog` entry patches its device via `catalog_patch`: author device facts (mac_address…) at top level, the bake folds them in, the reader merges arrays by `identity.slug` (not index)
- [cadence field is `update_interval_ms`](docs/cadence-field.md) — integer ms, fetch-neutral
- [holds every sensible default](docs/device-defaults.md) — known defaults live here; only the default-less TCP host (and site instances) go downstream
- [TypeBox vs zod](docs/typebox-vs-zod.md) — TypeBox because `schema.json` is a shipped contract; schema stays snake, camelCase layered on
- [translations & labels](docs/translations-and-labels.md) — author labels/hints/ui inline per locale in the concept YAML; the bake carries them into the generated artifacts
- **Borrow before coining** — prefer a standard vocabulary; any coined term carries a crosswalk (callout above)
- **Generation** — `pnpm generate` bakes everything, DATA FIRST, mirroring the `concepts/` source tree flat (everything under `generated/` is a concept projection — no redundant `generated/concepts/` wrapper): `generated/<layer>/<slug>.json` (the resolved data tree per concept — labels/ui/refs at every node) with its TS module (`<slug>.ts`: camelCase type + schema const, tree-shakeable; `generated/index.ts` is the opt-in all-concepts module) and, for archetypes, the standalone `<slug>.schema.json` wire contract; `generated/enumeration/<name>.json` (member data per enumeration, `<name>.ts` beside it where a TS consumer needs the vocab); `generated/catalog/<slug>.json` (one file per catalog entry — no committed all-in-one; the consuming gateway assembles the bundle in its own build step). Every property/feature/catalog doc validates against its archetype before the bake emits anything. Pre-commit regenerates + re-stages; `tests/generate.test.ts` asserts committed mirrors match. **Don't edit generated files.**
