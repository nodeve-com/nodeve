---
name: bulk-load-vocabularies
description: "Bounded vocabularies (refrigerant, quantity_kind, …) load the WHOLE authoritative set at once — never add-when-needed"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 572ecdfd-c10f-4c2d-83ff-cf218f4fab6f
  modified: 2026-07-19T21:00:10.768Z
---

For any bounded enumeration with an authoritative upstream, import the COMPLETE set once from that source — never accrete members one-at-a-time as a device needs them.

**Why:** "add it when needed" is the core throughput blocker in grimoire. One-at-a-time is slow AND incorrect-prone — [[grimoire-shape-slop-cleanup]]'s azimuth landed in the wrong place precisely because a single member was hand-placed without the full set as the reference frame. The complete set is self-correcting; a partial set is a guess every time. This is the same law as [[no-inline-string-vocab]] — derive from the authoritative source, don't hand-curate.

**Two shapes — pick by whether the upstream names == the local names:**

1. **Vocab IS the upstream set (1:1 names)** → bulk-generate every member. `enumeration/refrigerant/` ← Wikipedia "List of refrigerants" (ASHRAE-34 canonical): member `r290` IS R-290. Importer `scripts/vocab/import-refrigerants.ts` (+ shared `wikidata.ts` SPARQL spine): template-aware wikitext parse (mask pipes inside `{{}}`/`[[]]` before `||`-split), blends→`composition` [{refrigerant, mass_fraction}] with GWP DERIVED (Σ), component formulas matched by canonical atom-count, Wikidata QIDs by R-number (P4842, never hand-picked). 332 members baked. Added `features/composition.yaml` + `property/spec/mass_fraction.yaml`.

2. **Curated domain subset + upstream as ORACLE (names differ)** → do NOT bulk-mint. `enumeration/quantity_kind/` stays curated: local names (`current` not QUDT `ElectricCurrent`; three energies from one QUDT `Energy`) are load-bearing slugs the feature graph keys on. QUDT is the crosswalk oracle: `scripts/vocab/qudt.ts` distills the 1218-kind TTL → committed `qudt-quantitykind.json`; `guard-refs.ts` verifies every member's `qudt_quantity_kind` term by MEMBERSHIP (caught 2 stale terms immediately: `PhaseAngle` and `Quantity` don't exist as QUDT kinds).

Importer overlay rule: generated fields regenerate FRESH each run; authored-only bits (pt label, foreign-registry refs) preserved by extracting them per-slug — NOT a blind deep-merge (blind array-union accumulated stale composition rows).

schema.org `schemaorg/schemaorg` (jsonld release) = upstream for class/property definitions if that layer gets bootstrapped.
