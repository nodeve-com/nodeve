#!/usr/bin/env bash
# Doc-size gate for repos that pull in hooks/lefthook.yml. Same budgets as
# @nodeve/checks doc-tokens: every staged .md stays under 150 lines and 3000
# tokens; an index doc (README/CLAUDE/AGENTS.md) gets 1500 tokens, since it's read
# on every visit. CHANGELOG.md and symlinks are skipped.
#
# Tokens are o200k_base (token-count --model gpt-4o), the tokenizer doc-tokens
# uses. token-count ships in nix-config's dev module.
#
# Over budget: cut words first. Split only an index that grew — move each section
# to its own page and leave one link line.
set -euo pipefail

MAX_LINES=150
MAX_TOKENS=3000
INDEX_TOKENS=1500

command -v token-count >/dev/null || { echo "✖ doc-size: token-count not on PATH (nix-config infra.dev installs it)"; exit 1; }

fail=0
while IFS= read -r f; do
  [ -f "$f" ] && [ ! -L "$f" ] || continue
  case "$(basename "$f")" in
    CHANGELOG.md) continue ;;
    README.md | CLAUDE.md | AGENTS.md) max_tokens=$INDEX_TOKENS ;;
    *) max_tokens=$MAX_TOKENS ;;
  esac
  lines=$(wc -l <"$f" | tr -d ' ')
  tokens=$(token-count --model gpt-4o <"$f")
  if ((lines > MAX_LINES || tokens > max_tokens)); then
    printf '  %s  %d lines (max %d), %d tokens (max %d)\n' "$f" "$lines" "$MAX_LINES" "$tokens" "$max_tokens"
    fail=1
  fi
done < <(git diff --cached --name-only --diff-filter=ACMR -- '*.md')

if ((fail)); then
  echo "✖ doc-size: docs over budget — cut words; split only an index that grew"
  exit 1
fi
