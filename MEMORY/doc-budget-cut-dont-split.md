---
name: doc-budget-cut-dont-split
description: 'Over-budget docs get CUT, not split — splitting raises total tokens; split only a grown index (target 1500 tokens)'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 4c39114b-894d-421f-b3d9-559377373246
  modified: 2026-07-27T13:47:56.951Z
---

Over a doc budget, CUT: delete what isn't load-bearing, then compress. Do NOT reach for "split into an index plus detail pages" as the default remedy.

**Why:** the goal is FEWER tokens, not smaller individual files. Splitting mints a new file, a link table, and re-stated context, so the total goes UP. Left to itself AI always writes more, and it has no reliable way to compress a document. A remediation that reads as "reorganize" turns into a token increase every time.

**How to apply:** split only when what grew is an INDEX (README/CLAUDE/AGENTS). A reader loads that one on every visit, so moving a section to the page that owns it and leaving one line per link genuinely cuts what they pay. Index target is **1500 tokens**, half the 3000 a detail page gets; the gate in [[nodeve-checks]] enforces both. Trading a fat doc for a fat doc plus an index is a loss.
