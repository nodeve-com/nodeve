---
'@nodeve/checks': minor
---

doc-tokens budgets EVERY tracked `.md`, matching the prose gate's scope. The old default listed doc names (`CLAUDE.md`, `README.md`, `*/README.md`, `guide/*.md`, `docs/*.md`), so an unlisted name grew unbudgeted — `AGENTS.md`, a nested `CLAUDE.md`, a package's own `docs/` tree. Both markdown gates now answer to one contract: stage a doc and it conforms.

- An index (`README`/`CLAUDE`/`AGENTS`) fails past **1500 tokens**, half the 3000 every other doc gets. A reader opens the index before anything else, so its cost lands on every visit while a detail page costs only when opened.
- `CHANGELOG.md` ships in the default `ignore`: a generator writes it, so no amount of cutting holds it under a budget.
- Remediation leads with CUT — delete, then compress. Splitting adds a file, a link table, and re-stated context, so the check now names it as the fix for a grown INDEX alone, not for any long doc.

Two scope bugs the wider default exposed, fixed in the shared engine:

- `ignore` now filters override globs too, so it means out of scope rather than merely out of the default globs. A broad override (`*README.md`) silently readmitted an ignored tree.
- `gitFiles` drops symlinks, matching the format fixer. A link owns no content and its target is already in scope, so `CLAUDE.md` → `README.md` counted one doc's bytes twice and reported a path its author can't fix.
