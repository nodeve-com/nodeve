---
'@nodeve/checks': minor
---

Add `nodeve-check`, a single dispatcher for every check, and unify their output.

- `nodeve-check <name> [paths] [--explain]` runs one check; a bare `nodeve-check` (or `nodeve-check all`) runs the whole pre-commit suite **summary-first** — a status line per check, a tally, then a detail block for each that failed or warned; `nodeve-check list` lists them.
- Every check now renders the **same uniform block**: `<glyph> <name> — <summary>`, indented detail rows, and the check's remediation guidance — so the parallel gate's failure dump is scannable instead of a wall of per-check formats. A new `--explain` flag expands each check's bulky per-finding detail inline (clones code fragments, inline-dupes file lists), which is otherwise summarized to keep the gate output tight.
- Checks were refactored from "print + `process.exit`" into modules that return a structured `CheckResult`, with one shared reporter; behavior and exit codes are unchanged. The per-check `nodeve-check-<name>` bins remain for direct invocation, and `lefthook.checks.yml` now shells `nodeve-check <name>` per job (consumers pick it up from the existing `extends` line; run `pnpm install` to materialize the new bin).
- The high-volume checks now lead with identifiers, not evidence: `clones` shows each duplicate's two `file:line-range` locations (the shared code fragment only under `--explain`), and `inline-dupes` shows each name + its file count (the full file list only under `--explain`). On a repo with many findings this is the difference between a scannable list and a thousand-line wall — the line ranges already point at the code.
