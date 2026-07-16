---
name: grimoire-settings-external-sensors
description: 'settings_schema will grow refs to external sensors (ESPHome-style internal-sensor-imports-external-value); condition `setting` gates keep pointing at the same keys'
metadata:
  node_type: memory
  type: project
  originSessionId: 889bd55f-a505-4f3f-b98b-424cb074f760
---

Planned (stated 2026-07-16): grimoire catalog `settings_schema` expands to reference EXTERNAL sensors — ESPHome pattern (`platform: homeassistant` import: external value surfaces as an internal sensor, downstream consumers unchanged). Condition `setting`/`equals` gates keep validating against the same keys (`kit/validate-conditions.ts`).

**Why:** one uniform gate surface; the binding (device_binding / measurand_link / external `(Class, id)` ref) is the new part, not the gate.

**How to apply:** when expanding, keep commissioning-fixed vs live-fed settings distinguishable (source marker or third condition form) — `setting` is documented as "site fixes it once". Related: [[nodeve-ecosystem]].
