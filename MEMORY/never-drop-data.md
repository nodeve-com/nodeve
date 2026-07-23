---
name: never-drop-data
description: 'Migrations/reshapes must carry EVERY source field; "nothing consumes it" is never a reason to drop — downstream consumers are unknown'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 8937dc92-675d-41ef-8b4f-d90a8ad285d7
  modified: 2026-07-23T23:02:39.586Z
---

Never drop, defer, or silently flatten ANY authored field during a migration or reshape (grimoire→schema and beyond). If the target lacks a home for a field, ADD schema to hold it (slot/facet/child table — schema is pre-1.0, reshape freely). This has bitten repeatedly.

**Why:** downstream consumers are unknown — "nothing consumes it yet" is not the migrator's call. Data loss is irreversible, on par with duplication ([[schema-urgency]], CLAUDE.md zero-tolerance).

**How to apply:** before finishing any migration, diff source vs emitted and account for every key (a scripted key audit over gen/catalog.json). Model complexity is not an excuse; if you truly can't model it, STOP and ask — never proceed by discarding. Example: refrigerant blend `composition` → `BlendComponent` child table keyed by constituent. See [[grimoire-to-schema]].
