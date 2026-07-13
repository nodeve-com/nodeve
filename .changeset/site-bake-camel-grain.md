---
'@nodeve/grimoire': patch
---

Fix the site-bake/site-view measurand path for the camel generated grain: `isMeasurandFeature`/`quantityCols` walk `featureSpec` and camel column keys (cells still carry the snake wire codes for ids/coordinates), baked patches mirror the camel device tree (`featureSpec`, `slugQualified`), and the authored snake site overlay is key-camelized before merging onto the device. The camel TS-catalog cutover had left `bakeSite` silently minting empty patches.
