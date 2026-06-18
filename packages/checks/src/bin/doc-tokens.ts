#!/usr/bin/env node
/**
 * Commit gate: fail when a guarded markdown file is over its line or token budget.
 *
 * WHY: always-loaded / frequently-linked docs cost tokens and attention. Caps
 * enforce the terse-docs convention ("past ~150 lines, split into a dir with an
 * index") mechanically. Tokens are the better proxy — a dense paragraph costs
 * more than the same lines of bullets — so both dimensions are bounded.
 *
 * Tokenizer is js-tiktoken `o200k_base` (OpenAI BPE). Claude's is unpublished
 * and differs, so this is a stable *proxy* for budgeting, not an exact count —
 * good enough to catch bloat, consistent run-to-run.
 *
 * Scope: `docTokens.enforce` globs (default CLAUDE.md + guide/ + docs/) is what
 * the gate fails on. `--report` lists every over-budget file without failing —
 * the backlog worklist. Pass explicit paths to check only those (lefthook
 * `{staged_files}`). Scoping is via `git ls-files` — gitignored paths are never
 * measured unless passed explicitly.
 */
import { getEncoding } from 'js-tiktoken';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, parseArgs, type Budget } from '../lib/config.js';
import { gitFiles, repoRoot } from '../lib/repo.js';

const root = repoRoot();
const cfg = (await loadConfig(root)).docTokens;
const { paths, report } = parseArgs(process.argv.slice(2));

const DEFAULT: Budget = { maxLines: cfg.maxLines, maxTokens: cfg.maxTokens };
const enc = getEncoding('o200k_base');

function measure(path: string) {
	const text = readFileSync(join(root, path), 'utf8');
	return {
		path,
		lines: text.split('\n').length - 1,
		tokens: enc.encode(text).length,
		limit: { ...DEFAULT, ...cfg.overrides[path] },
	};
}

type Measured = ReturnType<typeof measure>;

function overBudget({ lines, tokens, limit }: Measured): boolean {
	return lines > limit.maxLines || tokens > limit.maxTokens;
}

function formatRow({ path, lines, tokens, limit }: Measured): string {
	const flags = [
		lines > limit.maxLines ? `${lines}/${limit.maxLines}L` : null,
		tokens > limit.maxTokens ? `${tokens}/${limit.maxTokens}T` : null,
	]
		.filter(Boolean)
		.join(' ');
	return `  ${flags.padEnd(22)} ${path}`;
}

const scope = paths.length > 0 ? paths : gitFiles(root, cfg.enforce);
const offenders = scope
	.map(measure)
	.filter(overBudget)
	.sort((a, b) => b.tokens - a.tokens);

if (report) {
	console.log(
		`Doc-size backlog (limit ${DEFAULT.maxLines}L / ${DEFAULT.maxTokens}T) — ${offenders.length} over:`,
	);
	for (const o of offenders) console.log(formatRow(o));
	process.exit(0);
}

if (offenders.length > 0) {
	console.error(
		`\n✖ markdown over budget (${DEFAULT.maxLines} lines / ${DEFAULT.maxTokens} tokens) — split into a dir with an index:\n`,
	);
	for (const o of offenders) console.error(formatRow(o));
	console.error('');
	process.exit(1);
}
