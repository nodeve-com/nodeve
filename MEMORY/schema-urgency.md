---
name: schema-urgency
description: "@nodeve/schema is an urgent grimoire replacement — pre-1.0, break freely, land working over land clean"
metadata:
  node_type: memory
  type: project
  originSessionId: f60940d4-228b-4bfc-9cc1-82396c145939
  modified: 2026-07-21T11:43:09.255Z
---

grimoire is broken; the LinkML rewrite in `packages/schema` is the replacement,
and as of 2026-07 it is weeks behind a needed date. grimoire never reached a
working state, so nothing depends on the new schema yet.

**Why:** the constraint is time-to-working, not polish. Pre-1.0 with zero
downstream consumers means breaking changes cost nothing — no migrations, no
deprecation path.

**How to apply:** propose the reshape, not the compatible patch. Don't scope
down a fix to avoid breaking things, and don't leave a design flaw as an "open
item" out of caution — flag it or fix it. Do keep surfacing what was left
undone; speed is the goal, silence about gaps is not. See
[[grimoire-shape-slop-cleanup]], [[nodeve-identity-model]].
