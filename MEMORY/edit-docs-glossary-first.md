---
name: edit-docs-glossary-first
description: 'schema docs — edit the existing doc, never create a new one; every term lives in docs/glossary.md first; doc work lands one step at a time for review'
metadata:
  node_type: memory
  type: feedback
  originSessionId: ab5e537d-c101-4a1f-8164-2cd3d6264c79
  modified: 2026-09-19T12:13:08.043Z
---

`packages/schema/docs/glossary.md` is where a word's meaning lives. A term qualifies only when a published standard uses it for this thing. Design prose goes into the doc closest to the direction (decode = `docs/decode.md`); never add a new doc beside it.

**Why:** agents kept creating docs instead of editing (decode.md, decode-model.md, device-pipeline.md: three vocabularies for one design), and undefined terms bred verbosity. The user reviews each doc change before the next.

**How to apply:** define or fix the term in the glossary first, then edit the one doc. One step per turn; stop for review. Decided 2026-09-19: target → `observes` (SOSA). See [[schema-urgency]].
