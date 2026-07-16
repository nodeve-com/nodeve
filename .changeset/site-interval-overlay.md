---
'@nodeve/grimoire': minor
---

Site-authored feature_spec deltas + interval segment in the id grammar.

- `bakeSite` now OVERLAYS site-authored keys onto the generated slug patch (shared `overlayPatch`, extracted to `src/overlay.ts`) instead of shallow-assigning — a site block naming a measurand feature (custom `intervals` bands, combined or per-leg) merges into that feature's patch; slugged interval arrays append by `identity.slug` at read time, so a site adds bands the datasheet doesn't carry (e.g. `grid_neutral` on `active_power`) without clobbering baked sensor slugs.
- `sensorId` grammar grows a trailing `interval` segment (`… quantity_kind ⊕ interval`) — the id of a quantity's derived in-band boolean. New `intervalSensorId(sensorSlug, intervalSlug)` composes it from a baked `slug`/`slugQualified` so consumers never hand-spell the join.
