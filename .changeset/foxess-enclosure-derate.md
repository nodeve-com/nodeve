---
'@nodeve/schema': patch
---

Fix the FoxESS H3 temperature model. The thermal ladder (continuous ⊂ intermittent ⊂ survival) sat on a separate `environment/ambient` feature while the sensor stayed on `environment/enclosure`. So the AC active-power derates gated on bands nothing reads: the box exposes no ambient probe, only its own internal temperature (`invtemp`, register 39141). Bands and sensor share one `enclosure` feature again, and the derate conditions point at it.
