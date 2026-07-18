---
name: grimoire-display-policy-debt
description: "display-policy/ is flagged debt — a generator input outside concepts/, to be moved soon"
metadata: 
  node_type: memory
  type: project
  originSessionId: ce1a4cac-39f4-4e10-a57a-931dcdeef2ba
---

grimoire's `display-policy/sensors.yaml` is the ONE generator input outside `concepts/` — user (2026-07-17) called it a scope mistake that "shouldn't have been allowed through" and wants it MOVED soon (fold into the concept model, e.g. ui/display fields on quantity enumerations, or evict downstream); no energy to do it now. Flagged as `TODO(move-display-policy)` in `kit/generate.ts`. After the move, add a guard: generator reads YAML from `concepts/` only. Related: [[grimoire-settings-external-sensors]], [[never-allowlist]].
