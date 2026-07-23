# Schema & Validation

## Two Schema Layers

### Database Schema - (facets)

Each facet (`feature_of_interest`, `interval`, `register_map`, `product`, …) are reusable SQL narrow tables. They hold facts any NodeType can use. When a facet needs to hold more than one row related to the Node it must itself have a unique node id row. Adding a NodeType typically does not add a table with unique columns — see [mapping.md](mapping.md).

The most common NodeType definition may have a facet table named after them. Organization is also a table that holds organization-specific data.

### Runtime Schema - (NodeTypes)

A `node_type` (`data/node_type/<slug>.yaml`) sits _on top of_ those tables and says how one archetype assembles them: which sockets exist, which `feature_type` each takes, which is `required`. `ac-power-meter` is `{ point: { feature_type: ac-phase, required: true } }`. It refines the shared core, authored once per archetype, never a device-shaped table.

## Why overlay instead of wider tables

When a facet has the exact same ID as a SubjectNode the FK column would be the same as the ID column.

A DB schema flattens to lowest-common-denominator nullability. The overlay carries the archetype shape the DB gives up.

## What runs today

`normalize/tree.ts` enforces the overlay at normalize time, against `data/device_model/<slug>.yaml`:

- unknown `device_type` → dies (`tree.ts:66`)
- an authored feature whose role isn't a declared socket → dies (`tree.ts:144`)
- a socket whose `feature_type` doesn't match the authored feature → dies (`tree.ts:145`)

So role membership and feature-type agreement are live invariants, not aspiration.

## Declared but inert

- **`required`** — authored on every binding, referenced nowhere in `normalize/`. No check yet fires when a required socket is missing.
- **`DeviceType` / `SocketBinding` as rows** — `normalize/catalog.ts` never emits them; the overlay files are a normalize-time lookup only. `device_type` reaches `catalog.json` merely as an FK string on `device_model`. Row projection is the "later pass" the `DeviceType` note in [taxonomy.yaml](../linkml/taxonomy.yaml) points at.

## One-line model

The NodeType declaration defines **how to author and fetch** (tables to join) its data.
