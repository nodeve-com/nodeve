# TypeBox for JSON-schema output, zod for validation

Use TypeBox **only** where the schema must be output to JSON Schema; use zod (or ajv) for normal validation that just checks an input. Before reaching for TypeBox, ask **"does this emit JSON schema?"** — if no, use zod/ajv.

The two cases have different jobs: grimoire's `schema.ts` emits `schema.json`, so it's TypeBox + `Value.Check`; the consuming gateway's config loader only validates a loaded YAML file and emits nothing, so it's the normal-validation case → zod `.parse()`. (Relates to the [consumer-agnostic guard](../../../scripts/guard-grimoire-agnostic.sh).)

**Casing: TS is camelCase wall-to-wall. snake_case never enters a TS emit.** snake_case is the data layer's spelling — authored YAML, `artifacts/**.json`, and `.schema.json` (the contract for snake-native consumers: Rust, C, esphome, anything validating the files directly). Both casings are sibling projections of the one compiled def — the generator emits each from the compiled data tree; neither post-processes the other.

The TS projection: camelCase TypeBox schema, type = `Static<typeof Schema>` — one artifact, type derived, nothing to drift. The snake→camel rename happens **once, at the parse edge, BEFORE validation**, and is **mapping-driven, never algorithmic**: the generator stamps each property's camel name into the data tree beside `title`/`description` (drizzle-style stored alias). Only declared props rename — data-bearing keys (slugs, locale tags) are untouched — and the mapping runs both ways, so a camel validation error can point back at the snake YAML path.

> **The generated TS (`src/generated/`) predates this rule and is wrong:** snake TypeBox schemas, a separately-rendered camel type twin, and `kit/parse.ts` blind-`humps()`-ing AFTER validation. Do not extend that pattern — no new snake keys in TS, no new hand-rendered type twins, no schema-blind renames. It retires by regenerating toward camel schemas + `Static<>`, which deletes `validateAndCamelize` and the snake-keyed `conceptSchemas` with it.
