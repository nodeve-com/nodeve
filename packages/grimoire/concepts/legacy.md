# grimoire concepts — composable catalog model

The full model behind the root README's "composable catalog." Three layers; **only the bottom defines fields**:

1. **`traits/` — atoms.** The _single_ place to define any field (`voltage` = `{ nominal_v, min_v?, max_v? }`; `electrical_ac` = it + `{ hz? }`). Snake_case `Type.Object`, **no `additionalProperties`** (it gets composed). May nest another atom (`resistive_element` nests `electrical_ac`).
2. **`archetypes/` — named compositions.** No own fields; assign atoms to named slots, compose other archetypes (`dehumidifier` = `appliance` + `dehumidification` + `connectivity`). Device archetypes compose **flat, one-level-deep features** — [`docs/feature-model.md`](../docs/feature-model.md). **No `kind` field** — all resolve identically. A leaf may `archetype:`-select it iff its meta sits in `catalogArchetypes` (device shapes, catalog-tree instances), not the schema-only list (mediums `modbus`; shapes `solar_array`/`mqtt_connection` — `schema.json` only, no instances).
3. **`../catalog/<brand>/<family?>/<model>.yaml` — instances** (a model DB outside `concepts/`). Tree is **pure filing**; schema comes from the dir's declared `archetype` + the atom blocks a leaf fills.

Site & deployment shapes (`solar_array`, `ambient_tank`, `mqtt_connection`) are schema-only archetypes; their instances live outside the catalog tree (a consumer's env/config, or `sites/<name>/`).

**Key connectivity by medium** — group a device by _its nature_, not _its wiring_: electrical envelope and register map are one entry, not two files on different axes. `connectivity.modbus` holds the register map; `transport` (wire) and `emit` (MQTT out) are atoms any medium (ve.direct, CAN, NMEA 0183) reuses. Layering + crosswalk: [`docs/connection-model.md`](../docs/connection-model.md).

## Composition

- **Nested (slot):** B under a named key in A. The composer names the slot in A's local property (`link`, not `modbus_link`). Every atom is a slot — including identity: `product: { manufacturer, model }`, never flattened to root.
- **Mixin (flatten):** A merges B's slots via `Type.Composite` — "an X that is _also_ a Y." `water_heater` = `appliance` + `{ resistive_element }`.
- **Sealing:** atoms + intermediate archetypes stay unsealed so they compose; `kit/seal.ts` seals the concrete archetype the loader validates (`additionalProperties:false`), rejecting unknown top-level keys. A nested atom slot stays open unless authored sealed (the modbus framing atoms are).

## Atoms are native TypeBox; text + UI are sidecars

`schema.json` is a shipped, cross-language contract (fed to `datamodel-code-generator`, `quicktype`, `go-jsonschema`), so it stays standard — no i18n in `title`/`description` (a `{ en, pt }` record breaks every tool). So:

- **Value contract = the TypeBox schema, language-free.** Native `Type.Object` (`voltage.ts` is the model): `Static<>`, full keyword surface (`minimum`, `pattern`, `enum`, `if/then`, …), `Type.Composite`.
- **Text + presentation = side dictionaries keyed by field id**, pinned via `keyof Static<T>` so a renamed/missing field fails `check`:
  - **`Lang<typeof Schema>`** (`<atom>.lang.ts`) — `label` + `hint` per field per locale.
  - **`Ui<typeof Schema>`** (`<atom>Ui` const) — non-derivable presentation hints, partial.

```ts
// refrigeration.ts — value contract only
export const RefrigerationSchema = Type.Object({ refrigerant: Type.String({ minLength: 1 }) });
export const refrigerationUi = { refrigerant: { mono: true } } satisfies Ui<
	typeof RefrigerationSchema
>;

// refrigeration.lang.ts — text sidecar (i18n)
export const refrigerationLang = {
	en: { refrigerant: { label: 'Refrigerant', hint: 'e.g. r290.' } },
	pt: { refrigerant: { label: 'Refrigerante', hint: '…' } },
} satisfies Lang<typeof RefrigerationSchema>;
```

**Three emits per archetype**, merged by the consumer (form renderer, doc generator) — the authored objects _are_ the files (`JSON.stringify`, no transform):

- **`<name>.schema.json`** — sealed value contract (`kit/json-schema.ts`).
- **`<name>.lang.json`** — merged `Lang`, locale-keyed; emitted only when a composed atom authored one.
- **`<name>.ui.json`** — merged `Ui` (field → hint), same condition.

Archetypes never name a sidecar — an atom registers once in `concepts/sidecars.ts`; `collectSidecars` merges by field name. See [`docs/translations-and-labels.md`](../docs/translations-and-labels.md).

**Lang is optional but total.** `satisfies Lang<typeof Schema>` is the totality gate — TS errors on any missing field/locale, so a `.lang.ts` can't be half-translated. A missing one is fine; author per atom as its form gets built.

- **`ui.mono`** — the one hint so far: "code-like string (model number, serial, `r290`), render monospace." Strings only.
- **Validation stays serializable** — JSON Schema constraints cover device profiles; a cross-field rule gets a serializable expression (JSONLogic / CEL), never a host closure.
- **`required` is structural** — a plain property requires a value, `Type.Optional(…)` doesn't.

## Conventions

- **Feature blocks are atoms, never inline.** A feature (`compressor`, `pv_tracker`, `enclosure`) is a dedicated `traits/<feature>.ts` composed into a slot, never an inline `Type.Object` — so it's reusable: `pv_tracker` serves an inverter's strings and a DC-only MPPT controller; `ac_phase` serves grid + EPS phases and a compressor's supply.
- **Cascade:** `_defaults.yaml` at any level deep-merges into descendants (**leaf wins; arrays replace**). Declares the subtree's `archetype` + shared values (`manufacturer`, a family register map).
- **Path = key, filing only.** Middle segment is free (`foxess/h3/ps-10.0-sh` family or `emelson/dehumidifier/…` grouping); schema comes from the `archetype`, not the path. Every segment a URL-safe slug (`.` allowed for versions). Not stable across re-filing.
- **Stable `id`** — 8-char short-code of the path, baked into the bundle, survives re-filing, so **consumers persist the `id`** (`loadDeviceById`). `bun run grimoire-definitions` also emits `generated/catalog-index.tsv` (`id↔path↔manufacturer↔model↔aliases`) for text tooling.
- **Catalog envelope.** An entry = archetype-validated device traits wrapped in grimoire's record metadata (`catalog_entry` trait / `CatalogEnvelopeSchema`: `id` + `aliases`) — a distinct layer, validated through the same `seal`/`parse` path.
- **`aliases` = move changelog.** Moving a leaf → add former path(s) to `aliases:` (filing metadata, stripped before validation). `loadDevice(oldPath)` resolves, warns, points at the new path + `id`. An alias may not shadow a live path, and no two leaves may claim it.
- **Fill only known values, never fabricate.**

> **Catalog vs site (dehumidifier):** catalog = datasheet facts (extraction lpd, refrigerant, max draw) + capabilities (settable RH range + default). Chosen setpoints, control-loop tuning, per-unit fitted `power_bands` = SITE data in the deploying repo.

## Open extensions

- **Heat-pump source:** `water_heater` requires `resistive_element` today; a `heat_pump` atom would make it choose-one-or-both. Add when there's a unit to model.
- **`generic/` identity:** `manufacturer: generic` marks representative class entries (`generic/dehumidifier/resi-30l`); loader/codegen don't flag them distinctly yet.
