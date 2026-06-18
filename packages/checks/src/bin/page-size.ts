#!/usr/bin/env node
/**
 * Commit gate (opt-in): fail when a file matching one of `pageSize.rules`
 * exceeds that rule's `maxLines`.
 *
 * WHY: an oversized template/module is a signal the unit is doing work that
 * belongs in dedicated files. Originally a SvelteKit `+page.svelte` cap; now any
 * glob → line budget, e.g. `{ glob: '*+page.svelte', maxLines: 280 }`.
 *
 * No-op unless a repo declares rules. Pass explicit paths (lefthook
 * `{staged_files}`) to scope; a path is checked under every rule whose glob it
 * would match via `git ls-files`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadGate } from '../lib/bin.js';
import { gitFiles } from '../lib/repo.js';

const { root, cfg, paths } = await loadGate('pageSize');

if (cfg.rules.length === 0) process.exit(0);

function lineCount(path: string): number {
	// Matches `wc -l`; prettier-formatted files end with a trailing newline,
	// so this equals the editor's visible line count.
	return readFileSync(join(root, path), 'utf8').split('\n').length - 1;
}

type Offender = { path: string; lines: number; max: number };
const offenders: Offender[] = [];
const seen = new Set<string>();

for (const rule of cfg.rules) {
	// All tracked files matching this rule's glob, intersected with explicit
	// paths (lefthook `{staged_files}`) when given.
	const matched = gitFiles(root, [rule.glob]);
	const targets = paths.length > 0 ? matched.filter((f) => paths.includes(f)) : matched;
	for (const path of targets) {
		const key = `${path}::${rule.maxLines}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const lines = lineCount(path);
		if (lines > rule.maxLines) offenders.push({ path, lines, max: rule.maxLines });
	}
}

if (offenders.length === 0) process.exit(0);

console.error('\n✖ file(s) over line budget — split work into dedicated files:\n');
for (const o of offenders.sort((a, b) => b.lines - a.lines))
	console.error(`  ${String(o.lines).padStart(5)}/${o.max}L  ${o.path}`);
console.error('');
process.exit(1);
