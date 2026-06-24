---
'@nodeve/checks': patch
---

The clone-detection gate now uses jscpd's `consoleFull` reporter, so a failing run prints each duplicated block with both file locations and the offending code inline instead of just a summary table.
