---
name: no-inline-string-vocab
description: Inline string-array/Set vocabularies in code are a total failure — derive from the authoritative source instead
metadata:
  node_type: memory
  type: feedback
  originSessionId: 4268b5ea-4d78-49b6-9af1-d4b4a6c6d3dd
---

Never hardcode an inline array/Set of strings as a vocabulary (keyword lists, name lists, reserved words). Caught writing `new Set(['allOf','anyOf',...])` in grimoire's emitter — user: "Any inline array of strings is a total failure."

**Why:** it restates knowledge that has an authoritative home (a standard's meta-schema, authored concept data, an existing module) — a silent local dialect that drifts. Same spirit as [[never-allowlist]].

**How to apply:** find the source that already defines the vocabulary and derive from it (e.g. draft-07 keyword grammar from the meta-schema; repo vocab from concepts/enumeration). If no source exists, surface that to the user instead of inventing a list.
