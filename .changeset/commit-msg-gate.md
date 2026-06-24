---
'@nodeve/checks': minor
---

Add `nodeve-check-commit-msg`: a Conventional Commits gate on the `commit-msg` hook. It validates the header (`<type>(<scope>)!: <subject>` against the standard type set and a subject-length cap) and requires a body once the staged diff grows past `commitMsg.bodyRequiredOverLines` (default 50) changed lines — so non-trivial commits explain the why. Merge/revert/fixup messages are skipped; `commitMsg.enforce: false` opts out. Wired in via the shared `lefthook.checks.yml`, so consumers pick it up from the existing `extends` line (run `lefthook install` once to register the new hook).
