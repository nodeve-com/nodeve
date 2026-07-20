---
name: grimoire-global-slots
description: Globally-unique property/slot definitions are a wanted invariant in grimoire — user has tried enforcing it many different ways
metadata: 
  node_type: memory
  type: project
  originSessionId: 8789d99f-5018-4b23-9c5e-70db3b339a29
  modified: 2026-07-20T09:57:26.241Z
---

Grimoire's property definitions are meant to be **global by default** — one
definition per property name, shared across all archetypes that use it, with
per-archetype narrowing rather than redefinition. The user has attempted to
enforce this several different ways and considers it a desirable property, not
an accident.

**Why:** it's a metamodel invariant. Without a single place guaranteeing name
uniqueness, every consumer re-derives "is this the same property," which is a
source of the generator/parsing slop in [[grimoire-shape-slop-cleanup]].

**How to apply:** don't propose per-archetype local property definitions as a
cleanup. When evaluating schema tooling, native global-slot semantics is a
scoring criterion — LinkML's top-level `slots:` + `slot_usage:` narrowing +
`induced_slot` resolution matches this natively. See
[[grimoire-no-ts-spec-grammar]] for the related constraint that YAML concepts
are the only source.
