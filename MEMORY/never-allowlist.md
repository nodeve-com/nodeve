---
name: never-allowlist
description: 'Never add entries to a check allowlist yourself — surface the finding, let the user decide'
metadata:
  node_type: memory
  type: feedback
  originSessionId: f2e51b0c-5598-4518-af7c-e79c616dcf9c
---

Never add an entry to any `nodeve.checks.js` allowlist (`inlineDupes.allowlist`, `pluralArrays.allowlist`, `reshape.allowlist`, etc.) on your own — not even "with a WHY comment", not even for an obvious false positive.

**Why:** Allowlisting is the user's judgment call. Auto-allowlisting silences a real gate and buries the decision. Suppressing a finding is not fixing it.

**How to apply:** When a check flags something, either fix the code so it passes, or surface the finding and stop — let the user allowlist it themselves. Do not offer "allowlist all" as an option you'll execute. Relates to [[nodeve-checks]].
