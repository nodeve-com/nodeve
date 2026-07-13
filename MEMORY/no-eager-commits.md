---
name: no-eager-commits
description: "Don't commit incrementally — user says when the work is done; leave changes in the working tree"
metadata:
  node_type: memory
  type: feedback
  originSessionId: fbf99423-6718-4af1-a45a-2845fd676a25
---

Do not commit after each sub-task. Leave everything uncommitted until the user says it's done.

**Why:** User iterates mid-task (renames, relocations, API reshapes); eager commits litter history with superseded states.

**How to apply:** Make changes, run checks, report — no `git commit` until explicitly told. Related: [[nodeve-release-flow]].
