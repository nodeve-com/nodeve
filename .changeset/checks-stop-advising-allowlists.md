---
'@nodeve/checks': patch
---

Failure messages say to fix the code, or to stop and report a wrong check. They don't offer a way around the gate. An exemption is the user's call, and an agent takes whatever route the failure text hands it.

The trigger: `inline-dupes` flagged a one-line prologue repeated across commands. Its message ended with how to allowlist a name, so the agent did that, with a comment arguing there was nothing to share. The gate went quiet on the exact duplication it had caught.

What goes from the messages:

- the allowlist advice in `inline-dupes`, `plural-arrays`, `reshape` and `helper-collisions`;
- the opt-out advice in `catalog`, `require-deps` and `helper-collisions`;
- the budget and scope advice in `file-size`, `page-size` and `clones`;
- the `--warn` line, from every check.

The config options and the `--warn` flag stay.
