# @nodeve/grimoire — concept schema + catalog

Single source of truth for **describing things**: one validated definition per concept, projected to a JSON Schema contract, camelCase TS types + validators, inline labels/crosswalks, and an agnostic device catalog (Modbus register maps, PV panels). You import the projections; you never re-author the shape.

```
                       ┌─ JSON Schema ($defs/$ref, $id = standard IRI) ── the wire/contract
                       ├─ flat / bundled JSON Schema ─────────────────── ref-blind consumers
   ONE concept def ───►├─ camelCase TS type + runtime validator ──────── in-process code
    (the source)       ├─ labels / hints / ui ────────────────────────── i18n + forms, inline in the def
                       ├─ standards crosswalk (QUDT / ISO / HA) ───────── travels WITH the def, as a field
                       └─ .proto / other emits ──────────────────────── only when a real consumer needs them
```

**What it's for:**

- **Read values from devices.** Where a device exposes values, its catalog entry carries the register map (`connectivity.modbus` + transport + MQTT `emit`). A gateway reads this and **translates only** — scale, decode, publish; filter/combine/derive belongs downstream.
- **Catalog specs even when we don't read them.** An entry earns its place on its datasheet alone — a `pv_module` or power-draw appliance is pure spec, no register map. More models = more valuable.

## Install

```sh
pnpm add @nodeve/grimoire
```

## Using the catalog

```ts
import { loadDevice, modbusMediumOf, listDevices } from '@nodeve/grimoire';

loadDevice({ archetypeId: 'inverter', slug: 'foxess_h3_ps10sh' }); // CatalogDevice (identity guaranteed)
modbusMediumOf(loadDevice({ archetypeId: 'ac_phase_three_meter', slug: 'chint_dtsu666_4wire' })); // register map + transport + emit
```

A device's key is its **identity** — `archetype_id` + `slug` (`catalog_item: { archetype_id: inverter, slug: foxess_h3_ps10sh }`), the stable reference downstream configs use. The tree path (`foxess/h3/ps-10.0-sh`) is filing only.

From a shell, the `grimoire` bin queries the shipped `artifacts/` JSON (snake wire shape) — no grep through `node_modules`:

```sh
grimoire catalog                     # list entries: archetype_id  slug  code
grimoire catalog foxess_h3_ps10sh    # one entry, full JSON; append a dotted path to select a node
grimoire catalog foxess_h3_ps10sh ac_phase_three_grid.feature_spec.combined
grimoire registers foxess_h3_ps10sh active_energy  # register rows; column filters on quantity_kind (energy channels split by their `interval` slug)
grimoire enumeration quantity_kind   # member dict; `grimoire enumeration quantity_kind active_energy` for one member
```

Query the **schema** — what a thing IS — the same way; every concept node carries its own `body`/`description`/`title` prose inline, so this answers "what is an interval" without reading source or `dist/*.d.ts`:

```sh
grimoire feature                     # list features: slug  title
grimoire feature interval            # the interval concept, full node (body explains rating/zone/measurable/trigger_on)
grimoire feature interval description  # append a dotted path to select a node
grimoire archetype intervals array.prop  # the interval item type's slots (filter, condition, interval, …)
grimoire property duration           # one property; `grimoire part <slug>` for parts
grimoire schema feature interval     # the JSON Schema twin; append `camel` for the camelCase sibling
```

Run `grimoire` with no args for the full command list. JSON readers can also import a baked entry directly: `@nodeve/grimoire/artifacts/catalog/foxess_h3_ps10sh.json` (the whole `artifacts/` tree ships).

## Using the concepts

Every generated module is a layer subpath — one concept, or the whole layer. **This is the ONLY way to type a concept shape in a consumer.** Writing an inline/structural TS type that mirrors a concept (a featureSpec, an interval, any YAML-defined shape) re-authors the def and WILL drift; the YAML already generated the type, so import it (e.g. `type PvTracker` from `@nodeve/grimoire/features/pv_tracker` types `featureSpec.instances[n].voltage.intervals[].interval` all the way down). Missing type? File it upstream — never hand-write the shape.

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

## Learn more

The design essays ship with the package (`docs/`):

- [feature model](docs/feature-model.md) — flat one-level features; single vs repeated; interval / condition
- [reference model](docs/reference-model.md) — every pointer is `(Class, id)`; internal vs external, public vs private
- [site overlay](docs/site-overlay.md) — how a `site_catalog` entry patches its device
- [cadence field](docs/cadence-field.md) — `update_interval_ms`, integer ms, fetch-neutral
- [device defaults](docs/device-defaults.md) — where sensible defaults live
- [TypeBox vs zod](docs/typebox-vs-zod.md) — why the shipped contract is TypeBox; snake wire, camel TS
- [translations & labels](docs/translations-and-labels.md) — inline per-locale labels/hints/ui
- [catalog generation pipeline](docs/catalog-generation-pipeline.md) — the `generate.ts` bake flow

**Contributing?** Start with [`docs/dev.md`](docs/dev.md) — repo layout, authoring rules, the generation pipeline, and the composable model.
