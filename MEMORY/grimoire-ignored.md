---
name: grimoire-ignored
description: "@nodeve/grimoire is being replaced by @nodeve/schema — ignore its failures, don't fix or report them"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 3b94352b-42c1-40a5-80fb-5ebb9f42953e
  modified: 2026-07-21T18:21:08.885Z
---

`@nodeve/grimoire` is on the way out ([[schema-urgency]] — `@nodeve/schema` replaces it).

**Why:** effort spent on grimoire (typecheck errors, checks, cleanup) is wasted; user said "grimoire should be ignored" when a repo-wide typecheck failed there.

**How to apply:** skip grimoire in verification sweeps and don't flag its pre-existing failures; use `pnpm --filter` to scope typecheck/test to the packages actually touched.
