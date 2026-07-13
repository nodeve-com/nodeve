---
'@nodeve/grimoire': major
---

Per-concept modules reachable via `./generated/*` subpath exports (`@nodeve/grimoire/generated/archetypes/inverter`); new layer aggregates `generated/archetypes|features|property` list a layer (`Object.keys`). BREAKING: root index drops the hand-picked `SiteLocation`/`AmbientTank`/`SolarArray`/`SolarString` types and `parseLocation`/`parseAmbientTank`/`parseSolarArray` — use `ConceptTypes['…']` + `parseConcept('…', data)` or the concept's own module.
