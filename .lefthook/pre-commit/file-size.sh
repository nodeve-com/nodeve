#!/usr/bin/env bash
# File-size gate for repos that pull in hooks/lefthook.yml. Same budgets and scope
# as @nodeve/checks file-size: every staged source file (ts js mjs svelte rs py)
# fails past 300 lines; past 225 it warns. Declarations (.d.ts) and symlinks skip.
#
# Over budget: one file is doing several jobs — split by responsibility. A
# long-but-cohesive file is the user's call to exempt, never a silent bypass.
set -euo pipefail

WARN_LINES=225
FAIL_LINES=300

fail=0
warn=0
while IFS= read -r f; do
  [ -f "$f" ] && [ ! -L "$f" ] || continue
  case "$f" in *.d.ts) continue ;; esac
  lines=$(wc -l <"$f" | tr -d ' ')
  if ((lines > FAIL_LINES)); then
    printf '  %s  %d lines (max %d)\n' "$f" "$lines" "$FAIL_LINES"
    fail=1
  elif ((lines > WARN_LINES)); then
    printf '  %s  %d lines (soft max %d)\n' "$f" "$lines" "$WARN_LINES"
    warn=1
  fi
done < <(git diff --cached --name-only --diff-filter=ACMR -- '*.ts' '*.js' '*.mjs' '*.svelte' '*.rs' '*.py')

if ((fail)); then
  echo "✖ file-size: files over the line budget — split by responsibility"
  exit 1
fi
((warn)) && echo "⚠ file-size: over the soft budget — worth a look"
exit 0
