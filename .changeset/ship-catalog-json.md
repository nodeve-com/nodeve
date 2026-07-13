---
'@nodeve/grimoire': patch
---

Ship the baked catalog JSON grain (`artifacts/catalog/<slug>.json`) in the npm package, and run the generate step in `build` so publishes always carry fresh artifacts. Non-JS consumers (the Rust farana gateway's build.rs) read the register maps from the installed package instead of a GitHub-release download.
