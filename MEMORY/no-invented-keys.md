---
name: no-invented-keys
description: "When no existing slot fits a fact, say the slot is missing — never mint a key, slug, or enum member to hold it"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 050ef8e0-9815-4f56-ab40-56431cb473e0
  modified: 2026-08-06T15:05:40.730Z
---

When a fact has no slot that fits, STOP and name the missing slot. Never invent a key, slug, or enum member to carry it. Before writing any new identifier, check the existing vocabulary (`data/variable/`, the LinkML enums, existing archetype nodes) and the standard term for the thing.

Four failures in one session, all the same move: `foxess-10016: { start: 10016 }` (a name restating its value), `hex: { type: hex }` (same), `gen-2` (a device-group name whose membership contradicted it and forked per PDU), `version_bcd_16` (an invented enum member where `bcd` is the standard word and `uint16` already existed).

Tells that a key is invented slop:

- it restates its own value
- it means "not the other one" (`type: int` for "not hex")
- it names a set of devices — that set forks per PDU, so it belongs in `subject_node` as an archetype node, never in the catalog
- the standard term for it exists and this isn't it

**Why:** CLAUDE.md already forbids this twice ("no name without a fork", "non-standard accretion is NOT convention, it's AI slop"). Restating the principle does not stop it; the trigger is the moment a fact has nowhere to go, and the correct move at that moment is to say so, not to fill the gap.

**How to apply:** reuse the existing slot, or report that none exists and ask. Reuse across authored rows comes from a DEFAULT on the parent (so the common case states nothing) or from an existing group node — not from a new name. See [[schema-is-the-source-not-data2schema]], [[no-inline-string-vocab]], [[bulk-load-vocabularies]].
