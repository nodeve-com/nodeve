---
'@nodeve/grimoire': major
---

Per-concept modules reachable via layer subpath exports (`@nodeve/grimoire/archetypes/inverter`, `…/enumeration/rating`, `…/catalog/<slug>`); each concept module IS the def node — authored fields + `schema` + parsed type as named exports (`import { title, schema, type Inverter }`), no default/`<Name>Schema`/`<Name>Data`. New layer aggregates `@nodeve/grimoire/archetypes|features|property` map camel slug → def node (`Object.keys` lists the layer, `archetype.inverter.schema` validates). BREAKING: root index drops the hand-picked `SiteLocation`/`AmbientTank`/`SolarArray`/`SolarString` types and `parseLocation`/`parseAmbientTank`/`parseSolarArray` — use `ConceptTypes['…']` + `parseConcept('…', data)` or the concept's own module. Property `index` renamed `field_index` (usbhid params wire key).
