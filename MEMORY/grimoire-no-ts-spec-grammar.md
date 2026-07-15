---
name: grimoire-no-ts-spec-grammar
description: Hand-written TS interfaces for the spec/measurand grammar are forbidden in grimoire — the YAML concepts are the only source
metadata:
  node_type: memory
  type: feedback
  originSessionId: 829d92fc-49c5-4fe3-957b-d356c954d18e
---

Hand-authoring the spec grammar as TS interfaces in grimoire is strictly forbidden — e.g. declaring `SpecInterval`, `SpecIntervalEntry`, `MeasurandColumn`, `FeatureSpec` in `src/measurand-tree.ts` and re-exporting them from `src/index.ts`.

**Why:** the grammar is authored once as YAML under `concepts/` (`features/feature_spec.yaml`, `features/interval.yaml`); `pnpm generate` projects it to `src/generated/`. A parallel TS declaration of the same shape is a second source of truth that drifts silently from the YAML. Same principle as [[no-inline-string-vocab]] and [[grimoire-ts-camel-only]] — derive from the authoritative source, never restate it.

**How to apply:** to type a spec/measurand read, import the generated type from `src/generated/`. If the shape you need isn't generated, fix the YAML + codegen — do not hand-write the interface. A comment claiming "the typed spec grammar … consumers type their reads with THESE" is the smell.
