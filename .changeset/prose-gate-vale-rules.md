---
'@nodeve/checks': minor
---

Add the org prose gate: Vale house rules shipped from `@nodeve/checks` as a Vale package. `styles/nodeve/` carries `Narration` (prose addressing a prior version — "used to", "no longer", "RESOLVED"), `Ephemeral`, `Hedging`, and `SentenceLength`; the package `.vale.ini` is the canonical severity block a consumer copies. Consumers list `node_modules/@nodeve/checks` in their Vale `Packages` and `vale sync` the styles in; the `lefthook.checks.yml` gate gains a guarded `vale` job that skips cleanly where vale isn't installed. This is a second engine — the `vale` binary — alongside the `nodeve-check` TS checks.
